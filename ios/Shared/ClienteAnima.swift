import Foundation

enum ErrorAnima: LocalizedError {
    case sinSesion, credenciales, red(Int)
    var errorDescription: String? {
        switch self {
        case .sinSesion: return "Abre ANIMA e inicia sesión."
        case .credenciales: return "Correo o contraseña incorrectos."
        case .red(let c): return "El servidor respondió \(c)."
        }
    }
}

/* Habla con Supabase por REST con el JWT de la persona. No lleva clave de
   servicio ni escribe nada: lo que se ve lo decide RLS, igual que en la web. */
enum ClienteAnima {
    private struct RespuestaAuth: Decodable {
        let access_token: String; let refresh_token: String; let expires_in: Double
        let user: Usuario
        struct Usuario: Decodable { let id: String }
    }

    private static func pedir(_ ruta: String, metodo: String = "GET", cuerpo: Data? = nil,
                              token: String? = nil) async throws -> Data {
        var r = URLRequest(url: URL(string: ruta, relativeTo: Configuracion.supabaseURL)!)
        r.httpMethod = metodo
        r.httpBody = cuerpo
        r.setValue(Configuracion.anonKey, forHTTPHeaderField: "apikey")
        r.setValue("Bearer " + (token ?? Configuracion.anonKey), forHTTPHeaderField: "Authorization")
        if cuerpo != nil { r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (datos, resp) = try await URLSession.shared.data(for: r)
        let codigo = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(codigo) else {
            throw (codigo == 400 || codigo == 401) ? ErrorAnima.credenciales : ErrorAnima.red(codigo)
        }
        return datos
    }

    private static func sesion(de d: Data) throws -> Sesion {
        let a = try JSONDecoder().decode(RespuestaAuth.self, from: d)
        return Sesion(accessToken: a.access_token, refreshToken: a.refresh_token,
                      expira: Date().addingTimeInterval(a.expires_in), usuarioId: a.user.id)
    }

    static func entrar(correo: String, contrasena: String) async throws -> Sesion {
        let cuerpo = try JSONSerialization.data(withJSONObject: ["email": correo, "password": contrasena])
        let s = try sesion(de: try await pedir("auth/v1/token?grant_type=password", metodo: "POST", cuerpo: cuerpo))
        AlmacenSesion.guardar(s)
        return s
    }

    /// Sesión lista para usar; si venció la renueva y la deja guardada.
    static func sesionVigente() async throws -> Sesion {
        guard let s = AlmacenSesion.leer() else { throw ErrorAnima.sinSesion }
        if s.vigente { return s }
        let cuerpo = try JSONSerialization.data(withJSONObject: ["refresh_token": s.refreshToken])
        do {
            let nueva = try sesion(de: try await pedir("auth/v1/token?grant_type=refresh_token", metodo: "POST", cuerpo: cuerpo))
            AlmacenSesion.guardar(nueva)
            return nueva
        } catch {
            AlmacenSesion.borrar()
            throw ErrorAnima.sinSesion
        }
    }

    static func empresas() async throws -> [Empresa] {
        let s = try await sesionVigente()
        let d = try await pedir("rest/v1/companies?select=id,name&order=name", token: s.accessToken)
        return try JSONDecoder().decode([Empresa].self, from: d)
    }

    static func resumen(empresa: String, modulo: String) async throws -> Resumen {
        let s = try await sesionVigente()
        let cuerpo = try JSONSerialization.data(withJSONObject: ["p_company": empresa, "p_modulo": modulo])
        let d = try await pedir("rest/v1/rpc/resumen_modulo", metodo: "POST", cuerpo: cuerpo, token: s.accessToken)
        return try JSONDecoder().decode(Resumen.self, from: d)
    }
}
