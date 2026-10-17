import Foundation

/* Único punto donde se leen los valores de entorno, igual que `config/env.ts`
   en la plataforma. Vienen de `Config.xcconfig` (que no se versiona) a través
   del Info.plist: el repo es público y la URL/clave de cada ambiente no se
   escribe aquí. La clave anónima es pública por diseño; igual, queda fuera. */
enum Configuracion {
    private static func valor(_ clave: String) -> String {
        guard let v = Bundle.main.object(forInfoDictionaryKey: clave) as? String, !v.isEmpty else {
            fatalError("Falta \(clave) en Info.plist. Copia Config.example.xcconfig a Config.xcconfig.")
        }
        return v
    }

    static var supabaseURL: URL { URL(string: "https://" + valor("ANIMA_SUPABASE_HOST"))! }
    static var anonKey: String { valor("ANIMA_SUPABASE_ANON_KEY") }
    /// Misma App Group en la app y en el widget: por ahí viaja la elección de empresa.
    static var appGroup: String { valor("ANIMA_APP_GROUP") }
    static let plataforma = URL(string: "https://animatsc.com/app/")!
}
