import WidgetKit

struct Entrada: TimelineEntry {
    let date: Date
    let config: ConfigurarAnima
    let empresa: String?
    let resumen: Resumen?
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
        do {
            let r = try await ClienteAnima.resumen(empresa: id, modulo: c.vista.modulo)
            return Entrada(date: .now, config: c, empresa: Preferencias.empresaNombre, resumen: r, aviso: nil)
        } catch {
            return Entrada(date: .now, config: c, empresa: Preferencias.empresaNombre, resumen: nil,
                           aviso: (error as? ErrorAnima)?.errorDescription ?? "Sin conexión")
        }
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
        return Entrada(date: .now, config: c, empresa: "Mi empresa", resumen: r, aviso: nil)
    }
}
