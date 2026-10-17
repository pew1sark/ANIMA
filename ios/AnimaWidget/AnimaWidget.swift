import SwiftUI
import WidgetKit

struct AnimaWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "AnimaWidget", intent: ConfigurarAnima.self, provider: Proveedor()) { e in
            VistaAnima(e: e)
        }
        .configurationDisplayName("ANIMA")
        .description("Clientes, ventas, proyectos y actividades de tu empresa, de un vistazo.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main
struct AnimaWidgetBundle: WidgetBundle {
    var body: some Widget { AnimaWidget() }
}
