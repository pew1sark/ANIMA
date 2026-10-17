import Foundation

/* La respuesta de `resumen_modulo()` tiene una forma genérica: cifras, series y
   listas. El widget la dibuja sin saber de qué módulo viene, así que un módulo
   nuevo no exige tocar Swift. */

enum Formato: String, Codable { case dinero, numero, porcentaje, fecha, dias, mes, meses, texto }
enum Tono: String, Codable { case ok, aviso, malo }

struct Cifra: Codable, Identifiable {
    var etiqueta: String
    var valor: Double
    var formato: Formato?
    var nota: String?
    var tono: Tono?
    var id: String { etiqueta }

    /// Tolerante: un valor nulo o raro no debe tumbar el resumen entero.
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        etiqueta = (try? c.decode(String.self, forKey: .etiqueta)) ?? ""
        valor = (try? c.decode(Double.self, forKey: .valor)) ?? 0
        formato = try? c.decode(Formato.self, forKey: .formato)
        nota = try? c.decode(String.self, forKey: .nota)
        tono = try? c.decode(Tono.self, forKey: .tono)
    }
    init(etiqueta: String, valor: Double, formato: Formato? = nil, nota: String? = nil, tono: Tono? = nil) {
        self.etiqueta = etiqueta; self.valor = valor; self.formato = formato; self.nota = nota; self.tono = tono
    }
    enum K: String, CodingKey { case etiqueta, valor, formato, nota, tono }
}

struct ColumnaLista: Codable { var k: String; var t: String; var formato: Formato?; var tono: Tono? }

/// Una celda puede ser texto o número; el servidor no promete cuál.
enum Celda: Codable {
    case texto(String), numero(Double), vacio
    init(from d: Decoder) throws {
        let c = try d.singleValueContainer()
        if let n = try? c.decode(Double.self) { self = .numero(n) }
        else if let s = try? c.decode(String.self) { self = .texto(s) }
        else { self = .vacio }
    }
    func encode(to e: Encoder) throws {
        var c = e.singleValueContainer()
        switch self { case .texto(let s): try c.encode(s); case .numero(let n): try c.encode(n); case .vacio: try c.encodeNil() }
    }
}

struct ListaResumen: Codable {
    var titulo: String
    var columnas: [ColumnaLista]
    var filas: [[String: Celda]]
}

struct Resumen: Codable {
    var cifras: [Cifra] = []
    var listas: [ListaResumen] = []
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        cifras = (try? c.decode([Cifra].self, forKey: .cifras)) ?? []
        listas = (try? c.decode([ListaResumen].self, forKey: .listas)) ?? []
    }
    enum K: String, CodingKey { case cifras, listas }
}

struct Empresa: Codable, Identifiable, Hashable { var id: String; var name: String }

/* Cómo se escribe cada número. Es el espejo de `lib/formato.ts`. */
enum Escribir {
    private static let clp: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "es_CL"); f.numberStyle = .currency
        f.currencyCode = "CLP"; f.maximumFractionDigits = 0
        return f
    }()

    /// Compacto, porque en un widget "$12.345.678" no cabe: $12,3 M.
    static func compacto(_ v: Double, _ f: Formato?) -> String {
        switch f ?? .numero {
        case .dinero:
            let a = abs(v)
            if a >= 1_000_000 { return "$" + String(format: "%.1f", v / 1_000_000).replacingOccurrences(of: ".", with: ",") + " M" }
            if a >= 10_000 { return "$" + String(Int(v / 1_000)) + " mil" }
            return clp.string(from: v as NSNumber) ?? "$\(Int(v))"
        case .porcentaje: return String(Int(v.rounded())) + "%"
        case .dias: return String(Int(v)) + " d"
        case .meses: return String(Int(v)) + " m"
        default: return String(Int(v.rounded()))
        }
    }

    static func celda(_ c: Celda?, _ f: Formato?) -> String {
        switch c {
        case .texto(let s): return s
        case .numero(let n): return compacto(n, f)
        default: return "—"
        }
    }
}
