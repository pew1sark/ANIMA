import SwiftUI
import WidgetKit

/* Minimalista a propósito: una cifra grande, dos pequeñas, y una lista corta
   que solo aparece si hay espacio. El color solo marca lo que importa (tono). */

private extension Tono {
    var color: Color {
        switch self {
        case .ok: Color(red: 0.35, green: 0.65, blue: 0.45)
        case .aviso: Color(red: 0.85, green: 0.58, blue: 0.20)
        case .malo: Color(red: 0.80, green: 0.30, blue: 0.30)
        }
    }
}

struct VistaAnima: View {
    let e: Entrada
    @Environment(\.widgetFamily) private var familia

    private var acento: Color { e.config.acento.color }

    var body: some View {
        Group {
            if let aviso = e.aviso { avisoView(aviso) } else if let r = e.resumen { contenido(r) }
        }
        .containerBackground(.background, for: .widget)
        .widgetURL(Configuracion.plataforma)
    }

    private func avisoView(_ t: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            cabecera
            Spacer()
            Text(t).font(.footnote).foregroundStyle(.secondary)
        }
    }

    private var cabecera: some View {
        HStack(spacing: 6) {
            Circle().fill(acento).frame(width: 7, height: 7)
            Text(e.config.vista.titulo.uppercased()).font(.caption2.weight(.semibold)).tracking(1)
            Spacer(minLength: 0)
            if familia != .systemSmall, let n = e.empresa {
                Text(n).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
        }
    }

    @ViewBuilder
    private func contenido(_ r: Resumen) -> some View {
        let cifras = Array(r.cifras.prefix(familia == .systemSmall ? 2 : 4))
        VStack(alignment: .leading, spacing: 10) {
            cabecera
            if let principal = cifras.first {
                VStack(alignment: .leading, spacing: 0) {
                    Text(Escribir.compacto(principal.valor, principal.formato))
                        .font(.system(size: familia == .systemSmall ? 34 : 40, weight: .semibold, design: .rounded))
                        .foregroundStyle(principal.tono?.color ?? .primary)
                        .minimumScaleFactor(0.6).lineLimit(1)
                    Text(principal.etiqueta).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            if familia != .systemSmall {
                HStack(alignment: .top, spacing: 16) {
                    ForEach(cifras.dropFirst()) { c in
                        VStack(alignment: .leading, spacing: 0) {
                            Text(Escribir.compacto(c.valor, c.formato)).font(.headline)
                                .foregroundStyle(c.tono?.color ?? .primary)
                            Text(c.etiqueta).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                }
            } else if cifras.count > 1 {
                Text("\(cifras[1].etiqueta): \(Escribir.compacto(cifras[1].valor, cifras[1].formato))")
                    .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
            if familia == .systemLarge, e.config.mostrarLista, let l = r.listas.first {
                Divider()
                lista(l, filas: 5)
            }
            Spacer(minLength: 0)
        }
    }

    private func lista(_ l: ListaResumen, filas: Int) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(l.titulo).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            ForEach(Array(l.filas.prefix(filas).enumerated()), id: \.offset) { _, fila in
                HStack {
                    if let a = l.columnas.first {
                        Text(Escribir.celda(fila[a.k], a.formato)).font(.footnote).lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    if let b = l.columnas.last, l.columnas.count > 1 {
                        Text(Escribir.celda(fila[b.k], b.formato)).font(.footnote.monospacedDigit())
                            .foregroundStyle(b.tono?.color ?? .secondary)
                    }
                }
            }
        }
    }
}
