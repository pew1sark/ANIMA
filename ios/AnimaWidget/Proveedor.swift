import WidgetKit

struct FilaPanel: Identifiable {
    let titulo: String
    let cifra: Cifra
    var id: String { titulo }
}

struct Entrada: TimelineEntry {
    let date: Date
    let config: ConfigurarAnima
    let empresa: String?
    let resumen: Resumen?
    /// Solo en el panel general: lo más relevante de cada módulo.
    var panel: [FilaPanel] = []
    /// Mensaje en vez de datos: sin sesión, sin empresa o sin red.
    let aviso: String?
}

struct Proveedor: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> Entrada { ejemplo(ConfigurarAnima()) }

    func snapshot(for configuration: ConfigurarAnima, in context: Context) async -> Entrada {
        context.isPreview ? ejemplo(configuration) : await cargar(configuration)
    }

    func timeline(for configuration: ConfigurarAnima, in context: Context) async -> Timeline<Entrada> {
        let e = await cargar(configuration)
        // iOS reparte el presupuesto de refrescos; pedir 30 min es lo razonable.
        // Si falló, se reintenta antes para no dejar un aviso viejo en pantalla.
        let siguiente = Date().addingTimeInterval(e.aviso == nil ? 30 * 60 : 10 * 60)
        return Timeline(entries: [e], policy: .after(siguiente))
    }

    private func cargar(_ c: ConfigurarAnima) async -> Entrada {
        guard AlmacenSesion.leer() != nil else {
            return Entrada(date: .now, config: c, empresa: nil, resumen: nil, aviso: "Abre ANIMA e inicia sesión")
        }
        guard let id = Preferencias.empresaId else {
            return Entrada(date: .now, config: c, empresa: nil, resumen: nil, aviso: "Elige una empresa en la app")
        }
        if c.vista == .panel { return await cargarPanel(c, empresa: id) }
        do {
            let r = try await ClienteAnima.resumen(empresa: id, modulo: c.vista.modulo)
            return Entrada(date: .now, config: c, empresa: Preferencias.empresaNombre, resumen: r, aviso: nil)
        } catch {
            return Entrada(date: .now, config: c, empresa: Preferencias.empresaNombre, resumen: nil,
                           aviso: (error as? ErrorAnima)?.errorDescription ?? "Sin conexión")
        }
    }

    /* El monitoreo: de cada módulo sube la cifra que pide atención (tono malo o
       aviso: deuda, tareas vencidas) y, si no hay ninguna, la primera. Así el
       panel enseña lo que se está torciendo y no un conteo cualquiera. Los
       módulos que el plan no incluye devuelven `{}` y simplemente no aparecen. */
    private func cargarPanel(_ c: ConfigurarAnima, empresa id: String) async -> Entrada {
        var filas: [(Int, FilaPanel)] = []
        var fallo: Error?
        await withTaskGroup(of: (Int, FilaPanel?, Error?).self) { grupo in
            for (i, v) in Vista.modulosDelPanel.enumerated() {
                grupo.addTask {
                    do {
                        let r = try await ClienteAnima.resumen(empresa: id, modulo: v.modulo)
                        let cifra = r.cifras.first { $0.tono == .malo && $0.valor > 0 }
                            ?? r.cifras.first { $0.tono == .aviso && $0.valor > 0 }
                            ?? r.cifras.first
                        return (i, cifra.map { FilaPanel(titulo: v.titulo, cifra: $0) }, nil)
                    } catch { return (i, nil, error) }
                }
            }
            for await (i, fila, e) in grupo {
                if let fila { filas.append((i, fila)) }
                if let e { fallo = e }
            }
        }
        let ordenadas = filas.sorted { $0.0 < $1.0 }.map(\.1)
        if ordenadas.isEmpty {
            return Entrada(date: .now, config: c, empresa: Preferencias.empresaNombre, resumen: nil,
                           aviso: (fallo as? ErrorAnima)?.errorDescription ?? "Sin datos para mostrar")
        }
        return Entrada(date: .now, config: c, empresa: Preferencias.empresaNombre, resumen: Resumen(),
                       panel: ordenadas, aviso: nil)
    }

    /// Datos falsos para la galería de widgets; nada sale del teléfono.
    private func ejemplo(_ c: ConfigurarAnima) -> Entrada {
        var r = Resumen()
        r.cifras = [Cifra(etiqueta: "Activos", valor: 128, formato: .numero),
                    Cifra(etiqueta: "Nuevos 30 d", valor: 9, formato: .numero),
                    Cifra(etiqueta: "Con deuda", valor: 4, formato: .numero, tono: .aviso)]
        r.listas = [ListaResumen(
            titulo: "Quién compra más",
            columnas: [ColumnaLista(k: "n", t: "Cliente"), ColumnaLista(k: "v", t: "Ventas", formato: .dinero)],
            filas: [["n": .texto("Cliente A"), "v": .numero(2_400_000)],
                    ["n": .texto("Cliente B"), "v": .numero(1_150_000)],
                    ["n": .texto("Cliente C"), "v": .numero(830_000)]])]
        let panel = [FilaPanel(titulo: "Clientes", cifra: Cifra(etiqueta: "Con deuda", valor: 4, formato: .numero, tono: .aviso)),
                     FilaPanel(titulo: "Ventas", cifra: Cifra(etiqueta: "Vendido en el mes", valor: 5_200_000, formato: .dinero)),
                     FilaPanel(titulo: "Proyectos", cifra: Cifra(etiqueta: "Activos", valor: 7, formato: .numero)),
                     FilaPanel(titulo: "Actividades", cifra: Cifra(etiqueta: "Tareas vencidas", valor: 2, formato: .numero, tono: .malo))]
        return Entrada(date: .now, config: c, empresa: "Mi empresa", resumen: r, panel: panel, aviso: nil)
    }
}
