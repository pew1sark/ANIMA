// ===========================================================
// ANIMA TSC — Edge Function: tienda-shopify
//
// Tienda web de STUDIO: trae de Shopify los pedidos (con el recorrido
// de quien compró), las visitas por origen y los productos con su stock,
// para cruzarlos en STUDIO con los anuncios de Meta (meta_ads_*).
//
// PUERTAS
//   Desde STUDIO, con la sesión del Alma:
//     { action: "connect", alma_id, shop, client_id?, client_secret?, token? }
//        Con client_id + client_secret: app del Dev Dashboard instalada en la
//        tienda (client credentials, el token dura 24 h y se renueva solo).
//        Con token: una app antigua creada en el admin (shpat_…).
//     { action: "sync", alma_id, dias? }
//     { action: "ajustes", alma_id, meta_campaign_ids }   campañas de la tienda (null = solas)
//     { action: "visitas", alma_id, since, until, por, solo?, ad_id? }   desglose en vivo
//     { action: "disconnect", alma_id }
//   Cron de la base cada hora (x-cron-key, la misma de meta-leads):
//     { action: "cron" }
//
// LAS CREDENCIALES NO SALEN DE AQUÍ: viven en Vault (shopify_app_<alma>,
// shopify_token_<alma>). verify_jwt = false por lo mismo que meta-ads.
//
// API: GraphQL Admin 2026-10 · ShopifyQL (shopifyqlQuery) para las visitas.
// Permisos de la app: read_orders, read_products, read_customers,
// read_reports (visitas) y, si se quiere más de 60 días, read_all_orders.
// Deploy: supabase functions deploy tienda-shopify --no-verify-jwt
// ===========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API = "2026-10";
const PRIMERA_VEZ_DIAS = 90;
const REPASO_DIAS = 3;          // pedidos que cambiaron y visitas que Shopify termina de procesar

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------------------------------------------------------------
// Secretos y dueños
// ---------------------------------------------------------------
async function secreto(nombre: string): Promise<string | null> {
  const { data, error } = await admin.rpc("shop_secret_get", { p_name: nombre });
  if (error) throw error;
  return (data as string) || null;
}
async function guardarSecreto(nombre: string, valor: string) {
  const { error } = await admin.rpc("shop_secret_set", { p_name: nombre, p_value: valor });
  if (error) throw error;
}
const olvidar = (nombre: string) => admin.rpc("shop_secret_forget", { p_name: nombre });
const appDe = (almaId: string) => `shopify_app_${almaId}`;
const tokenDe = (almaId: string) => `shopify_token_${almaId}`;
const leerJSON = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch (_) { return null; } };

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
// Shopify
// ---------------------------------------------------------------
class ShopError extends Error {
  status?: number;
  constructor(msg: string, status?: number) { super(msg); this.status = status; }
}
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Solo dominios *.myshopify.com: la llave nunca viaja a otro servidor.
// Se acepta también la dirección del admin (admin.shopify.com/store/<tienda>).
function dominio(v: unknown): string | null {
  let s = String(v || "").trim().toLowerCase().replace(/^https?:\/\//, "");
  const enAdmin = s.match(/^admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)/);
  if (enAdmin) return `${enAdmin[1]}.myshopify.com`;
  s = s.split(/[/?#]/)[0];
  if (/^[a-z0-9][a-z0-9-]*$/.test(s)) s += ".myshopify.com";
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s) ? s : null;
}

// Client credentials: la app y la tienda tienen que ser de la misma organización.
async function pedirToken(shop: string, id: string, secret: string) {
  const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
  });
  // Shopify a veces responde el error en HTML o en error_description: se lee
  // el texto entero para no perder el motivo.
  const texto = await r.text().catch(() => "");
  let j: any = {};
  try { j = JSON.parse(texto); } catch (_) { /* no era JSON */ }
  if (!r.ok || !j.access_token) {
    const detalle = [j.error, j.error_description, typeof j.errors === "string" ? j.errors : j.errors ? JSON.stringify(j.errors) : ""]
      .filter(Boolean).join(": ") || texto.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    console.error("tienda-shopify token", r.status, detalle);
    if (/shop_not_permitted/i.test(detalle)) throw new ShopError("La app y la tienda no están en la misma organización de Shopify. Crea la app en el Dev Dashboard de la misma cuenta dueña de la tienda e instálala ahí.");
    if (/not[ _-]?installed/i.test(detalle)) throw new ShopError("La app no está instalada en la tienda. En dev.shopify.com abre la app, toca «Instalar app» y elige la tienda.");
    if (/invalid_client|unauthorized|client.?secret/i.test(detalle) || r.status === 401) throw new ShopError("Shopify no reconoce ese Client ID o Client secret. Cópialos de nuevo desde la configuración de la app en el Dev Dashboard.");
    if (r.status === 404) throw new ShopError("No existe una tienda con ese dominio. Revisa el «.myshopify.com».");
    throw new ShopError(`Shopify no entregó la llave (${r.status}${detalle ? ": " + detalle : ""}). Revisa que la app esté instalada en la tienda.`);
  }
  return { t: String(j.access_token), exp: Date.now() + (Number(j.expires_in) || 86399) * 1000, scope: String(j.scope || "") };
}

// La llave vigente: la guardada si le queda más de media hora; si no, una nueva.
async function llave(almaId: string, con: any): Promise<string> {
  const g = leerJSON(await secreto(tokenDe(almaId)));
  if (g?.t && (!g.exp || g.exp - Date.now() > 30 * 60 * 1000)) return g.t;
  if (con.auth_mode === "token") {
    if (g?.t) return g.t;
    throw new ShopError("Falta la llave de la tienda: vuelve a conectar.");
  }
  const app = leerJSON(await secreto(appDe(almaId)));
  if (!app?.id || !app?.secret) throw new ShopError("Faltan las credenciales de la app: vuelve a conectar.");
  const nueva = await pedirToken(con.shop_domain, app.id, app.secret);
  await guardarSecreto(tokenDe(almaId), JSON.stringify(nueva));
  return nueva.t;
}

function traducirHttp(status: number): string {
  if (status === 401) return "Shopify rechazó la llave: vuelve a conectar la tienda.";
  if (status === 402) return "La tienda está congelada en Shopify (pago pendiente del plan).";
  if (status === 403) return "La app no tiene permiso para esto. Revisa los permisos (scopes) de la versión de la app.";
  if (status === 404) return "No se encontró la tienda.";
  if (status === 423) return "La tienda está bloqueada en Shopify.";
  if (status >= 500) return "Shopify no respondió. Se reintenta solo en la próxima hora.";
  return `Shopify respondió ${status}.`;
}
function traducirGql(errs: any[]): string {
  const e = errs[0] || {};
  if (e?.extensions?.code === "ACCESS_DENIED") {
    const m = String(e.message || "");
    const scope = m.match(/`?(read_[a-z_]+)`?/)?.[1];
    return scope ? `Falta el permiso ${scope} en la app de Shopify.` : "Falta un permiso en la app de Shopify: " + m;
  }
  return String(e.message || "Shopify devolvió un error.");
}
const denegado = (errs: any[]) => (errs || []).some((e) => e?.extensions?.code === "ACCESS_DENIED");

// GraphQL con reintentos cuando Shopify pide esperar (límite por costo).
async function gql(shop: string, tok: string, query: string, variables: Record<string, unknown> = {}) {
  for (let i = 0; ; i++) {
    const r = await fetch(`https://${shop}/admin/api/${API}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": tok },
      body: JSON.stringify({ query, variables }),
    });
    if (r.status === 429 && i < 3) { await espera(2000 * (i + 1)); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new ShopError(traducirHttp(r.status), r.status);
    const errs = j.errors || [];
    if (errs.some((e: any) => e?.extensions?.code === "THROTTLED") && i < 3) {
      const t = j.extensions?.cost?.throttleStatus;
      const falta = t ? Math.max(0, (j.extensions.cost.requestedQueryCost || 100) - t.currentlyAvailable) / (t.restoreRate || 50) : 2;
      await espera(Math.min(10000, Math.ceil(falta * 1000) + 500));
      continue;
    }
    return { data: j.data, errs };
  }
}
async function gqlOk(shop: string, tok: string, query: string, variables: Record<string, unknown> = {}) {
  const { data, errs } = await gql(shop, tok, query, variables);
  if (errs.length) throw new ShopError(traducirGql(errs));
  return data;
}

// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------
const num = (v: any) => Number(v || 0) || 0;
const idNum = (gid: any) => gid ? String(gid).split("/").pop() || null : null;
const dinero = (s: any) => num(s?.shopMoney?.amount);
const fechaValida = (s: any) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
// Día de hoy y de hace n días en la zona horaria de la tienda (así cuenta ShopifyQL).
function diaEn(tz: string, menos = 0) {
  const d = new Date(Date.now() - menos * 86400000);
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
  catch (_) { return d.toISOString().slice(0, 10); }
}
const visita = (v: any) => v ? {
  at: v.occurredAt || null, source: v.source || null, type: v.sourceType || null,
  referrer: v.referrerUrl || null, landing: v.landingPage || null,
  utm: v.utmParameters ? { source: v.utmParameters.source || null, medium: v.utmParameters.medium || null,
    campaign: v.utmParameters.campaign || null, content: v.utmParameters.content || null, term: v.utmParameters.term || null } : null,
} : null;

// ---------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------
const INFO = `{
  shop { name myshopifyDomain primaryDomain { host } currencyCode ianaTimezone plan { publicDisplayName } }
  currentAppInstallation { accessScopes { handle } }
}`;

const VISITA = "occurredAt source sourceType referrerUrl landingPage utmParameters { source medium campaign content term }";
// Tres niveles, por si la app aún no tiene acceso a los datos protegidos de
// clientes: 2 = con nombre y región de quien compra, 1 = sin eso pero con el
// recorrido (de dónde llegó), 0 = solo el pedido. Los montos no dependen de eso.
const pedidosQuery = (nivel: number) => `query Pedidos($after: String, $q: String) {
  orders(first: 30, after: $after, query: $q, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name createdAt processedAt updatedAt cancelledAt test sourceName
      displayFinancialStatus displayFulfillmentStatus returnStatus
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      subtotalPriceSet { shopMoney { amount } }
      totalDiscountsSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      totalRefundedSet { shopMoney { amount } }
      ${nivel >= 2 ? "customer { id displayName numberOfOrders } shippingAddress { city province countryCodeV2 }" : ""}
      ${nivel >= 1 ? `customerJourneySummary {
        ready daysToConversion customerOrderIndex momentsCount { count }
        firstVisit { ${VISITA} }
        lastVisit { ${VISITA} }
      }` : ""}
      lineItems(first: 10) { nodes { title variantTitle quantity product { id } originalTotalSet { shopMoney { amount } } } }
    }
  }
}`;

const PRODUCTOS = `query Productos($after: String) {
  products(first: 100, after: $after, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle status totalInventory tracksInventory onlineStoreUrl updatedAt
      featuredMedia { preview { image { url(transform: { maxWidth: 240, maxHeight: 240 }) } } }
      priceRangeV2 { minVariantPrice { amount } maxVariantPrice { amount } }
    }
  }
}`;

const SHOPIFYQL = `query Visitas($q: String!) { shopifyqlQuery(query: $q) { parseErrors tableData { columns { name } rows } } }`;

async function infoTienda(shop: string, tok: string) {
  const d = await gqlOk(shop, tok, INFO);
  const scopes = (d.currentAppInstallation?.accessScopes || []).map((s: any) => s.handle);
  return {
    name: d.shop?.name || shop, host: d.shop?.primaryDomain?.host || null, currency: d.shop?.currencyCode || null,
    timezone: d.shop?.ianaTimezone || null, plan: d.shop?.plan?.publicDisplayName || null, scopes,
  };
}

async function shopifyql(shop: string, tok: string, q: string) {
  const { data, errs } = await gql(shop, tok, SHOPIFYQL, { q });
  if (errs.length) throw new ShopError(denegado(errs)
    ? "Las visitas necesitan el permiso read_reports y el acceso a datos protegidos de clientes en la app."
    : traducirGql(errs));
  const r = data?.shopifyqlQuery;
  if (r?.parseErrors?.length) throw new ShopError("ShopifyQL: " + r.parseErrors.join(" · "));
  return (r?.tableData?.rows || []) as Record<string, any>[];
}

// ---------------------------------------------------------------
// Conectar
// ---------------------------------------------------------------
async function conexion(almaId: string) {
  const { data } = await admin.from("shop_connections").select("*").eq("alma_id", almaId).maybeSingle();
  return data;
}
async function borrarDatos(almaId: string) {
  await admin.from("shop_orders").delete().eq("alma_id", almaId);
  await admin.from("shop_sessions_daily").delete().eq("alma_id", almaId);
  await admin.from("shop_products").delete().eq("alma_id", almaId);
}

async function conectar(almaId: string, body: any) {
  const shop = dominio(body.shop);
  if (!shop) return json({ ok: false, msg: "Escribe el dominio de la tienda: algo como mitienda.myshopify.com (o pega la dirección del admin: admin.shopify.com/store/…)." }, 400);
  const token = String(body.token || "").trim();
  const id = String(body.client_id || "").trim(), secret = String(body.client_secret || "").trim();
  let llaveNueva: { t: string; exp: number | null; scope: string };
  if (id && secret) llaveNueva = await pedirToken(shop, id, secret);
  else if (token) llaveNueva = { t: token, exp: null, scope: "" };
  else return json({ ok: false, msg: "Pega el Client ID y el Client secret de tu app (Dev Dashboard de Shopify)." }, 400);

  // Se prueba la llave antes de guardar nada.
  const info = await infoTienda(shop, llaveNueva.t);
  // write_orders también deja leer.
  if (info.scopes.length && !info.scopes.includes("read_orders") && !info.scopes.includes("write_orders"))
    return json({ ok: false, msg: "La app no tiene el permiso read_orders. Agrégalo en la versión de la app, publícala y apruébala en la tienda." }, 400);

  const anterior = await conexion(almaId);
  if (id && secret) await guardarSecreto(appDe(almaId), JSON.stringify({ id, secret }));
  else await olvidar(appDe(almaId));
  await guardarSecreto(tokenDe(almaId), JSON.stringify(llaveNueva));
  const otraTienda = anterior && anterior.shop_domain !== shop;
  if (otraTienda) await borrarDatos(almaId);   // lo de la tienda anterior no se mezcla
  const { error } = await admin.from("shop_connections").upsert({
    alma_id: almaId, shop_domain: shop, shop_name: info.name, primary_host: info.host, currency: info.currency,
    timezone: info.timezone, plan: info.plan, auth_mode: id && secret ? "app" : "token", scopes: info.scopes.join(","),
    connected_at: new Date().toISOString(), last_sync_ok: null, last_sync_msg: null,
    ...(otraTienda ? { meta_campaign_ids: null } : {}),
  }, { onConflict: "alma_id" });
  if (error) throw error;

  const sync = await sincronizar(almaId, PRIMERA_VEZ_DIAS);
  return json({ ok: true, tienda: { name: info.name, domain: info.host || shop, currency: info.currency }, sync });
}

// ---------------------------------------------------------------
// Sincronizar
// ---------------------------------------------------------------
async function sincronizar(almaId: string, dias?: number) {
  const con = await conexion(almaId);
  if (!con) return { ok: false, msg: "Sin tienda conectada." };
  const ahora = new Date().toISOString();
  try {
    const tok = await llave(almaId, con);
    const shop = con.shop_domain;
    const info = await infoTienda(shop, tok);
    const tz = info.timezone || con.timezone || "UTC";
    const avisos: string[] = [];

    // 1 · Pedidos. La primera vez los últimos 90 días (más allá de 60 pide
    //     read_all_orders); después los que cambiaron desde la última vez,
    //     que incluye los nuevos y los que se pagaron, despacharon o devolvieron.
    const { count } = await admin.from("shop_orders").select("order_id", { count: "exact", head: true }).eq("alma_id", almaId);
    const primera = !count && !con.last_sync_ok;
    const n = primera ? PRIMERA_VEZ_DIAS : (dias || 0);
    const desdeMs = n ? Date.now() - n * 86400000
      : con.last_sync_at ? new Date(con.last_sync_at).getTime() - REPASO_DIAS * 86400000
      : Date.now() - PRIMERA_VEZ_DIAS * 86400000;
    const q = `updated_at:>='${new Date(desdeMs).toISOString()}'`;
    let nivel = 2, pedidos = 0, after: string | null = null;
    for (let pag = 0; pag < 40; pag++) {
      let { data, errs } = await gql(shop, tok, pedidosQuery(nivel), { after, q });
      while (errs.length && denegado(errs) && nivel > 0) {
        nivel--;
        ({ data, errs } = await gql(shop, tok, pedidosQuery(nivel), { after, q }));
      }
      if (errs.length) throw new ShopError(traducirGql(errs));
      const nodos = (data?.orders?.nodes || []).filter((o: any) => !o.test);
      const filas = nodos.map((o: any) => {
        const cj = o.customerJourneySummary || null;
        const lineas = (o.lineItems?.nodes || []).map((l: any) => ({
          p: idNum(l.product?.id), t: l.title || "", v: l.variantTitle || null, q: num(l.quantity), a: dinero(l.originalTotalSet),
        }));
        return {
          alma_id: almaId, order_id: idNum(o.id), name: o.name, created_at: o.createdAt, processed_at: o.processedAt || null,
          updated_at: o.updatedAt || null, cancelled_at: o.cancelledAt || null, source_name: o.sourceName || null,
          financial_status: o.displayFinancialStatus || null, fulfillment_status: o.displayFulfillmentStatus || null,
          return_status: o.returnStatus || null,
          total: dinero(o.currentTotalPriceSet), subtotal: dinero(o.subtotalPriceSet), discounts: dinero(o.totalDiscountsSet),
          shipping: dinero(o.totalShippingPriceSet), refunded: dinero(o.totalRefundedSet),
          currency: o.currentTotalPriceSet?.shopMoney?.currencyCode || info.currency,
          items: lineas.reduce((s: number, l: any) => s + l.q, 0),
          ...(nivel >= 2 ? {
            customer_id: idNum(o.customer?.id), customer_name: o.customer?.displayName || null,
            customer_orders: o.customer ? num(o.customer.numberOfOrders) : null,
            city: o.shippingAddress?.city || null, region: o.shippingAddress?.province || null, country: o.shippingAddress?.countryCodeV2 || null,
          } : {}),
          ...(nivel >= 1 ? {
            customer_order_index: cj?.customerOrderIndex ?? null, journey_ready: cj ? !!cj.ready : null,
            days_to_conversion: cj?.daysToConversion ?? null, moments: cj?.momentsCount?.count ?? null,
            first_visit: visita(cj?.firstVisit), last_visit: visita(cj?.lastVisit),
          } : {}),
          lines: lineas, synced_at: ahora,
        };
      });
      if (filas.length) {
        const { error } = await admin.from("shop_orders").upsert(filas, { onConflict: "alma_id,order_id" });
        if (error) throw error;
      }
      pedidos += filas.length;
      const pi = data?.orders?.pageInfo;
      if (!pi?.hasNextPage) break;
      after = pi.endCursor;
    }

    if (nivel < 2) avisos.push("sin nombres de clientes (activa el acceso a datos protegidos en la app)");
    if (nivel < 1) avisos.push("sin el recorrido de quien compró: no se puede saber qué pedidos vinieron de un anuncio");

    // 2 · Productos activos con su stock (todos, cada vez: son pocos).
    const productos: any[] = [];
    after = null;
    let completos = false;
    for (let pag = 0; pag < 10; pag++) {
      const d = await gqlOk(shop, tok, PRODUCTOS, { after });
      for (const p of d?.products?.nodes || []) productos.push({
        alma_id: almaId, product_id: idNum(p.id), title: p.title, handle: p.handle, status: p.status,
        inventory: p.totalInventory ?? null, tracks_inventory: p.tracksInventory ?? null, url: p.onlineStoreUrl || null,
        image_url: p.featuredMedia?.preview?.image?.url || null,
        price_min: num(p.priceRangeV2?.minVariantPrice?.amount), price_max: num(p.priceRangeV2?.maxVariantPrice?.amount),
        updated_at: p.updatedAt || null, synced_at: ahora,
      });
      if (!d?.products?.pageInfo?.hasNextPage) { completos = true; break; }
      after = d.products.pageInfo.endCursor;
    }
    for (let i = 0; i < productos.length; i += 500) {
      const { error } = await admin.from("shop_products").upsert(productos.slice(i, i + 500), { onConflict: "alma_id,product_id" });
      if (error) throw error;
    }
    // Lo que ya no está activo (archivado, borrado, borrador) sale de la lista.
    if (completos) await admin.from("shop_products").delete().eq("alma_id", almaId).lt("synced_at", ahora);

    // 3 · Visitas por día y por origen. Si la app no tiene read_reports, el
    //     resto sigue funcionando y el panel usa lo que cuenta Meta.
    let sesionesOk = true, sesionesMsg: string | null = null, filasVisitas = 0;
    try {
      // Si el cron estuvo caído unos días, se recupera el tramo que faltó.
      const hueco = con.last_sync_at ? Math.ceil((Date.now() - new Date(con.last_sync_at).getTime()) / 86400000) + 1 : PRIMERA_VEZ_DIAS;
      const desde = diaEn(tz, n || Math.min(PRIMERA_VEZ_DIAS, Math.max(REPASO_DIAS, hueco))), hasta = diaEn(tz, 0);
      const rows = await shopifyql(shop, tok,
        "FROM sessions SHOW sessions, online_store_visitors, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout " +
        "GROUP BY referrer_source, referrer_name, utm_source, utm_medium, utm_campaign, utm_content, utm_term " +
        `TIMESERIES day SINCE ${desde} UNTIL ${hasta} LIMIT 10000`);
      const t = (v: any) => String(v ?? "").slice(0, 300);
      const filas = rows.filter((r) => num(r.sessions) > 0).map((r) => ({
        alma_id: almaId, day: String(r.day).slice(0, 10),
        referrer_source: t(r.referrer_source), referrer_name: t(r.referrer_name), utm_source: t(r.utm_source),
        utm_medium: t(r.utm_medium), utm_campaign: t(r.utm_campaign), utm_content: t(r.utm_content), utm_term: t(r.utm_term),
        sessions: num(r.sessions), visitors: num(r.online_store_visitors), carts: num(r.sessions_with_cart_additions),
        checkouts: num(r.sessions_that_reached_checkout), completed: num(r.sessions_that_completed_checkout), updated_at: ahora,
      }));
      // Shopify reprocesa los días recientes: se reemplaza el tramo entero.
      const { error: e1 } = await admin.from("shop_sessions_daily").delete().eq("alma_id", almaId).gte("day", desde);
      if (e1) throw e1;
      for (let i = 0; i < filas.length; i += 500) {
        const { error } = await admin.from("shop_sessions_daily").upsert(filas.slice(i, i + 500),
          { onConflict: "alma_id,day,referrer_source,referrer_name,utm_source,utm_medium,utm_campaign,utm_content,utm_term" });
        if (error) throw error;
      }
      filasVisitas = filas.length;
    } catch (e) {
      sesionesOk = false; sesionesMsg = (e as Error).message || String(e);
    }

    const msg = `${pedidos} pedido${pedidos === 1 ? "" : "s"} · ${productos.length} producto${productos.length === 1 ? "" : "s"}` +
      (sesionesOk ? ` · ${filasVisitas} orígenes de visitas` : " · sin visitas") + (avisos.length ? " · " + avisos.join(" · ") : "");
    await admin.from("shop_connections").update({
      shop_name: info.name, primary_host: info.host, currency: info.currency, timezone: info.timezone, plan: info.plan,
      scopes: info.scopes.join(","), last_sync_at: ahora, last_sync_ok: true, last_sync_msg: msg,
      sessions_ok: sesionesOk, sessions_msg: sesionesMsg,
    }).eq("alma_id", almaId);
    return { ok: true, msg };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    await admin.from("shop_connections").update({ last_sync_at: ahora, last_sync_ok: false, last_sync_msg: msg }).eq("alma_id", almaId);
    return { ok: false, msg };
  }
}

// ---------------------------------------------------------------
// Visitas en vivo: de dónde son, en qué entran y qué página abren
// ---------------------------------------------------------------
const POR: Record<string, string> = {
  region: "session_region",
  ciudad: "session_city",
  dispositivo: "session_device_type",
  pagina: "landing_page_path",
  origen: "referrer_name",
};
// Lo que deja un anuncio de Facebook/Instagram/Messenger, con o sin UTM.
const DESDE_META = "(utm_source IN ('facebook', 'fb', 'ig', 'instagram', 'meta', 'messenger', 'msg', 'an', 'audience_network', 'threads')" +
  " OR referrer_name IN ('Facebook', 'Instagram', 'Messenger', 'Threads'))";

async function visitas(almaId: string, body: any) {
  const con = await conexion(almaId);
  if (!con) return json({ ok: false, msg: "Sin tienda conectada." }, 400);
  const dim = POR[body.por];
  if (!dim) return json({ ok: false, msg: "Desglose desconocido." }, 400);
  if (!fechaValida(body.since) || !fechaValida(body.until)) return json({ ok: false, msg: "Fechas inválidas." }, 400);
  const filtros: string[] = [];
  if (body.solo === "meta") filtros.push(DESDE_META);
  if (body.ad_id != null && body.ad_id !== "") {
    if (!/^\d{1,30}$/.test(String(body.ad_id))) return json({ ok: false, msg: "Anuncio inválido." }, 400);
    filtros.push(`utm_content = '${body.ad_id}'`);
  }
  const tok = await llave(almaId, con);
  const rows = await shopifyql(con.shop_domain, tok,
    "FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout " +
    `GROUP BY ${dim} ${filtros.length ? "WHERE " + filtros.join(" AND ") : ""} ` +
    `SINCE ${body.since} UNTIL ${body.until} ORDER BY sessions DESC LIMIT 30`);
  return json({ ok: true, por: body.por, filas: rows.map((r) => ({
    clave: r[dim] ?? "", sessions: num(r.sessions), carts: num(r.sessions_with_cart_additions),
    checkouts: num(r.sessions_that_reached_checkout), completed: num(r.sessions_that_completed_checkout),
  })).filter((x) => x.sessions) });
}

// ---------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  try {
    const body = JSON.parse((await req.text()) || "{}");

    if (body.action === "cron") {
      const { data: k } = await admin.rpc("meta_secret_get", { p_name: "meta_leads_cron_key" });
      const llaveCron = (k as string) || "";
      if (!llaveCron || !iguales(req.headers.get("x-cron-key") || "", llaveCron)) return json({ ok: false }, 401);
      const { data: cons } = await admin.from("shop_connections").select("alma_id");
      const res = [];
      for (const c of cons || []) res.push({ alma: c.alma_id, ...(await sincronizar(c.alma_id)) });
      return json({ ok: true, tiendas: res.length, res });
    }

    const almaId = String(body.alma_id || "");
    if (!(await almaDelUsuario(req, almaId))) return json({ ok: false, msg: "Sesión no válida." }, 401);

    switch (body.action) {
      case "connect": return await conectar(almaId, body);
      case "sync": {
        const d = Number(body.dias);
        return json(await sincronizar(almaId, d > 0 ? Math.min(365, Math.round(d)) : undefined));
      }
      case "ajustes": {
        const ids = body.meta_campaign_ids;
        if (ids !== null && !(Array.isArray(ids) && ids.length <= 100 && ids.every((x: any) => /^\d{1,30}$/.test(String(x)))))
          return json({ ok: false, msg: "Campañas inválidas." }, 400);
        const { error } = await admin.from("shop_connections").update({ meta_campaign_ids: ids === null ? null : ids.map(String) }).eq("alma_id", almaId);
        if (error) throw error;
        return json({ ok: true });
      }
      case "visitas": return await visitas(almaId, body);
      case "disconnect": {
        await olvidar(appDe(almaId));
        await olvidar(tokenDe(almaId));
        await borrarDatos(almaId);
        await admin.from("shop_connections").delete().eq("alma_id", almaId);
        return json({ ok: true });
      }
      default: return json({ ok: false, msg: "Acción desconocida." }, 400);
    }
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("tienda-shopify", msg);
    return json({ ok: false, msg }, e instanceof ShopError ? 400 : 500);
  }
});
