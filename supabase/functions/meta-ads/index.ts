// ===========================================================
// ANIMA TSC — Edge Function: meta-ads
//
// Panel de anuncios de STUDIO: trae de la API de Marketing de Meta
// campañas, conjuntos, anuncios (con su creativo) y las métricas de
// cada anuncio por día, para analizarlos junto a lo que pasa después
// dentro de ANIMA (solicitudes, cotizaciones, trabajos ganados).
//
// PUERTAS
//   Desde STUDIO, con la sesión del Alma:
//     { action: "connect",  alma_id, token?, app_id?, app_secret?, ad_account_id? }
//        Sin token reusa el de la conexión de Meta del Centro de clientes.
//     { action: "sync",     alma_id, dias? }
//     { action: "disconnect", alma_id }
//     { action: "alcance",  alma_id, since, until, level }        alcance real del periodo
//     { action: "desglose", alma_id, since, until, id?, por }      edad/género, región, ubicación, hora
//   Cron de la base cada hora (x-cron-key, la misma de meta-leads):
//     { action: "cron" }
//
// EL TOKEN NO SALE DE AQUÍ: vive en Vault (meta_ads_token_<alma>).
// verify_jwt = false por lo mismo que meta-leads: el cron no trae JWT,
// y cada puerta se autentica sola.
//
// API: Graph v25.0 — docs/marketing-api/insights
// Permisos: ads_read (o ads_management).
// Deploy: supabase functions deploy meta-ads --no-verify-jwt
// ===========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v25.0";
const PRIMERA_VEZ_DIAS = 90;
const REPASO_DIAS = 7;          // Meta corrige la atribución de los últimos días

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  if (!r.ok || j.error) throw new GraphError(traducir(j?.error), j?.error?.code);
  return j;
}
async function graphAll(path: string, token: string, params: Record<string, string> = {}, max = 30) {
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
// Los errores de Meta que de verdad aparecen, en palabras de persona.
function traducir(e: any): string {
  const c = e?.code, m = e?.message || "Meta no respondió";
  if (c === 190) return "El token de Meta venció o se revocó. Vuelve a conectar la cuenta publicitaria.";
  if (c === 200 || c === 10 || c === 294) return "El token no tiene permiso para leer anuncios: genéralo con ads_read (o ads_management). " + m;
  if (c === 17 || c === 4 || c === 80004) return "Meta pidió esperar un poco (límite de consultas). Se reintenta solo en la próxima hora.";
  return m;
}

// ---------------------------------------------------------------
// Secretos y dueños (mismo patrón que meta-leads)
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
const tokenDe = (almaId: string) => `meta_ads_token_${almaId}`;

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
// Meta manda los presupuestos en la unidad mínima de la moneda: centavos en
// USD, pesos enteros en CLP. Estas monedas no tienen decimales.
const SIN_DECIMALES = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);
const presupuesto = (v: any, moneda: string) => v == null || v === "" ? null : Number(v) / (SIN_DECIMALES.has(moneda) ? 1 : 100);
const num = (v: any) => Number(v || 0) || 0;
const act = (lista: any[] | undefined, ...tipos: string[]) => {
  for (const t of tipos) { const x = (lista || []).find((a) => a.action_type === t); if (x) return num(x.value); }
  return 0;
};
const dia = (d: Date) => d.toISOString().slice(0, 10);
const haceDias = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return dia(d); };
const fechaValida = (s: any) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ---------------------------------------------------------------
// Conectar
// ---------------------------------------------------------------
async function conectar(almaId: string, body: any) {
  let token = String(body.token || "").trim();
  let appId = String(body.app_id || "").trim();
  let appSecret = String(body.app_secret || "").trim();
  // Sin token: el de la conexión del Centro de clientes (misma app, misma persona).
  if (!token) token = (await secreto(`meta_user_token_${almaId}`)) || "";
  if (!token) return json({ ok: false, msg: "Pega un token de acceso con permiso ads_read (o conecta primero Meta en el Centro de clientes)." }, 400);
  if (!appId) appId = (await secreto("meta_app_id")) || "";
  if (!appSecret) appSecret = (await secreto("meta_app_secret")) || "";

  if (appId && appSecret) {
    try {
      const r = await graph("/oauth/access_token", token, {
        grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: token,
      });
      if (r.access_token) token = r.access_token;
    } catch (_) { /* ya era largo */ }
  }

  const cuentas = await graphAll("/me/adaccounts", token, { fields: "account_id,name,currency,timezone_name,account_status", limit: "100" });
  if (!cuentas.length) return json({ ok: false, msg: "Este token no ve ninguna cuenta publicitaria. Genéralo con ads_read y la cuenta en la que corren tus anuncios." }, 400);
  const pedida = String(body.ad_account_id || "").replace(/^act_/, "");
  const elegida = pedida ? cuentas.find((c: any) => c.account_id === pedida) : cuentas.length === 1 ? cuentas[0] : null;
  if (!elegida) return json({ ok: false, elegir: cuentas.map((c: any) => ({ id: c.account_id, name: c.name, currency: c.currency, activa: c.account_status === 1 })) });

  let vence: string | null = null;
  if (appId && appSecret) {
    try {
      const d = await graph("/debug_token", `${appId}|${appSecret}`, { input_token: token });
      const exp = d?.data?.expires_at;
      vence = exp ? new Date(exp * 1000).toISOString() : null;
    } catch (_) { /* informativo */ }
  }

  await guardarSecreto(tokenDe(almaId), token);
  await admin.from("meta_ads_connections").upsert({
    alma_id: almaId, ad_account_id: elegida.account_id, account_name: elegida.name,
    currency: elegida.currency, timezone: elegida.timezone_name,
    connected_at: new Date().toISOString(), token_expires_at: vence, last_sync_ok: null, last_sync_msg: null,
  }, { onConflict: "alma_id" });

  const sync = await sincronizar(almaId, PRIMERA_VEZ_DIAS);
  return json({ ok: true, cuenta: { id: elegida.account_id, name: elegida.name, currency: elegida.currency }, vence, sync });
}

// ---------------------------------------------------------------
// Sincronizar
// ---------------------------------------------------------------
async function conexion(almaId: string) {
  const { data } = await admin.from("meta_ads_connections").select("*").eq("alma_id", almaId).maybeSingle();
  return data;
}

async function sincronizar(almaId: string, dias?: number) {
  const con = await conexion(almaId);
  if (!con) return { ok: false, msg: "Sin cuenta publicitaria conectada." };
  const token = await secreto(tokenDe(almaId));
  if (!token) return { ok: false, msg: "Falta el token: vuelve a conectar." };
  const act_ = `/act_${con.ad_account_id}`;
  const moneda = con.currency || "USD";
  try {
    // 1 · Estructura: campañas, conjuntos, anuncios y creativos.
    const [camps, sets, ads, creas] = await Promise.all([
      graphAll(`${act_}/campaigns`, token, { fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time", limit: "200" }),
      graphAll(`${act_}/adsets`, token, { fields: "id,name,campaign_id,status,effective_status,optimization_goal,daily_budget,lifetime_budget,start_time,end_time,created_time,targeting{age_min,age_max,genders,geo_locations,publisher_platforms}", limit: "200" }),
      graphAll(`${act_}/ads`, token, { fields: "id,name,campaign_id,adset_id,status,effective_status,created_time,issues_info,creative{id}", limit: "200" }),
      graphAll(`${act_}/adcreatives`, token, { fields: "id,title,body,thumbnail_url,image_url,object_type,call_to_action_type,video_id,link_url,effective_object_story_id", thumbnail_width: "480", thumbnail_height: "480", limit: "200" }).catch(() => []),
    ]);
    const creaPor = new Map(creas.map((c: any) => [c.id, c]));
    const ahora = new Date().toISOString();
    const objetos = [
      ...camps.map((c: any) => ({ alma_id: almaId, object_id: c.id, level: "campaign", campaign_id: c.id, name: c.name, status: c.status,
        effective_status: c.effective_status, objective: c.objective, daily_budget: presupuesto(c.daily_budget, moneda),
        lifetime_budget: presupuesto(c.lifetime_budget, moneda), start_time: c.start_time || null, stop_time: c.stop_time || null,
        created_time: c.created_time || null, updated_at: ahora })),
      ...sets.map((s: any) => ({ alma_id: almaId, object_id: s.id, level: "adset", campaign_id: s.campaign_id, adset_id: s.id, name: s.name,
        status: s.status, effective_status: s.effective_status, optimization_goal: s.optimization_goal,
        daily_budget: presupuesto(s.daily_budget, moneda), lifetime_budget: presupuesto(s.lifetime_budget, moneda),
        start_time: s.start_time || null, stop_time: s.end_time || null, created_time: s.created_time || null,
        targeting: s.targeting || null, updated_at: ahora })),
      ...ads.map((a: any) => {
        const c: any = creaPor.get(a.creative?.id) || {};
        return { alma_id: almaId, object_id: a.id, level: "ad", campaign_id: a.campaign_id, adset_id: a.adset_id, name: a.name,
          status: a.status, effective_status: a.effective_status, created_time: a.created_time || null,
          issues: a.issues_info || null, updated_at: ahora,
          creative: { id: c.id || a.creative?.id || null, thumbnail_url: c.thumbnail_url || null, image_url: c.image_url || null,
            title: c.title || null, body: c.body || null, cta: c.call_to_action_type || null, video_id: c.video_id || null,
            type: c.object_type || null, link: c.link_url || null, post_id: c.effective_object_story_id || null } };
      }),
    ];
    for (let i = 0; i < objetos.length; i += 500) {
      const { error } = await admin.from("meta_ads_objects").upsert(objetos.slice(i, i + 500), { onConflict: "alma_id,object_id" });
      if (error) throw error;
    }

    // 2 · Métricas diarias por anuncio. La primera vez 90 días; después
    //     solo se repasan los últimos 7 (Meta sigue ajustando la atribución).
    let n = dias;
    if (!n) {
      const { count } = await admin.from("meta_ads_daily").select("ad_id", { count: "exact", head: true }).eq("alma_id", almaId);
      n = count ? REPASO_DIAS : PRIMERA_VEZ_DIAS;
    }
    const filas = await graphAll(`${act_}/insights`, token, {
      level: "ad", time_increment: "1", limit: "500",
      time_range: JSON.stringify({ since: haceDias(n), until: dia(new Date()) }),
      fields: "ad_id,adset_id,campaign_id,date_start,spend,impressions,reach,frequency,clicks,inline_link_clicks,actions," +
              "video_thruplay_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions",
    });
    const diarias = filas.map((r: any) => {
      const a = r.actions || [];
      const v = (k: string) => act(r[k], "video_view");
      return {
        alma_id: almaId, ad_id: r.ad_id, day: r.date_start, campaign_id: r.campaign_id, adset_id: r.adset_id,
        spend: num(r.spend), impressions: num(r.impressions), reach: num(r.reach), frequency: r.frequency ? num(r.frequency) : null,
        clicks: num(r.clicks), link_clicks: num(r.inline_link_clicks) || act(a, "link_click"),
        landing_views: act(a, "landing_page_view", "omni_landing_page_view"),
        leads: act(a, "onsite_conversion.lead_grouped", "lead", "leadgen_grouped", "offsite_conversion.fb_pixel_lead"),
        messages: act(a, "onsite_conversion.messaging_conversation_started_7d"),
        engagement: act(a, "post_engagement", "page_engagement"),
        video_3s: act(a, "video_view"), thruplays: v("video_thruplay_watched_actions"),
        video_p25: v("video_p25_watched_actions"), video_p50: v("video_p50_watched_actions"),
        video_p75: v("video_p75_watched_actions"), video_p100: v("video_p100_watched_actions"),
        actions: a.length ? a : null, updated_at: ahora,
      };
    });
    for (let i = 0; i < diarias.length; i += 500) {
      const { error } = await admin.from("meta_ads_daily").upsert(diarias.slice(i, i + 500), { onConflict: "alma_id,ad_id,day" });
      if (error) throw error;
    }

    const msg = `${camps.length} campaña${camps.length === 1 ? "" : "s"} · ${ads.length} anuncio${ads.length === 1 ? "" : "s"} · ${diarias.length} días-anuncio`;
    await admin.from("meta_ads_connections").update({ last_sync_at: ahora, last_sync_ok: true, last_sync_msg: msg }).eq("alma_id", almaId);
    return { ok: true, msg };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    await admin.from("meta_ads_connections").update({ last_sync_at: new Date().toISOString(), last_sync_ok: false, last_sync_msg: msg }).eq("alma_id", almaId);
    return { ok: false, msg };
  }
}

// ---------------------------------------------------------------
// Consultas en vivo (no se guardan): alcance real y desgloses
// ---------------------------------------------------------------
// El alcance no se puede sumar día a día (la misma persona se cuenta cada
// día que te vio). Para un periodo hay que preguntárselo a Meta entero.
async function alcance(almaId: string, body: any) {
  const con = await conexion(almaId); const token = await secreto(tokenDe(almaId));
  if (!con || !token) return json({ ok: false, msg: "Sin conexión." }, 400);
  if (!fechaValida(body.since) || !fechaValida(body.until)) return json({ ok: false, msg: "Fechas inválidas." }, 400);
  const level = ["account", "campaign", "adset", "ad"].includes(body.level) ? body.level : "account";
  const filas = await graphAll(`/act_${con.ad_account_id}/insights`, token, {
    level, limit: "500", time_range: JSON.stringify({ since: body.since, until: body.until }),
    fields: level === "account" ? "reach,frequency,impressions" : `${level}_id,reach,frequency,impressions`,
  });
  return json({ ok: true, filas: filas.map((r: any) => ({ id: level === "account" ? "account" : r[`${level}_id`], reach: num(r.reach), frequency: num(r.frequency), impressions: num(r.impressions) })) });
}

const DESGLOSES: Record<string, string> = {
  edad: "age,gender",
  region: "region",
  ubicacion: "publisher_platform,platform_position",
  dispositivo: "impression_device",
  hora: "hourly_stats_aggregated_by_advertiser_time_zone",
};
async function desglose(almaId: string, body: any) {
  const con = await conexion(almaId); const token = await secreto(tokenDe(almaId));
  if (!con || !token) return json({ ok: false, msg: "Sin conexión." }, 400);
  const por = DESGLOSES[body.por];
  if (!por) return json({ ok: false, msg: "Desglose desconocido." }, 400);
  if (!fechaValida(body.since) || !fechaValida(body.until)) return json({ ok: false, msg: "Fechas inválidas." }, 400);
  // Un anuncio, conjunto o campaña que sea de esta cuenta (se comprueba en la tabla).
  let nodo = `/act_${con.ad_account_id}`;
  if (body.id) {
    const { data } = await admin.from("meta_ads_objects").select("object_id").eq("alma_id", almaId).eq("object_id", String(body.id)).maybeSingle();
    if (!data) return json({ ok: false, msg: "Ese anuncio no es de tu cuenta." }, 404);
    nodo = `/${data.object_id}`;
  }
  const filas = await graphAll(`${nodo}/insights`, token, {
    breakdowns: por, limit: "500", time_range: JSON.stringify({ since: body.since, until: body.until }),
    fields: "spend,impressions,reach,clicks,inline_link_clicks,actions",
  });
  const claves = por.split(",");
  return json({ ok: true, por: body.por, filas: filas.map((r: any) => ({
    clave: claves.map((k) => r[k]).filter(Boolean).join(" · "),
    spend: num(r.spend), impressions: num(r.impressions), reach: num(r.reach), clicks: num(r.clicks),
    link_clicks: num(r.inline_link_clicks),
    leads: act(r.actions, "onsite_conversion.lead_grouped", "lead", "leadgen_grouped", "offsite_conversion.fb_pixel_lead"),
  })) });
}

// ---------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  try {
    const body = JSON.parse((await req.text()) || "{}");

    if (body.action === "cron") {
      const llave = await secreto("meta_leads_cron_key");
      if (!llave || !iguales(req.headers.get("x-cron-key") || "", llave)) return json({ ok: false }, 401);
      const { data: cons } = await admin.from("meta_ads_connections").select("alma_id");
      const res = [];
      for (const c of cons || []) res.push({ alma: c.alma_id, ...(await sincronizar(c.alma_id)) });
      return json({ ok: true, cuentas: res.length, res });
    }

    const almaId = String(body.alma_id || "");
    if (!(await almaDelUsuario(req, almaId))) return json({ ok: false, msg: "Sesión no válida." }, 401);

    switch (body.action) {
      case "connect":    return await conectar(almaId, body);
      case "sync": {
        const d = Number(body.dias);
        return json(await sincronizar(almaId, d > 0 ? Math.min(365, Math.round(d)) : undefined));
      }
      case "alcance":    return await alcance(almaId, body);
      case "desglose":   return await desglose(almaId, body);
      case "disconnect": {
        await admin.rpc("meta_secret_forget", { p_name: tokenDe(almaId) });
        await admin.from("meta_ads_daily").delete().eq("alma_id", almaId);
        await admin.from("meta_ads_objects").delete().eq("alma_id", almaId);
        await admin.from("meta_ads_connections").delete().eq("alma_id", almaId);
        return json({ ok: true });
      }
      default: return json({ ok: false, msg: "Acción desconocida." }, 400);
    }
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("meta-ads", msg);
    return json({ ok: false, msg }, 500);
  }
});
