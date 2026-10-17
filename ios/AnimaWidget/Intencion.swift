import AppIntents
import SwiftUI
import WidgetKit

/* Lo que la persona personaliza al mantener presionado el widget → Editar. */
enum Vista: String, AppEnum {
    case panel, clientes, ventas, proyectos, agenda

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Qué mostrar"
    static var caseDisplayRepresentations: [Vista: DisplayRepresentation] = [
        .panel: "Panel general", .clientes: "Clientes", .ventas: "Ventas", .proyectos: "Proyectos", .agenda: "Actividades"
    ]

    /// Slug del módulo que entiende `resumen_modulo()`. El panel no es un módulo:
    /// junta los cuatro y se ocupa aparte.
    var modulo: String {
        switch self {
        case .panel, .clientes: "crm"
        case .ventas: "commerce"
        case .proyectos: "creator"
        case .agenda: "agenda"
        }
    }
    var titulo: String {
        switch self {
        case .panel: "Panel"
        case .clientes: "Clientes"
        case .ventas: "Ventas"
        case .proyectos: "Proyectos"
        case .agenda: "Actividades"
        }
    }
    static let modulosDelPanel: [Vista] = [.clientes, .ventas, .proyectos, .agenda]
}

enum Acento: String, AppEnum {
    case grafito, ambar, salvia, cielo

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Acento"
    static var caseDisplayRepresentations: [Acento: DisplayRepresentation] = [
        .grafito: "Grafito", .ambar: "Ámbar", .salvia: "Salvia", .cielo: "Cielo"
    ]
    var color: Color {
        switch self {
        case .grafito: Color(white: 0.45)
        case .ambar: Color(red: 0.85, green: 0.58, blue: 0.20)
        case .salvia: Color(red: 0.42, green: 0.62, blue: 0.50)
        case .cielo: Color(red: 0.35, green: 0.55, blue: 0.82)
        }
    }
}

struct ConfigurarAnima: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "ANIMA"
    static var description = IntentDescription("Elige qué mirar y cómo se ve.")

    @Parameter(title: "Qué mostrar", default: .panel) var vista: Vista
    @Parameter(title: "Acento", default: .grafito) var acento: Acento
    @Parameter(title: "Mostrar lista", default: true) var mostrarLista: Bool
}
