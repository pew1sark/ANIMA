import SwiftUI
import WidgetKit

@main
struct AnimaApp: App {
    var body: some Scene { WindowGroup { Raiz() } }
}

/* La app existe para dos cosas: iniciar sesión y elegir la empresa que mira el
   widget. Todo lo demás se hace en animatsc.com/app/. */
struct Raiz: View {
    @State private var sesionActiva = AlmacenSesion.leer() != nil
    @State private var correo = ""
    @State private var contrasena = ""
    @State private var empresas: [Empresa] = []
    @State private var elegida = Preferencias.empresaId
    @State private var error: String?
    @State private var cargando = false

    var body: some View {
        NavigationStack {
            Form {
                if sesionActiva {
                    Section("Empresa del widget") {
                        ForEach(empresas) { e in
                            Button { elegir(e) } label: {
                                HStack { Text(e.name); Spacer(); if e.id == elegida { Image(systemName: "checkmark") } }
                            }.foregroundStyle(.primary)
                        }
                    }
                    Section { Button("Cerrar sesión", role: .destructive, action: salir) }
                } else {
                    Section("Inicia sesión") {
                        TextField("Correo", text: $correo).textContentType(.username)
                            .keyboardType(.emailAddress).textInputAutocapitalization(.never)
                        SecureField("Contraseña", text: $contrasena).textContentType(.password)
                        Button(cargando ? "Entrando…" : "Entrar", action: entrar).disabled(cargando || correo.isEmpty)
                    }
                }
                if let error { Section { Text(error).foregroundStyle(.red).font(.footnote) } }
            }
            .navigationTitle("ANIMA")
            .task { if sesionActiva { await cargarEmpresas() } }
        }
    }

    private func entrar() {
        cargando = true; error = nil
        Task {
            defer { cargando = false }
            do {
                _ = try await ClienteAnima.entrar(correo: correo, contrasena: contrasena)
                contrasena = ""; sesionActiva = true
                await cargarEmpresas()
            } catch { self.error = error.localizedDescription }
        }
    }

    private func cargarEmpresas() async {
        do {
            empresas = try await ClienteAnima.empresas()
            // Con una sola empresa no hay nada que elegir.
            if elegida == nil, empresas.count == 1 { elegir(empresas[0]) }
        } catch {
            self.error = error.localizedDescription
            sesionActiva = AlmacenSesion.leer() != nil
        }
    }

    private func elegir(_ e: Empresa) {
        elegida = e.id
        Preferencias.empresaId = e.id
        Preferencias.empresaNombre = e.name
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func salir() {
        AlmacenSesion.borrar()
        Preferencias.empresaId = nil; Preferencias.empresaNombre = nil
        sesionActiva = false; empresas = []; elegida = nil
        WidgetCenter.shared.reloadAllTimelines()
    }
}
