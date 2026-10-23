// ===========================================================
// ANIMA TSC — Edge Function: tiktok-ads
//
// Pestaña TikTok de STUDIO: trae de la API de Marketing de TikTok
// (Business API v1.3) campañas, grupos, anuncios (con su creativo),
// las métricas de cada anuncio por día, los comentarios de los
// anuncios y los formularios instantáneos. Los formularios entran al
// Centro de clientes como una solicitud más (client_leads, source
// 'tiktok'), así que siguen el mismo camino: aviso, Vínculo,
// cotización y proyecto.
//
// PUERTAS
//   Desde STUDIO, con la sesión del Alma:
//     { action: "estado" }                          ¿hay app de TikTok para entrar con un clic?
//     { action: "app", app_id, secret }             guarda la app de desarrollador del Alma
//     { action: "auth_url", redirect_uri }          URL para «Entrar con TikTok»
//     { action: "exchange", auth_code, state }      vuelta del ingreso: código → token
//     { action: "connect", token?, advertiser_id? } pegar un token a mano / elegir cuenta
//     { action: "sync", dias? }
//     { action: "alcance", since, until, level }     alcance real del periodo
//     { action: "responder", comment_id, text }      responde un comentario del anuncio
//     { action: "ocultar", comment_ids, ocultar }    oculta o vuelve a mostrar
//     { action: "atendido", comment_id, listo }      marcarlo como visto sin responder
//     { action: "disconnect" }
//   Cron de la base cada hora (x-cron-key, la misma de meta-leads):
//     { action: "cron" }
//
// EL TOKEN NO SALE DE AQUÍ: vive en Vault (tiktok_token_<alma>).
// La app de desarrollador: tiktok_app_<alma> (la del Alma) o
// tiktok_app_id / tiktok_app_secret (la de ANIMA, la carga SARK).
// verify_jwt = false por lo mismo que meta-ads: el cron no trae JWT,
// y cada puerta se autentica sola.
//
// API: https://business-api.tiktok.com/open_api/v1.3
// Permisos de la app: Ad Account Management, Ads Management, Reporting,
// Comment Management (comentarios) y Lead Management (formularios).
// Deploy: supabase functions deploy tiktok-ads --no-verify-jwt
// ===========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API = "https://business-api.tiktok.com/open_api/v1.3";
const PORTAL = "https://business-api.tiktok.com/portal/auth";
const PRIMERA_VEZ_DIAS = 90;
const REPASO_DIAS = 7;          // TikTok también corrige la atribución de los últimos días
const COMENTARIOS_PRIMERA_VEZ = 30;
const COMENTARIOS_REPASO = 7;
const MAX_GRUPOS_COMENTARIOS = 25;
// Desde dónde se puede volver del ingreso con TikTok.
const VUELTAS = [/^https:\/\/(www\.)?animatsc\.com\//, /^https:\/\/pew1sark\.github\.io\//, /^http:\/\/localhost(:\d+)?\//, /^http:\/\/127\.0\.0\.1(:\d+)?\//];

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------------------------------------------------------------
// Business API
// ---------------------------------------------------------------
class TikTokError extends Error {
  code?: number;
  constructor(msg: string, code?: number) { super(msg); this.code = code; }
}
// GET: los arreglos y objetos van como JSON en la URL (así lo pide TikTok).
async function tt(path: string, token: string, params: Record<string, unknown> = {}, method: "GET" | "POST" = "GET") {
  const u = new URL(API + path);
  const init: RequestInit = { method, headers: { "Access-Token": token } };
  if (method === "GET") {
    for (const [k, v] of Object.entries(params)) {
      if (v == null || v === "") continue;
      u.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
  } else {
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
    init.body = JSON.stringify(params);
  }
  const r = await fetch(u, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j.code != null && j.code !== 0)) throw new TikTokError(traducir(j?.code, j?.message || `TikTok respondió ${r.status}`), j?.code);
  return j.data || {};
}
// Listas paginadas de /campaign/get/, /adgroup/get/, /ad/get/, /page/get/.
async function ttTodo(path: string, token: string, params: Record<string, unknown>, max = 20) {
  const out: any[] = [];
  for (let page = 1; page <= max; page++) {
    const d = await tt(path, token, { ...params, page, page_size: params.page_size || 1000 });
    out.push(...(d.list || []));
    const total = d.page_info?.total_page || 1;
    if (page >= total) break;
  }
  return out;
}
// Los errores de TikTok que de verdad aparecen, en palabras de persona.
function traducir(code: any, m: string): string {
  if (code === 40105 || code === 40104 || code === 40102) return "El token de TikTok venció o se revocó. Vuelve a conectar la cuenta.";
  if (code === 40001 || code === 40003 || code === 40007) return "La app de TikTok no tiene permiso para esto (revisa los permisos de la app en TikTok for Business). " + m;
  if (code === 40100 || code === 40133 || code === 50002) return "TikTok pidió esperar un poco (límite de consultas). Se reintenta solo en la próxima hora.";
  return m;
}

// ---------------------------------------------------------------
// Secretos y dueños (mismo patrón que meta-ads)
// ---------------------------------------------------------------
async function secreto(nombre: string): Promise<string | null> {
  const { data, error } = await admin.rpc("tt_secret_get", { p_name: nombre });
  if (error) throw error;
  return (data as string) || null;
}
async function guardarSecreto(nombre: string, valor: string) {
  const { error } = await admin.rpc("tt_secret_set", { p_name: nombre, p_value: valor });
  if (error) throw error;
}
const tokenDe = (almaId: string) => `tiktok_token_${almaId}`;
const appDe = (almaId: string) => `tiktok_app_${almaId}`;

// La app del Alma si cargó una; si no, la de ANIMA.
async function appPara(almaId: string): Promise<{ id: string; secret: string } | null> {
  const propia = await secreto(appDe(almaId));
  if (propia) { try { const a = JSON.parse(propia); if (a.id && a.secret) return a; } catch (_) { /* dañada: se ignora */ } }
  const id = await secreto("tiktok_app_id"), secret = await secreto("tiktok_app_secret");
  return id && secret ? { id, secret } : null;
}

async function almaDelUsuario(req: Request, almaId: string): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt || !almaId) return false;
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return false;
  const { data } = await admin.from("almas").select("id").eq("id", almaId).eq("user_id", u.user.id).maybeSingle();
  return !!data;
}
function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------
const num = (v: any) => Number(v || 0) || 0;
const dia = (d: Date) => d.toISOString().slice(0, 10);
const haceDias = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return dia(d); };
const sumarDias = (ymd: string, n: number) => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return dia(d); };
const fechaValida = (s: any) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
// TikTok da "2026-10-01 12:00:00" en UTC (o segundos desde 1970).
function fechaTT(v: any): string | null {
  if (v == null || v === "" || v === "0") return null;
  if (typeof v === "number" || /^\d{9,13}$/.test(String(v))) { const n = Number(v); return new Date(n < 1e12 ? n * 1000 : n).toISOString(); }
  const d = new Date(String(v).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? "" : "Z"));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------------------------------------------------------------
// Conectar
// ---------------------------------------------------------------
async function cuentasDelToken(token: string, almaId: string): Promise<{ id: string; name: string }[]> {
  const app = await appPara(almaId);
  if (!app) return [];
  const d = await tt("/oauth2/advertiser/get/", token, { app_id: app.id, secret: app.secret });
  return (d.list || []).map((x: any) => ({ id: String(x.advertiser_id), name: x.advertiser_name || String(x.advertiser_id) }));
}

async function infoCuenta(token: string, ids: string[]) {
  const d = await tt("/advertiser/info/", token, {
    advertiser_ids: ids,
    fields: ["advertiser_id", "name", "currency", "timezone", "display_timezone", "status"],
  });
  return (d.list || []) as any[];
}

async function guardarConexion(almaId: string, token: string, advertiserId: string) {
  const [info] = await infoCuenta(token, [advertiserId]);
  if (!info) return { ok: false, msg: "TikTok no devolvió esa cuenta publicitaria: revisa que el token la tenga autorizada." };
  await guardarSecreto(tokenDe(almaId), token);
  await admin.from("tiktok_ads_connections").upsert({
    alma_id: almaId, advertiser_id: String(info.advertiser_id || advertiserId), advertiser_name: info.name || null,
    currency: info.currency || null, timezone: info.display_timezone || info.timezone || null,
    connected_at: new Date().toISOString(), last_sync_ok: null, last_sync_msg: null,
    comments_ok: null, comments_msg: null, leads_ok: null, leads_msg: null, lead_tasks: {},
  }, { onConflict: "alma_id" });
  const sync = await sincronizar(almaId, PRIMERA_VEZ_DIAS);
  return { ok: true, cuenta: { id: advertiserId, name: info.name || advertiserId, currency: info.currency }, sync };
}

// Pegar un token a mano (o elegir entre varias cuentas después del ingreso).
async function conectar(almaId: string, body: any) {
  let token = String(body.token || "").trim();
  if (!token) token = (await secreto(`tiktok_pendiente_${almaId}`)) || (await secreto(tokenDe(almaId))) || "";
  if (!token) return json({ ok: false, msg: "Pega el token de acceso de la API de Marketing de TikTok." }, 400);
  let id = String(body.advertiser_id || "").trim();
  if (!id) {
    const cuentas = await cuentasDelToken(token, almaId).catch(() => []);
    if (cuentas.length === 1) id = cuentas[0].id;
    else if (cuentas.length > 1) {
      await guardarSecreto(`tiktok_pendiente_${almaId}`, token);
      return json({ ok: false, elegir: cuentas });
    } else return json({ ok: false, msg: "Escribe el ID de la cuenta publicitaria (advertiser ID): está arriba a la derecha en TikTok Ads Manager." }, 400);
  }
  if (!/^\d{6,25}$/.test(id)) return json({ ok: false, msg: "El ID de la cuenta publicitaria son solo números." }, 400);
  const r = await guardarConexion(almaId, token, id);
  await admin.rpc("tt_secret_forget", { p_name: `tiktok_pendiente_${almaId}` });
  return json(r, r.ok ? 200 : 400);
}

// «Entrar con TikTok»: el portal de TikTok devuelve a STUDIO con ?auth_code=…&state=…
async function urlIngreso(almaId: string, body: any) {
  const app = await appPara(almaId);
  if (!app) return json({ ok: false, msg: "Falta la app de TikTok for Business (ID y clave secreta)." }, 400);
  const vuelta = String(body.redirect_uri || "");
  if (!VUELTAS.some((re) => re.test(vuelta))) return json({ ok: false, msg: "Dirección de vuelta no permitida." }, 400);
  const state = crypto.randomUUID().replace(/-/g, "");
  await admin.from("tiktok_oauth_states").upsert({ alma_id: almaId, state, created_at: new Date().toISOString() }, { onConflict: "alma_id" });
  const u = new URL(PORTAL);
  u.searchParams.set("app_id", app.id);
  u.searchParams.set("state", state);
  u.searchParams.set("redirect_uri", vuelta);
  return json({ ok: true, url: u.toString() });
}

async function canjear(almaId: string, body: any) {
  const code = String(body.auth_code || "").trim(), state = String(body.state || "");
  if (!code || !state) return json({ ok: false, msg: "TikTok no devolvió el código de autorización." }, 400);
  const { data: st } = await admin.from("tiktok_oauth_states").select("*").eq("alma_id", almaId).maybeSingle();
  await admin.from("tiktok_oauth_states").delete().eq("alma_id", almaId);
  if (!st || !iguales(st.state, state) || Date.now() - new Date(st.created_at).getTime() > 15 * 60000)
    return json({ ok: false, msg: "El ingreso con TikTok expiró. Vuelve a intentarlo." }, 400);
  const app = await appPara(almaId);
  if (!app) return json({ ok: false, msg: "Falta la app de TikTok for Business." }, 400);
  const r = await fetch(API + "/oauth2/access_token/", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: app.id, secret: app.secret, auth_code: code }),
  });
  const j = await r.json().catch(() => ({}));
  if (j.code !== 0 || !j.data?.access_token) return json({ ok: false, msg: traducir(j.code, j.message || "TikTok no entregó el token.") }, 400);
  const token = j.data.access_token as string;
  const ids: string[] = (j.data.advertiser_ids || []).map(String);
  if (ids.length === 1) {
    const res = await guardarConexion(almaId, token, ids[0]);
    return json(res, res.ok ? 200 : 400);
  }
  await guardarSecreto(`tiktok_pendiente_${almaId}`, token);
  let cuentas = await cuentasDelToken(token, almaId).catch(() => []);
  if (!cuentas.length) cuentas = ids.map((id) => ({ id, name: id }));
  if (!cuentas.length) return json({ ok: false, msg: "Autorizaste la app, pero sin ninguna cuenta publicitaria. Vuelve a entrar y marca la cuenta donde corren tus anuncios." }, 400);
  return json({ ok: false, elegir: cuentas });
}

// ---------------------------------------------------------------
// Sincronizar
// ---------------------------------------------------------------
async function conexion(almaId: string) {
  const { data } = await admin.from("tiktok_ads_connections").select("*").eq("alma_id", almaId).maybeSingle();
  return data;
}

// Métricas por anuncio y día. Si TikTok no reconoce alguna (cambian según la
// cuenta y el objetivo), se pide de nuevo solo con lo básico.
const METRICAS = ["spend", "impressions", "reach", "clicks", "conversion", "result", "total_landing_page_view",
  "video_play_actions", "video_watched_2s", "video_watched_6s", "video_views_p25", "video_views_p50", "video_views_p75", "video_views_p100",
  "likes", "comments", "shares", "follows", "profile_visits", "campaign_id", "adgroup_id"];
const METRICAS_BASICAS = ["spend", "impressions", "reach", "clicks", "conversion", "campaign_id", "adgroup_id"];

async function reporte(token: string, base: Record<string, unknown>) {
  const filas: any[] = [];
  for (let page = 1; page <= 30; page++) {
    const d = await tt("/report/integrated/get/", token, { ...base, page, page_size: 1000 });
    filas.push(...(d.list || []));
    if (page >= (d.page_info?.total_page || 1)) break;
  }
  return filas;
}
async function reporteDiario(token: string, advertiserId: string, desde: string, hasta: string) {
  const base = { advertiser_id: advertiserId, report_type: "BASIC", data_level: "AUCTION_AD", dimensions: ["ad_id", "stat_time_day"] };
  const filas: any[] = [];
  let metricas = METRICAS;
  // stat_time_day admite 30 días por consulta.
  for (let d = desde; d <= hasta; d = sumarDias(d, 30)) {
    const h = sumarDias(d, 29) < hasta ? sumarDias(d, 29) : hasta;
    try { filas.push(...(await reporte(token, { ...base, metrics: metricas, start_date: d, end_date: h }))); }
    catch (e) {
      if ((e as TikTokError).code !== 40002 || metricas === METRICAS_BASICAS) throw e;
      metricas = METRICAS_BASICAS;
      filas.push(...(await reporte(token, { ...base, metrics: metricas, start_date: d, end_date: h })));
    }
  }
  return filas;
}

async function sincronizar(almaId: string, dias?: number) {
  const con = await conexion(almaId);
  if (!con) return { ok: false, msg: "Sin cuenta de TikTok conectada." };
  const token = await secreto(tokenDe(almaId));
  if (!token) return { ok: false, msg: "Falta el token: vuelve a conectar." };
  const adv = con.advertiser_id;
  const ahora = new Date().toISOString();
  try {
    // 1 · Estructura: campañas, grupos y anuncios (todos los campos).
    const [camps, grupos, ads] = await Promise.all([
      ttTodo("/campaign/get/", token, { advertiser_id: adv }),
      ttTodo("/adgroup/get/", token, { advertiser_id: adv }),
      ttTodo("/ad/get/", token, { advertiser_id: adv }),
    ]);
    // Portadas de los videos (se piden de a 60).
    const videos = [...new Set(ads.map((a: any) => a.video_id).filter(Boolean))] as string[];
    const portada = new Map<string, string>();
    for (let i = 0; i < videos.length; i += 60) {
      try {
        const d = await tt("/file/video/ad/info/", token, { advertiser_id: adv, video_ids: videos.slice(i, i + 60) });
        for (const v of d.list || []) if (v.video_id) portada.set(String(v.video_id), v.video_cover_url || v.poster_url || "");
      } catch (_) { /* sin portada se ve el ícono */ }
    }
    const objetos = [
      ...camps.map((c: any) => ({ alma_id: almaId, object_id: String(c.campaign_id), level: "campaign", campaign_id: String(c.campaign_id),
        name: c.campaign_name, operation_status: c.operation_status || null, secondary_status: c.secondary_status || null,
        objective: c.objective_type || c.objective || null, budget: c.budget ? num(c.budget) : null, budget_mode: c.budget_mode || null,
        created_time: fechaTT(c.create_time), updated_at: ahora })),
      ...grupos.map((g: any) => ({ alma_id: almaId, object_id: String(g.adgroup_id), level: "adgroup", campaign_id: String(g.campaign_id),
        adgroup_id: String(g.adgroup_id), name: g.adgroup_name, operation_status: g.operation_status || null,
        secondary_status: g.secondary_status || null, optimization_goal: g.optimization_goal || null, promotion_type: g.promotion_type || null,
        budget: g.budget ? num(g.budget) : null, budget_mode: g.budget_mode || null,
        start_time: fechaTT(g.schedule_start_time), stop_time: g.schedule_type === "SCHEDULE_FROM_NOW" ? null : fechaTT(g.schedule_end_time),
        created_time: fechaTT(g.create_time), updated_at: ahora,
        targeting: { age_groups: g.age_groups || null, gender: g.gender || null, location_ids: g.location_ids || null,
          languages: g.languages || null, placements: g.placements || null, placement_type: g.placement_type || null } })),
      ...ads.map((a: any) => ({ alma_id: almaId, object_id: String(a.ad_id), level: "ad", campaign_id: String(a.campaign_id),
        adgroup_id: String(a.adgroup_id), name: a.ad_name, operation_status: a.operation_status || null,
        secondary_status: a.secondary_status || null, created_time: fechaTT(a.create_time), updated_at: ahora,
        creative: { text: a.ad_text || null, cover_url: portada.get(String(a.video_id)) || null, video_id: a.video_id || null,
          image_ids: a.image_ids || null, cta: a.call_to_action || null, landing: a.landing_page_url || null,
          item_id: a.tiktok_item_id || null, identity_id: a.identity_id || null, identity_type: a.identity_type || null,
          display_name: a.display_name || null, page_id: a.page_id ? String(a.page_id) : null, format: a.ad_format || null } })),
    ];
    for (let i = 0; i < objetos.length; i += 500) {
      const { error } = await admin.from("tiktok_ads_objects").upsert(objetos.slice(i, i + 500), { onConflict: "alma_id,object_id" });
      if (error) throw error;
    }

    // 2 · Métricas diarias por anuncio: 90 días la primera vez, después los últimos 7.
    let n = dias;
    if (!n) {
      const { count } = await admin.from("tiktok_ads_daily").select("ad_id", { count: "exact", head: true }).eq("alma_id", almaId);
      n = count ? REPASO_DIAS : PRIMERA_VEZ_DIAS;
    }
    const filas = await reporteDiario(token, adv, haceDias(n), dia(new Date()));
    const diarias = filas.map((r: any) => {
      const m = r.metrics || {}, d = r.dimensions || {};
      return {
        alma_id: almaId, ad_id: String(d.ad_id), day: String(d.stat_time_day || "").slice(0, 10),
        campaign_id: m.campaign_id ? String(m.campaign_id) : null, adgroup_id: m.adgroup_id ? String(m.adgroup_id) : null,
        spend: num(m.spend), impressions: num(m.impressions), reach: num(m.reach), clicks: num(m.clicks),
        conversions: num(m.conversion), results: num(m.result), landing_views: num(m.total_landing_page_view),
        video_plays: num(m.video_play_actions), video_2s: num(m.video_watched_2s), video_6s: num(m.video_watched_6s),
        video_p25: num(m.video_views_p25), video_p50: num(m.video_views_p50), video_p75: num(m.video_views_p75), video_p100: num(m.video_views_p100),
        likes: num(m.likes), comments: num(m.comments), shares: num(m.shares), follows: num(m.follows), profile_visits: num(m.profile_visits),
        updated_at: ahora,
      };
    }).filter((x) => x.ad_id && x.day);
    for (let i = 0; i < diarias.length; i += 500) {
      const { error } = await admin.from("tiktok_ads_daily").upsert(diarias.slice(i, i + 500), { onConflict: "alma_id,ad_id,day" });
      if (error) throw error;
    }

    // 3 · Lo que dice la gente. Si falla, los anuncios igual quedan al día.
    const com = await sincronizarComentarios(almaId, token, adv, grupos);
    const lea = await sincronizarFormularios(almaId, token, con, ads);

    const msg = `${camps.length} campaña${camps.length === 1 ? "" : "s"} · ${ads.length} anuncio${ads.length === 1 ? "" : "s"} · ${diarias.length} días-anuncio`
      + (com.ok && com.nuevos ? ` · ${com.nuevos} comentario${com.nuevos === 1 ? "" : "s"}` : "")
      + (lea.ok && lea.nuevos ? ` · ${lea.nuevos} formulario${lea.nuevos === 1 ? "" : "s"} nuevo${lea.nuevos === 1 ? "" : "s"}` : "");
    await admin.from("tiktok_ads_connections").update({
      last_sync_at: ahora, last_sync_ok: true, last_sync_msg: msg,
      comments_ok: com.ok, comments_msg: com.msg, leads_ok: lea.ok, leads_msg: lea.msg, lead_tasks: lea.tareas ?? con.lead_tasks ?? {},
    }).eq("alma_id", almaId);
    return { ok: true, msg };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    await admin.from("tiktok_ads_connections").update({ last_sync_at: new Date().toISOString(), last_sync_ok: false, last_sync_msg: msg }).eq("alma_id", almaId);
    return { ok: false, msg };
  }
}

// ---------------------------------------------------------------
// Comentarios de los anuncios
// ---------------------------------------------------------------
// TikTok solo los entrega por grupo de anuncios: se recorren los grupos que
// entregaron hace poco (o que siguen prendidos), los más recientes primero.
async function sincronizarComentarios(almaId: string, token: string, adv: string, grupos: any[]) {
  try {
    const { count } = await admin.from("tiktok_ad_comments").select("comment_id", { count: "exact", head: true }).eq("alma_id", almaId);
    const desde = haceDias(count ? COMENTARIOS_REPASO : COMENTARIOS_PRIMERA_VEZ), hasta = dia(new Date());
    const { data: activos } = await admin.from("tiktok_ads_daily").select("adgroup_id").eq("alma_id", almaId).gte("day", desde).gt("impressions", 0);
    const conEntrega = new Set((activos || []).map((x: any) => x.adgroup_id).filter(Boolean));
    const ids = grupos
      .filter((g: any) => conEntrega.has(String(g.adgroup_id)) || g.operation_status === "ENABLE")
      .sort((a: any, b: any) => String(b.create_time || "").localeCompare(String(a.create_time || "")))
      .map((g: any) => String(g.adgroup_id)).slice(0, MAX_GRUPOS_COMENTARIOS);
    const ahora = new Date().toISOString();
    const filas: any[] = [];
    const propias: string[] = [];
    for (const id of ids) {
      for (let page = 1; page <= 10; page++) {
        const d = await tt("/comment/list/", token, {
          advertiser_id: adv, search_field: "ADGROUP_ID", search_value: id, start_time: desde, end_time: hasta,
          comment_type: ["ALL"], sort_field: "CREATE_TIME", sort_type: "DESC", page, page_size: 100,
        });
        const lista = d.comments || d.list || [];
        for (const c of lista) {
          const cid = String(c.comment_id || c.id || "");
          if (!cid) continue;
          const status = String(c.status || c.comment_status || "").toUpperCase();
          filas.push({
            alma_id: almaId, comment_id: cid, ad_id: c.ad_id ? String(c.ad_id) : null, adgroup_id: c.adgroup_id ? String(c.adgroup_id) : id,
            campaign_id: c.campaign_id ? String(c.campaign_id) : null, item_id: String(c.tiktok_item_id || c.item_id || c.video_id || "") || null,
            parent_id: String(c.reply_to_comment_id || c.original_comment_id || c.parent_comment_id || "") || null,
            kind: c.comment_type || null, user_name: c.user_name || c.username || c.nickname || c.display_name || null,
            text: c.text ?? c.content ?? c.comment_text ?? null, likes: num(c.likes ?? c.like_count), replies: num(c.replies ?? c.reply_count),
            hidden: status === "HIDDEN" || c.hidden === true, pinned: !!(c.is_pinned ?? c.is_top),
            commented_at: fechaTT(c.create_time), raw: c, synced_at: ahora,
          });
          if (c.is_advertiser_reply || c.identity_id) propias.push(cid);
        }
        if (page >= (d.page_info?.total_page || 1) || lista.length < 100) break;
      }
    }
    let nuevos = 0;
    if (filas.length) {
      const { data: ya } = await admin.from("tiktok_ad_comments").select("comment_id").eq("alma_id", almaId).in("comment_id", filas.map((f) => f.comment_id));
      nuevos = filas.length - (ya || []).length;
      // answered_at y done_at los pone STUDIO: el upsert no los toca.
      for (let i = 0; i < filas.length; i += 500) {
        const { error } = await admin.from("tiktok_ad_comments").upsert(filas.slice(i, i + 500), { onConflict: "alma_id,comment_id" });
        if (error) throw error;
      }
      // «mine» no va en el upsert: así no se borra la marca de lo que se respondió desde STUDIO.
      if (propias.length) await admin.from("tiktok_ad_comments").update({ mine: true }).eq("alma_id", almaId).in("comment_id", propias);
    }
    return { ok: true, nuevos, msg: `${ids.length} grupo${ids.length === 1 ? "" : "s"} revisado${ids.length === 1 ? "" : "s"}` };
  } catch (e) {
    return { ok: false, nuevos: 0, msg: (e as Error).message || String(e) };
  }
}

async function responder(almaId: string, body: any) {
  const con = await conexion(almaId); const token = await secreto(tokenDe(almaId));
  if (!con || !token) return json({ ok: false, msg: "Sin conexión." }, 400);
  const texto = String(body.text || "").trim();
  if (!texto) return json({ ok: false, msg: "Escribe la respuesta." }, 400);
  if (texto.length > 150) return json({ ok: false, msg: "TikTok acepta respuestas de hasta 150 caracteres." }, 400);
  const { data: c } = await admin.from("tiktok_ad_comments").select("*").eq("alma_id", almaId).eq("comment_id", String(body.comment_id || "")).maybeSingle();
  if (!c) return json({ ok: false, msg: "Ese comentario no es de tu cuenta." }, 404);
  const { data: ad } = c.ad_id ? await admin.from("tiktok_ads_objects").select("creative").eq("alma_id", almaId).eq("object_id", c.ad_id).maybeSingle() : { data: null };
  const cr = (ad?.creative || {}) as any;
  const tipo = cr.identity_type, ident = cr.identity_id, item = c.item_id || cr.item_id;
  if (!ident || !["TT_USER", "CUSTOMIZED_USER"].includes(tipo))
    return json({ ok: false, msg: "TikTok solo deja responder desde la API los anuncios publicados con tu cuenta de TikTok o con una identidad propia. Respóndelo en TikTok Ads Manager → Comentarios." }, 400);
  if (!item) return json({ ok: false, msg: "TikTok no indicó a qué video pertenece este comentario. Respóndelo en TikTok Ads Manager." }, 400);
  const d = await tt("/comment/post/", token, {
    advertiser_id: con.advertiser_id, ad_id: c.ad_id, tiktok_item_id: item, comment_id: c.comment_id,
    comment_type: "REPLY", text: texto, identity_type: tipo, identity_id: ident,
  }, "POST");
  const ahora = new Date().toISOString();
  const nuevo = String(d.comment_id || d.reply_id || "");
  if (nuevo) {
    await admin.from("tiktok_ad_comments").upsert({
      alma_id: almaId, comment_id: nuevo, ad_id: c.ad_id, adgroup_id: c.adgroup_id, campaign_id: c.campaign_id, item_id: item,
      parent_id: c.comment_id, kind: "REPLY", user_name: cr.display_name || "Tu cuenta", text: texto, mine: true,
      commented_at: ahora, raw: d, synced_at: ahora,
    }, { onConflict: "alma_id,comment_id" });
  }
  await admin.from("tiktok_ad_comments").update({ answered_at: ahora, replies: (c.replies || 0) + 1 }).eq("alma_id", almaId).eq("comment_id", c.comment_id);
  return json({ ok: true });
}

async function ocultar(almaId: string, body: any) {
  const con = await conexion(almaId); const token = await secreto(tokenDe(almaId));
  if (!con || !token) return json({ ok: false, msg: "Sin conexión." }, 400);
  const pedidos = (Array.isArray(body.comment_ids) ? body.comment_ids : []).map(String).slice(0, 50);
  const { data: propios } = await admin.from("tiktok_ad_comments").select("comment_id").eq("alma_id", almaId).in("comment_id", pedidos);
  const ids = (propios || []).map((x: any) => x.comment_id);
  if (!ids.length) return json({ ok: false, msg: "Esos comentarios no son de tu cuenta." }, 404);
  const oc = body.ocultar !== false;
  await tt("/comment/status/update/", token, { advertiser_id: con.advertiser_id, comment_ids: ids, operation: oc ? "HIDDEN" : "PUBLIC" }, "POST");
  await admin.from("tiktok_ad_comments").update({ hidden: oc }).eq("alma_id", almaId).in("comment_id", ids);
  return json({ ok: true, n: ids.length });
}

// ---------------------------------------------------------------
// Formularios instantáneos → Centro de clientes
// ---------------------------------------------------------------
// TikTok no da los formularios uno por uno: se pide una «tarea de descarga»
// por formulario, se espera a que esté lista y se baja un CSV. Lo que no
// alcanza a estar listo en esta pasada se baja en la próxima hora.
const sinTildes = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_¿?¡!.,:;()]/g, " ");

function leerCSV(texto: string): string[][] {
  const filas: string[][] = []; let fila: string[] = [], campo = "", comillas = false;
  const t = texto.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === ",") { fila.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some((x) => x !== "")) filas.push(fila);
      fila = [];
    } else campo += ch;
  }
  fila.push(campo); if (fila.some((x) => x !== "")) filas.push(fila);
  return filas;
}

async function huella(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].slice(0, 12).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Columnas de sistema del CSV de TikTok (lo demás son las preguntas del formulario).
const SISTEMA = /^(lead[ _]?id|id|create[ _]?time|created[ _]?(time|at)|ad[ _]?(id|name)|ad ?group[ _]?(id|name)|adgroup[ _]?(id|name)|campaign[ _]?(id|name)|form[ _]?(id|name)|page[ _]?(id|name)|advertiser[ _]?(id|name)|lead[ _]?source|is[ _]?test|source)$/i;

async function aFilaLead(cab: string[], valores: string[], almaId: string, pageId: string, formName: string | null, adNombre: Map<string, any>) {
  const v = (re: RegExp) => { const i = cab.findIndex((h) => re.test(h.trim())); return i >= 0 ? String(valores[i] || "").trim() : ""; };
  const leadId = v(/^lead[ _]?id$/i) || v(/^id$/i);
  const creado = v(/^create[ _]?time$|^created[ _]?(time|at)$/i);
  const adId = v(/^ad[ _]?id$/i);
  const ad = adId ? adNombre.get(adId) : null;
  const answers = cab.map((h, i) => ({ key: sinTildes(h).trim().replace(/\s+/g, "_"), label: h.trim(), value: String(valores[i] || "").trim() }))
    .filter((a) => a.value && !SISTEMA.test(a.label));
  const fila: Record<string, any> = {
    alma_id: almaId, source: "tiktok",
    external_id: "tt:" + (leadId || (await huella(valores.join("\u0001")))),
    page_id: pageId, form_id: pageId, form_name: v(/^form[ _]?name$|^page[ _]?name$/i) || formName,
    ad_id: adId || null, ad_name: v(/^ad[ _]?name$/i) || ad?.name || null,
    campaign_name: v(/^campaign[ _]?name$/i) || ad?.campaign_name || null,
    platform: "tiktok", answers,
    lead_created_at: (fechaTT(creado) || new Date().toISOString()),
  };
  let nombre = "", apellido = "";
  for (const a of answers) {
    const t = sinTildes(`${a.key} ${a.label}`), val = a.value;
    if (/^(name|full_name|nombre_completo|nombre_y_apellido)$/.test(a.key) || /nombre completo|full name/.test(t)) fila.full_name = val;
    else if (/^first_name$/.test(a.key) || /^nombre$/.test(a.key)) nombre = val;
    else if (/^last_name$/.test(a.key) || /apellido/.test(t)) apellido = val;
    else if (/phone|telefono|celular|whatsapp|movil/.test(t)) fila.phone = fila.phone || val;
    else if (/e ?mail|correo/.test(t)) fila.email = fila.email || val;
    else if (/foto/.test(t)) fila.photos_via = val;
    else if (/ciudad|comuna|ubicacion|donde esta|direccion|city|region/.test(t)) fila.city = fila.city ? `${fila.city} · ${val}` : val;
    else if (/medida|dimension|metro|alto|ancho|m2|tamano/.test(t)) fila.measures = val;
    else if (/idea|diseno|tematica|referencia|mensaje|comentario/.test(t)) fila.idea = fila.idea || val;
  }
  if (!fila.full_name && (nombre || apellido)) fila.full_name = `${nombre} ${apellido}`.trim();
  return fila;
}

// La misma ruta crea la tarea (sin task_id) y dice cómo va (con task_id).
async function tareaLeads(token: string, adv: string, pageId: string, taskId?: string) {
  const p: Record<string, unknown> = { advertiser_id: adv, page_id: pageId };
  if (taskId) p.task_id = taskId;
  try { return await tt("/page/lead/task/", token, p, "POST"); }
  catch (e) { if (taskId) return await tt("/page/lead/task/", token, p, "GET"); throw e; }
}
async function bajarLeads(token: string, adv: string, taskId: string): Promise<string> {
  const u = new URL(API + "/page/lead/task/download/");
  u.searchParams.set("advertiser_id", adv); u.searchParams.set("task_id", taskId);
  const r = await fetch(u, { headers: { "Access-Token": token } });
  const tipo = r.headers.get("content-type") || "";
  if (tipo.includes("json")) { const j = await r.json().catch(() => ({})); throw new TikTokError(traducir(j.code, j.message || "No se pudo bajar el archivo de formularios."), j.code); }
  if (tipo.includes("zip")) throw new TikTokError("TikTok entregó los formularios comprimidos (más de 10 MB): bájalos una vez a mano desde Ads Manager.");
  return await r.text();
}

async function sincronizarFormularios(almaId: string, token: string, con: any, ads: any[]) {
  const adv = con.advertiser_id;
  const tareas: Record<string, { task_id: string; at: string }> = { ...(con.lead_tasks || {}) };
  try {
    const paginas = await ttTodo("/page/get/", token, { advertiser_id: adv, business_type: "LEAD_GEN", page_size: 100 }, 5).catch((e) => {
      if ((e as TikTokError).code === 40002) return [];   // la cuenta nunca usó formularios
      throw e;
    });
    if (!paginas.length) return { ok: true, nuevos: 0, msg: "Sin formularios instantáneos en la cuenta.", tareas: {} };
    const adNombre = new Map<string, any>();
    const campNombre = new Map<string, string>();
    const { data: cs } = await admin.from("tiktok_ads_objects").select("object_id,name").eq("alma_id", almaId).eq("level", "campaign");
    for (const c of cs || []) campNombre.set(c.object_id, c.name);
    for (const a of ads) adNombre.set(String(a.ad_id), { name: a.ad_name, campaign_name: campNombre.get(String(a.campaign_id)) || null });

    const listas: { page: any; task: string }[] = [];
    for (const pg of paginas.slice(0, 20)) {
      const pid = String(pg.page_id);
      let t = tareas[pid];
      if (t && Date.now() - new Date(t.at).getTime() > 6 * 3600000) t = undefined as any;   // quedó colgada
      if (!t) {
        const d = await tareaLeads(token, adv, pid);
        if (!d.task_id) continue;
        t = { task_id: String(d.task_id), at: new Date().toISOString() };
        tareas[pid] = t;
      }
      listas.push({ page: pg, task: t.task_id });
    }
    // Unos segundos de espera: las tareas chicas suelen estar listas al tiro.
    let nuevos = 0, revisados = 0;
    for (let intento = 0; intento < 4 && listas.length; intento++) {
      if (intento) await new Promise((r) => setTimeout(r, 2500));
      for (const x of [...listas]) {
        const d = await tareaLeads(token, adv, String(x.page.page_id), x.task);
        const st = String(d.status || "").toUpperCase();
        if (st === "FAILED") { delete tareas[String(x.page.page_id)]; listas.splice(listas.indexOf(x), 1); continue; }
        if (st !== "SUCCEED") continue;
        const csv = await bajarLeads(token, adv, x.task);
        delete tareas[String(x.page.page_id)];
        listas.splice(listas.indexOf(x), 1);
        const [cab, ...filas] = leerCSV(csv);
        if (!cab) continue;
        const leads = [];
        for (const f of filas) leads.push(await aFilaLead(cab, f, almaId, String(x.page.page_id), x.page.title || x.page.name || null, adNombre));
        revisados += leads.length;
        for (let i = 0; i < leads.length; i += 200) {
          const { data, error } = await admin.from("client_leads")
            .upsert(leads.slice(i, i + 200), { onConflict: "alma_id,external_id", ignoreDuplicates: true }).select("id");
          if (error) throw error;
          nuevos += data?.length || 0;
        }
      }
    }
    const pendientes = Object.keys(tareas).length;
    return { ok: true, nuevos, tareas,
      msg: `${paginas.length} formulario${paginas.length === 1 ? "" : "s"} · ${revisados} respuesta${revisados === 1 ? "" : "s"} revisada${revisados === 1 ? "" : "s"}` + (pendientes ? ` · ${pendientes} descarga${pendientes === 1 ? "" : "s"} en preparación` : "") };
  } catch (e) {
    return { ok: false, nuevos: 0, msg: (e as Error).message || String(e), tareas };
  }
}

// ---------------------------------------------------------------
// Alcance real del periodo (no se guarda: no se puede sumar día a día)
// ---------------------------------------------------------------
async function alcance(almaId: string, body: any) {
  const con = await conexion(almaId); const token = await secreto(tokenDe(almaId));
  if (!con || !token) return json({ ok: false, msg: "Sin conexión." }, 400);
  if (!fechaValida(body.since) || !fechaValida(body.until)) return json({ ok: false, msg: "Fechas inválidas." }, 400);
  const NIVEL: Record<string, [string, string]> = {
    account: ["AUCTION_ADVERTISER", "advertiser_id"], campaign: ["AUCTION_CAMPAIGN", "campaign_id"],
    adgroup: ["AUCTION_ADGROUP", "adgroup_id"], ad: ["AUCTION_AD", "ad_id"],
  };
  const level = NIVEL[body.level] ? body.level : "account";
  const [data_level, dim] = NIVEL[level];
  const filas = await reporte(token, {
    advertiser_id: con.advertiser_id, report_type: "BASIC", data_level, dimensions: [dim],
    metrics: ["reach", "frequency", "impressions"], start_date: body.since, end_date: body.until,
  });
  return json({ ok: true, filas: filas.map((r: any) => ({
    id: level === "account" ? "account" : String(r.dimensions?.[dim] || ""),
    reach: num(r.metrics?.reach), frequency: num(r.metrics?.frequency), impressions: num(r.metrics?.impressions),
  })) });
}

// ---------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  try {
    const body = JSON.parse((await req.text()) || "{}");

    if (body.action === "cron") {
      const { data: llave } = await admin.rpc("meta_secret_get", { p_name: "meta_leads_cron_key" });
      if (!llave || !iguales(req.headers.get("x-cron-key") || "", String(llave))) return json({ ok: false }, 401);
      const { data: cons } = await admin.from("tiktok_ads_connections").select("alma_id");
      const res = [];
      for (const c of cons || []) res.push({ alma: c.alma_id, ...(await sincronizar(c.alma_id)) });
      return json({ ok: true, cuentas: res.length, res });
    }

    const almaId = String(body.alma_id || "");
    if (!(await almaDelUsuario(req, almaId))) return json({ ok: false, msg: "Sesión no válida." }, 401);

    switch (body.action) {
      case "estado": {
        const app = await appPara(almaId);
        return json({ ok: true, app: !!app, propia: !!(await secreto(appDe(almaId))) });
      }
      case "app": {
        const id = String(body.app_id || "").trim(), secret = String(body.secret || "").trim();
        if (!/^\d{6,25}$/.test(id) || secret.length < 10) return json({ ok: false, msg: "Revisa el App ID (solo números) y la clave secreta." }, 400);
        await guardarSecreto(appDe(almaId), JSON.stringify({ id, secret }));
        return json({ ok: true });
      }
      case "auth_url":   return await urlIngreso(almaId, body);
      case "exchange":   return await canjear(almaId, body);
      case "connect":    return await conectar(almaId, body);
      case "sync": {
        const d = Number(body.dias);
        return json(await sincronizar(almaId, d > 0 ? Math.min(365, Math.round(d)) : undefined));
      }
      case "alcance":    return await alcance(almaId, body);
      case "responder":  return await responder(almaId, body);
      case "ocultar":    return await ocultar(almaId, body);
      case "atendido": {
        const { error } = await admin.from("tiktok_ad_comments").update({ done_at: body.listo === false ? null : new Date().toISOString() })
          .eq("alma_id", almaId).eq("comment_id", String(body.comment_id || ""));
        if (error) throw error;
        return json({ ok: true });
      }
      case "disconnect": {
        await admin.rpc("tt_secret_forget", { p_name: tokenDe(almaId) });
        await admin.rpc("tt_secret_forget", { p_name: `tiktok_pendiente_${almaId}` });
        await admin.from("tiktok_ad_comments").delete().eq("alma_id", almaId);
        await admin.from("tiktok_ads_daily").delete().eq("alma_id", almaId);
        await admin.from("tiktok_ads_objects").delete().eq("alma_id", almaId);
        await admin.from("tiktok_ads_connections").delete().eq("alma_id", almaId);
        // Las solicitudes que ya llegaron al Centro de clientes se quedan: son clientes.
        return json({ ok: true });
      }
      default: return json({ ok: false, msg: "Acción desconocida." }, 400);
    }
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("tiktok-ads", msg);
    return json({ ok: false, msg }, 500);
  }
});
