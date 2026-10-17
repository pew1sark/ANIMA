import Foundation
import Security

/* La sesión vive en el Keychain compartido (mismo grupo en app y widget), no en
   UserDefaults: el refresh token es una credencial. El widget la renueva solo
   cuando vence, así no obliga a abrir la app. */
struct Sesion: Codable {
    var accessToken: String
    var refreshToken: String
    var expira: Date
    var usuarioId: String

    var vigente: Bool { expira.timeIntervalSinceNow > 60 }
}

enum AlmacenSesion {
    private static let servicio = "cl.animatsc.sesion"

    private static var consulta: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: servicio,
         kSecAttrAccount as String: "actual"]
    }

    static func leer() -> Sesion? {
        var q = consulta
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let datos = out as? Data else { return nil }
        return try? JSONDecoder().decode(Sesion.self, from: datos)
    }

    static func guardar(_ s: Sesion) {
        guard let datos = try? JSONEncoder().encode(s) else { return }
        SecItemDelete(consulta as CFDictionary)
        var q = consulta
        q[kSecValueData as String] = datos
        // El widget corre con el teléfono bloqueado: tiene que poder leerla.
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(q as CFDictionary, nil)
    }

    static func borrar() { SecItemDelete(consulta as CFDictionary) }
}

/* Lo que se elige en la app y el widget solo lee. */
enum Preferencias {
    private static var d: UserDefaults { UserDefaults(suiteName: Configuracion.appGroup)! }

    static var empresaId: String? {
        get { d.string(forKey: "empresaId") }
        set { d.set(newValue, forKey: "empresaId") }
    }
    static var empresaNombre: String? {
        get { d.string(forKey: "empresaNombre") }
        set { d.set(newValue, forKey: "empresaNombre") }
    }
}
