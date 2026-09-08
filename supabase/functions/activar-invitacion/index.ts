// ===========================================================
// ANIMA TSC — Edge Function: activar-invitacion
//
// Convierte una invitación en una cuenta, sin que nadie tenga
// que entrar al panel de Supabase.
//
// El problema que resuelve: una fila en `user_invitations` da
// organización y rol, pero el usuario de `auth.users` solo lo
// crea la API de administración, y esa API exige `service_role`
// —una clave que, con toda la razón, no vive en el navegador ni
// en el repositorio—. Aquí sí vive: las funciones edge reciben
// `SUPABASE_SERVICE_ROLE_KEY` del entorno de Supabase.
//
// POR QUÉ NO PIDE SESIÓN (verify_jwt = false)
// Quien la llama todavía no tiene cuenta. Pedirle un JWT sería
// pedirle la llave de la puerta que viene a abrir. La
// autenticación la hace de otra forma: NO ACTÚA salvo que ya
// exista una invitación pendiente para esa dirección. Escribir
// el correo de un desconocido no manda nada a ninguna parte.
// No es un relé de correo abierto; es una cerradura que solo
// gira con una llave que alguien dejó puesta antes.
//
// CONTESTA SIEMPRE LO MISMO
// Haya invitación o no, exista la cuenta o no, la respuesta es
// idéntica. Si dijera «no tienes invitación» sería un buscador
// de quién sí la tiene: cualquiera podría ir probando correos y
// averiguar quién trabaja con ANIMA. El detalle se registra en
// el log del servidor, que sí puede saberlo.
//
// LA DECISIÓN NO SE TOMA AQUÍ
// `reclamar_invitacion()` (migración 0119) es quien decide, y
// marca el envío en la misma llamada: dos peticiones a la vez
// no pueden mandar dos correos. Esta función solo obedece.
//
// Deploy: supabase functions deploy activar-invitacion --no-verify-jwt
// ===========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

/* A dónde vuelve la persona desde el correo. El `?activar=1` no es
   decorativo: supabase-js consume y borra el fragmento (#) del enlace al
   arrancar, así que un marcador puesto ahí sería una carrera. En la query
   sobrevive, y la aplicación lo lee para saber que tiene que pedir una
   contraseña nueva antes de dejar entrar. */
const DESTINO = Deno.env.get("ANIMA_APP_URL") ?? "https://www.animatsc.com/app/?activar=1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

/* Lo único que sale de aquí hacia el navegador. */
const MISMA_RESPUESTA = {
  ok: true,
  mensaje:
    "Si esa dirección tiene una invitación, ya va en camino un correo para activar la cuenta.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY");
    return json({ error: "La función no está configurada." }, 500);
  }

  let correo = "";
  try {
    const cuerpo = await req.json();
    correo = String(cuerpo?.email ?? "").trim().toLowerCase();
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  /* Un correo sin arroba no llega a la base: no hay nada que consultar. */
  if (!correo || !correo.includes("@") || correo.length > 320) return json(MISMA_RESPUESTA);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.rpc("reclamar_invitacion", { p_email: correo });
  if (error) {
    console.error("reclamar_invitacion falló:", error.message);
    return json({ error: "No se pudo procesar la solicitud." }, 500);
  }

  const d = data as { enviar: boolean; motivo?: string; tiene_cuenta?: boolean; empresa?: string };
  if (!d?.enviar) {
    // Se registra aquí y no se contesta: el log puede saberlo, el visitante no.
    console.log(`activar-invitacion: sin envío (${d?.motivo ?? "desconocido"})`);
    return json(MISMA_RESPUESTA);
  }

  /* Estrenar y volver son dos correos distintos, y hay que acertar: la
     plantilla de invitación dice «te han invitado», la de recuperación dice
     «cambia tu contraseña». Mandar la segunda a quien nunca tuvo cuenta lo
     deja preguntándose qué contraseña está cambiando. */
  if (d.tiene_cuenta) {
    const publico = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: e } = await publico.auth.resetPasswordForEmail(correo, { redirectTo: DESTINO });
    if (e) console.error("resetPasswordForEmail falló:", e.message);
  } else {
    const { error: e } = await admin.auth.admin.inviteUserByEmail(correo, { redirectTo: DESTINO });
    if (e) console.error("inviteUserByEmail falló:", e.message);
  }

  /* Un fallo de envío tampoco cambia la respuesta. Si el SMTP está caído, eso
     es asunto del log y de quien opera, no una señal que regalar a quien está
     probando direcciones. */
  return json(MISMA_RESPUESTA);
});
