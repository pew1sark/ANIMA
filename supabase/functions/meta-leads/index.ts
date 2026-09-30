// ===========================================================
// ANIMA TSC — Edge Function: meta-leads
//
// Trae a STUDIO → Centro de clientes cada formulario que la gente
// llena en un anuncio de clientes potenciales de Meta.
//
// TRES PUERTAS DE ENTRADA, UNA SOLA FORMA DE GUARDAR
//   1. El Alma, desde STUDIO (con su sesión):
//        { action: "connect", alma_id, token, app_id?, app_secret?, page_id? }
//        { action: "sync",    alma_id }
//        { action: "disconnect", alma_id }
//        { action: "webhook_info", alma_id }
//   2. El cron de la base cada 5 minutos (cabecera x-cron-key):
//        { action: "cron" }
//   3. El webhook de Meta (leadgen), si se configura: GET para la
//      verificación y POST firmado con X-Hub-Signature-256.
// Todo termina en `guardar()`, que inserta con ON CONFLICT DO NOTHING
// sobre (alma_id, external_id): un lead nunca entra dos veces y nunca
// se pisa el estado que el Alma ya le puso.
//
// EL TOKEN NO SALE DE AQUÍ
// El token de la página se guarda cifrado en Vault con
// `meta_secret_set` (migración 0134) y solo esta función lo lee con
// service_role. El navegador lo manda una vez, al conectar, y nunca
// lo vuelve a ver.
//
// POR QUÉ verify_jwt = false
// Meta y el cron no traen JWT de Supabase. Por eso cada puerta se
// autentica por su cuenta: el Alma con su JWT (validado aquí contra
// auth y contra `almas.user_id`), el cron con su llave de Vault y
// el webhook con la firma HMAC de la app. Sin llave: 401. Sin
// secreto de app configurado: el webhook queda CERRADO (503).
//
// API: Graph v25.0 — docs/marketing-api/guides/lead-ads/retrieving
// Permisos del token: leads_retrieval, ads_management,
// pages_read_engagement, pages_show_list.
//
// Deploy: supabase functions deploy meta-leads --no-verify-jwt
// ===========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v25.0";
const PRIMERA_VEZ_DIAS = 90;          // Meta guarda los leads 90 días
const MARGEN_SEG = 300;               // re-mira 5 min hacia atrás por si algo llegó tarde

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------------------------------------------------------------
// Graph API
// ---------------------------------------------------------------
class GraphError extends Error {
  code?: number;
  constructor(msg: string, code?: number) { super(msg); this.code = code; }
}

async function graph(path: string, token: string, params: Record<string, string> = {}) {
  const u = path.startsWith("http") ? new URL(path) : new URL(GRAPH + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (!u.searchParams.has("access_token")) u.searchParams.set("access_token", token);
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new GraphError(j?.error?.message || `Meta respondió ${r.status}`, j?.error?.code);
  return j;
}

// Recorre la paginación de Graph (paging.next) hasta `max` páginas.
async function graphAll(path: string, token: string, params: Record<string, string> = {}, max = 20) {
  const out: any[] = [];
  let page = await graph(path, token, params);
  for (let i = 0; i < max; i++) {
    out.push(...(page.data || []));
    const next = page?.paging?.next;
    if (!next) break;
    page = await graph(next, token);
  }
  return out;
}

// ---------------------------------------------------------------
// Secretos (Vault) y dueños
// ---------------------------------------------------------------
async function secreto(nombre: string): Promise<string | null> {
  const { data, error } = await admin.rpc("meta_secret_get", { p_name: nombre });
  if (error) throw error;
  return (data as string) || null;
}
async function guardarSecreto(nombre: string, valor: string) {
  const { error } = await admin.rpc("meta_secret_set", { p_name: nombre, p_value: valor });
  if (error) throw error;
}
const tokenDe = (almaId: string) => `meta_page_token_${almaId}`;

// El JWT del Alma, validado contra auth y contra la propiedad del Alma.
async function almaDelUsuario(req: Request, almaId: string): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt || !almaId) return false;
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return false;
  const { data } = await admin.from("almas").select("id").eq("id", almaId).eq("user_id", u.user.id).maybeSingle();
  return !!data;
}

// Comparación en tiempo constante (llaves y firmas).
function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ---------------------------------------------------------------
// De un lead de Meta a una fila de client_leads
// ---------------------------------------------------------------
const sinTildes = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_¿?¡!.,:;()]/g, " ");

function fechaMeta(s: string) {
  // Graph entrega "2026-09-29T18:20:31+0000"; Date quiere "+00:00".
  return new Date(String(s || "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}

function aFila(lead: any, form: any, almaId: string, pageId: string) {
  const labels = new Map<string, string>((form?.questions || []).map((q: any) => [q.key, q.label]));
  const answers = (lead.field_data || []).map((f: any) => ({
    key: f.name,
    label: labels.get(f.name) || f.name,
    value: (f.values || []).join(", "),
  }));
  const fila: Record<string, any> = {
    alma_id: almaId,
    source: "meta",
    external_id: String(lead.id),
    page_id: pageId,
    form_id: form?.id || lead.form_id || null,
    form_name: form?.name || null,
    ad_id: lead.ad_id || null,
    ad_name: lead.ad_name || null,
    campaign_name: lead.campaign_name || null,
    platform: lead.platform || null,
    answers,
    lead_created_at: fechaMeta(lead.created_time).toISOString(),
  };
  let nombre = "", apellido = "";
  for (const a of answers) {
    const k = a.key, t = sinTildes(`${a.key} ${a.label}`), v = a.value;
    if (!v) continue;
    if (k === "full_name") fila.full_name = v;
    else if (k === "first_name") nombre = v;
    else if (k === "last_name") apellido = v;
    else if (k === "phone_number" || k === "phone") fila.phone = v;
    else if (k === "email" || k === "work_email") fila.email = fila.email || v;
    else if (/foto/.test(t)) fila.photos_via = v;
    else if (/ciudad|comuna|ubicacion|donde esta|direccion|city/.test(t)) fila.city = fila.city ? `${fila.city} · ${v}` : v;
    else if (/medida|dimension|metro|alto|ancho|m2|tamano/.test(t)) fila.measures = v;
    else if (/idea|diseno|tematica|referencia/.test(t)) fila.idea = v;
  }
  if (!fila.full_name && (nombre || apellido)) fila.full_name = `${nombre} ${apellido}`.trim();
  return fila;
}

async function guardar(filas: Record<string, any>[]) {
  if (!filas.length) return 0;
  const { data, error } = await admin
    .from("client_leads")
    .upsert(filas, { onConflict: "alma_id,external_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  return data?.length || 0;
}

// ---------------------------------------------------------------
// Sincronizar una página
// ---------------------------------------------------------------
const CAMPOS_COMPLETOS = "id,created_time,field_data,ad_id,ad_name,campaign_name,form_id,platform,is_organic";
const CAMPOS_BASICOS = "id,created_time,field_data,ad_id,form_id,platform";

async function leadsDelFormulario(formId: string, token: string, desde: number) {
  const filtro = JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: desde }]);
  // Si el token no alcanza para los nombres de anuncio/campaña, o el
  // filtro no se acepta, se reintenta con menos: mejor el lead sin el
  // nombre del anuncio que ningún lead.
  const intentos = [
    { fields: CAMPOS_COMPLETOS, filtering: filtro },
    { fields: CAMPOS_BASICOS, filtering: filtro },
    { fields: CAMPOS_BASICOS },
  ];
  let ultimo: unknown;
  for (const p of intentos) {
    try { return await graphAll(`/${formId}/leads`, token, { ...p, limit: "100" }); }
    catch (e) { ultimo = e; }
  }
  throw ultimo;
}

async function sincronizar(almaId: string) {
  const { data: con } = await admin.from("meta_lead_connections").select("*").eq("alma_id", almaId).maybeSingle();
  if (!con) return { ok: false, msg: "No hay ninguna página conectada." };
  const token = await secreto(tokenDe(almaId));
  if (!token) return { ok: false, msg: "Falta el token de la página: vuelve a conectar Meta." };

  const ahora = Math.floor(Date.now() / 1000);
  const desde = con.last_lead_time ? Number(con.last_lead_time) - MARGEN_SEG : ahora - PRIMERA_VEZ_DIAS * 86400;
  let nuevos = 0, vistos = 0, maxT = Number(con.last_lead_time || 0);
  try {
    const forms = await graphAll(`/${con.page_id}/leadgen_forms`, token, { fields: "id,name,status,questions", limit: "100" });
    for (const f of forms) {
      const leads = await leadsDelFormulario(f.id, token, desde);
      vistos += leads.length;
      for (const l of leads) maxT = Math.max(maxT, Math.floor(fechaMeta(l.created_time).getTime() / 1000) || 0);
      nuevos += await guardar(leads.map((l: any) => aFila(l, f, almaId, con.page_id)));
    }
    const msg = nuevos ? `${nuevos} solicitud${nuevos === 1 ? "" : "es"} nueva${nuevos === 1 ? "" : "s"}` : "Al día";
    await admin.from("meta_lead_connections").update({
      last_sync_at: new Date().toISOString(), last_sync_ok: true, last_sync_msg: msg,
      last_lead_time: maxT || null, leads_imported: (con.leads_imported || 0) + nuevos,
    }).eq("alma_id", almaId);
    return { ok: true, nuevos, vistos, formularios: forms.length, msg };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    await admin.from("meta_lead_connections").update({
      last_sync_at: new Date().toISOString(), last_sync_ok: false, last_sync_msg: msg,
    }).eq("alma_id", almaId);
    return { ok: false, msg };
  }
}

// ---------------------------------------------------------------
// Conectar una página
// ---------------------------------------------------------------
const SIN_PAGINAS =
  "Meta no le dio acceso a ninguna página a este token. Genera el token de nuevo y, " +
  "en la ventana de Facebook, toca «Editar acceso» y marca la página Sarkpew1. " +
  "Si la página está en un portfolio comercial, agrega también el permiso business_management.";

// Las páginas que el token puede usar. /me/accounts solo trae las que la
// persona autorizó en la ventana de Facebook; una página que vive en un
// portfolio comercial aparece recién por /{business}/owned_pages (permiso
// business_management). Se prueban las dos y se juntan sin repetir.
async function paginasDelUsuario(token: string) {
  const paginas: any[] = [];
  const sumar = (lista: any[]) => {
    for (const p of lista) if (p?.access_token && !paginas.some((x) => x.id === p.id)) paginas.push(p);
  };
  try { sumar(await graphAll("/me/accounts", token, { fields: "id,name,access_token", limit: "100" })); } catch (_) { /* sigue */ }
  if (!paginas.length) {
    try {
      const negocios = await graphAll("/me/businesses", token, { fields: "id,name", limit: "50" });
      for (const b of negocios) {
        for (const borde of ["owned_pages", "client_pages"]) {
          try { sumar(await graphAll(`/${b.id}/${borde}`, token, { fields: "id,name,access_token", limit: "100" })); } catch (_) { /* sin permiso */ }
        }
      }
    } catch (_) { /* sin business_management */ }
  }
  return paginas;
}

async function conectar(almaId: string, body: any) {
  let token = String(body.token || "").trim();
  const appId = String(body.app_id || "").trim();
  const appSecret = String(body.app_secret || "").trim();
  if (!token) return json({ ok: false, msg: "Falta el token." }, 400);

  // Con la app, el token corto del Explorador se canjea por uno largo
  // (60 días); los tokens de página que salen de él no vencen.
  if (appId && appSecret) {
    const r = await graph("/oauth/access_token", token, {
      grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: token,
    });
    if (r.access_token) token = r.access_token;
  }

  // ¿Token de persona o de página? `category` solo existe en Page y pedirlo
  // sobre un User hace fallar la llamada (#100), así que se pregunta el tipo
  // del nodo con metadata=1.
  const yo = await graph("/me", token, { fields: "id,name", metadata: "1" });
  const esPagina = yo?.metadata?.type === "page";
  let pageId: string, pageName: string, pageToken: string;
  if (esPagina) {
    pageId = yo.id; pageName = yo.name; pageToken = token;
  } else {
    const paginas = await paginasDelUsuario(token);
    if (!paginas.length) return json({ ok: false, msg: SIN_PAGINAS }, 400);
    const elegida = body.page_id ? paginas.find((p: any) => p.id === String(body.page_id))
      : paginas.length === 1 ? paginas[0] : null;
    if (!elegida) return json({ ok: false, elegir: paginas.map((p: any) => ({ id: p.id, name: p.name })) });
    pageId = elegida.id; pageName = elegida.name; pageToken = elegida.access_token;
  }

  // Probar que de verdad puede leer formularios antes de guardar nada.
  await graph(`/${pageId}/leadgen_forms`, pageToken, { fields: "id", limit: "1" });

  const { data: otra } = await admin.from("meta_lead_connections").select("alma_id").eq("page_id", pageId).maybeSingle();
  if (otra && otra.alma_id !== almaId) return json({ ok: false, msg: "Esa página ya está conectada a otra cuenta de ANIMA." }, 409);

  await guardarSecreto(tokenDe(almaId), pageToken);
  if (appSecret) await guardarSecreto("meta_app_secret", appSecret);   // para firmar el webhook

  // ¿Vence? Solo se puede saber con la app.
  let vence: string | null = null;
  if (appId && appSecret) {
    try {
      const d = await graph("/debug_token", `${appId}|${appSecret}`, { input_token: pageToken });
      const exp = d?.data?.expires_at;
      vence = exp ? new Date(exp * 1000).toISOString() : "nunca";
    } catch (_) { /* informativo */ }
  }

  await admin.from("meta_lead_connections").upsert({
    alma_id: almaId, page_id: pageId, page_name: pageName,
    connected_at: new Date().toISOString(), last_sync_msg: null, last_sync_ok: null,
  }, { onConflict: "alma_id" });

  const sync = await sincronizar(almaId);
  return json({ ok: true, page: { id: pageId, name: pageName }, vence, sync });
}

// ---------------------------------------------------------------
// Webhook de Meta (leadgen)
// ---------------------------------------------------------------
async function firmaValida(req: Request, raw: string) {
  const appSecret = await secreto("meta_app_secret");
  if (!appSecret) return null;                        // cerrado por defecto
  const firma = req.headers.get("x-hub-signature-256") || "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = "sha256=" + Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  return iguales(hex, firma);
}

async function webhook(payload: any) {
  let nuevos = 0;
  for (const entry of payload?.entry || []) {
    for (const ch of entry?.changes || []) {
      if (ch?.field !== "leadgen") continue;
      const v = ch.value || {};
      const pageId = String(v.page_id || entry.id || "");
      const { data: con } = await admin.from("meta_lead_connections").select("alma_id").eq("page_id", pageId).maybeSingle();
      if (!con) continue;
      const token = await secreto(tokenDe(con.alma_id));
      if (!token) continue;
      // El payload solo dice QUÉ lead releer; el dato se trae de la API autenticada.
      let lead: any;
      try { lead = await graph(`/${v.leadgen_id}`, token, { fields: CAMPOS_COMPLETOS }); }
      catch (_) { lead = await graph(`/${v.leadgen_id}`, token, { fields: CAMPOS_BASICOS }); }
      let form: any = { id: lead.form_id || v.form_id };
      try { form = await graph(`/${form.id}`, token, { fields: "id,name,questions" }); } catch (_) { /* sin etiquetas */ }
      nuevos += await guardar([aFila(lead, form, con.alma_id, pageId)]);
    }
  }
  return nuevos;
}

// ---------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const url = new URL(req.url);

    // Verificación del webhook (Meta la hace una vez al suscribirse).
    if (req.method === "GET") {
      if (url.searchParams.get("hub.mode") === "subscribe") {
        const esperado = await secreto("meta_leads_verify_token");
        const dado = url.searchParams.get("hub.verify_token") || "";
        if (esperado && iguales(dado, esperado)) return new Response(url.searchParams.get("hub.challenge") || "", { status: 200 });
        return new Response("forbidden", { status: 403 });
      }
      return new Response("ok", { status: 200 });
    }

    const raw = await req.text();

    // Webhook firmado por Meta.
    if (req.headers.has("x-hub-signature-256")) {
      const ok = await firmaValida(req, raw);
      if (ok === null) return new Response("webhook sin configurar", { status: 503 });
      if (!ok) return new Response("firma inválida", { status: 401 });
      const n = await webhook(JSON.parse(raw || "{}"));
      return json({ ok: true, nuevos: n });
    }

    const body = JSON.parse(raw || "{}");

    // Cron de la base.
    if (body.action === "cron") {
      const llave = await secreto("meta_leads_cron_key");
      if (!llave || !iguales(req.headers.get("x-cron-key") || "", llave)) return json({ ok: false }, 401);
      const { data: cons } = await admin.from("meta_lead_connections").select("alma_id");
      const res = [];
      for (const c of cons || []) res.push({ alma: c.alma_id, ...(await sincronizar(c.alma_id)) });
      return json({ ok: true, paginas: res.length, res });
    }

    // Desde STUDIO, con la sesión del Alma.
    const almaId = String(body.alma_id || "");
    if (!(await almaDelUsuario(req, almaId))) return json({ ok: false, msg: "Sesión no válida." }, 401);

    switch (body.action) {
      case "connect":
        return await conectar(almaId, body);
      case "sync":
        return json(await sincronizar(almaId));
      case "disconnect": {
        await admin.rpc("meta_secret_forget", { p_name: tokenDe(almaId) });
        await admin.from("meta_lead_connections").delete().eq("alma_id", almaId);
        return json({ ok: true });
      }
      case "webhook_info": {
        const { data: con } = await admin.from("meta_lead_connections").select("page_id").eq("alma_id", almaId).maybeSingle();
        if (!con) return json({ ok: false, msg: "Conecta primero una página." }, 400);
        return json({
          ok: true,
          callback_url: `${SUPABASE_URL}/functions/v1/meta-leads`,
          verify_token: await secreto("meta_leads_verify_token"),
          firma_lista: !!(await secreto("meta_app_secret")),
        });
      }
      default:
        return json({ ok: false, msg: "Acción desconocida." }, 400);
    }
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("meta-leads", msg);
    return json({ ok: false, msg }, 500);
  }
});
