/* ===========================================================
   ANIMA STUDIO — invitacion-studio
   -----------------------------------------------------------
   Manda el correo de una invitación de STUDIO. Es lo único de
   todo el sistema que puede crear una cuenta, porque es lo
   único que tiene `service_role`.

   Y precisamente por eso no decide nada. Pregunta dos veces:

     1 · ¿Quién llama? Tiene que haber una sesión iniciada. Sin
         `Authorization` no se pasa de aquí.
     2 · ¿Se puede mandar? Lo responde la base, en
         `preparar_envio_invitacion` (migración 0136), que solo
         dice que sí cuando la invitación existe, está vigente y
         no se mandó en los últimos diez minutos. El sello del
         envío lo pone ella, no esta función: dos pulsaciones
         seguidas no mandan dos correos.

   Escribir el correo de un desconocido no le manda nada a nadie:
   sin invitación previa, la base responde que no.

   Desplegar:
     supabase functions deploy invitacion-studio
   Variables (ya vienen puestas en el proyecto):
     SUPABASE_URL · SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY
   Opcional:
     ANIMA_STUDIO_URL — la raíz del sitio (por defecto la de producción).
   =========================================================== */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITIO = Deno.env.get("ANIMA_STUDIO_URL") ?? "https://www.animatsc.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const servicio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  /* 1 · ¿Quién llama? */
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ error: "Falta la sesión." }, 401);

  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
  });
  const { data: quien } = await comoUsuario.auth.getUser();
  if (!quien?.user) return json({ error: "Sesión no válida." }, 401);

  let cuerpo: { invitacion_id?: string; sitio?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "Cuerpo ilegible." }, 400);
  }
  const id = String(cuerpo.invitacion_id ?? "").trim();
  if (!id) return json({ error: "Falta la invitación." }, 400);

  /* 2 · ¿Se puede mandar? Lo dice la base. */
  const admin = createClient(url, servicio, { auth: { persistSession: false } });
  const { data: permiso, error: errPermiso } = await admin.rpc(
    "preparar_envio_invitacion",
    { p_id: id },
  );
  if (errPermiso) return json({ error: errPermiso.message }, 400);
  if (!permiso?.enviar) {
    /* Hacia fuera siempre se responde lo mismo. Decir "no tienes invitación"
       sería contarle a cualquiera quién sí la tiene. El motivo va aparte para
       que la pantalla pueda explicar una espera, no un fallo. */
    return json({ ok: true, enviado: false, motivo: permiso?.motivo ?? "no-vigente" });
  }

  const raiz = String(cuerpo.sitio ?? SITIO).replace(/\/+$/, "");
  const enlace = `${raiz}/studio.html?invitacion=${permiso.token}`;

  /* Quien ya tiene cuenta no necesita que se la creen: al entrar con su correo,
     `aceptar_invitaciones_pendientes` le aplica el Clan y el rol que la estaban
     esperando. Mandarle un enlace de "crea tu cuenta" sería mentirle. */
  if (permiso.tiene_cuenta) {
    return json({
      ok: true,
      enviado: false,
      motivo: "ya-tiene-cuenta",
      enlace,
      correo: permiso.correo,
    });
  }

  const { error: errInvitacion } = await admin.auth.admin.inviteUserByEmail(
    permiso.correo,
    {
      redirectTo: enlace,
      data: {
        origen: "studio",
        invitacion: permiso.token,
        destino: permiso.destino,
        invita: permiso.invita,
      },
    },
  );

  if (errInvitacion) {
    return json({ ok: false, enviado: false, error: errInvitacion.message, enlace }, 502);
  }

  return json({ ok: true, enviado: true, correo: permiso.correo, enlace });
});
