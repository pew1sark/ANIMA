/* ===========================================================
   ANIMA STUDIO — Tienda web (Taller)
   -----------------------------------------------------------
   El estado real de una tienda de Shopify, cruzado con los anuncios
   de Meta que llevan gente a ella: quién entra desde cada anuncio,
   qué agrega al carrito, quién compra y cuánto deja cada peso
   invertido.

   DE DÓNDE SALE CADA NÚMERO
   - Shopify (tablas shop_*, migración 0147): la Edge Function
     `tienda-shopify` sincroniza cada hora los pedidos (con el
     recorrido de quien compró: primera y última visita, UTM y
     referente), las visitas por día y por origen (ShopifyQL) y los
     productos con su stock. Al abrir la pestaña se pide una
     actualización si la última tiene más de 15 minutos.
   - Meta: lo del panel de Anuncios (`AD`, tablas meta_ads_*), solo de
     las campañas de la tienda. Las compras «según Meta» salen del
     píxel (columna actions); las ventas reales, de Shopify.
   - Visita → anuncio: utm_content = id del anuncio, utm_term = id del
     conjunto, utm_campaign = id o nombre de la campaña. Sin UTM, Meta
     se reconoce por el referente (facebook.com, instagram.com, fbclid),
     pero ya no se sabe qué anuncio fue.
   - Un pedido viene del anuncio si su última visita (o la primera, si
     la última fue directa) vino de un anuncio de Meta: último clic no
     directo, como lo cuenta Shopify.

   Vive en `TW`, en memoria, como `AD` y `CC`.
   Se carga DESPUÉS de anuncios.js (usa sus ad*).
   =========================================================== */

const TW = { con: undefined, orders: [], sessions: [], products: [], loading: false, busy: "", almaId: null, error: "",
             rango: "7", desde: "", hasta: "", campana: "", open: null, connectOpen: false, autoSync: false,
             acts: [], actsKey: "", visitas: {}, porVisitas: "region", soloMeta: true, metaEspera: false, verTodos: false };

/* Lo que deja un anuncio de Facebook, Instagram, Messenger o Audience Network. */
const TW_META_FUENTES = ["facebook", "fb", "ig", "instagram", "meta", "messenger", "msg", "an", "audience_network", "threads"];
const TW_META_REF = /(^|\.)(facebook|instagram|messenger|threads)\.(com|net)$|(^|\.)fb\.(me|com)$/;
const TW_PAGADO = ["paid", "cpc", "ppc", "cpm", "paid_social", "paidsocial", "paid-social", "ads", "ad", "pagado", "anuncio"];
/* Parámetros de URL para el anuncio: con los id, el cruce es exacto aunque se renombre todo. */
const TW_UTM = "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}";
const TW_CANALES = [
  ["meta", "Anuncios de Meta"], ["metaorg", "Meta orgánico"], ["google", "Buscadores"],
  ["tiktok", "TikTok"], ["email", "Correo"], ["directo", "Directo"], ["otros", "Otros sitios"], ["manual", "Venta manual"]
];
const TW_PIXEL = {
  ver: ["omni_view_content", "offsite_conversion.fb_pixel_view_content", "view_content"],
  carrito: ["omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart", "add_to_cart"],
  pago: ["omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "initiate_checkout"],
  compra: ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "purchase"]
};
const TW_PAGO = {
  PAID: ["Pagado", "ad-on"], PENDING: ["Por cobrar", "ad-rev"], AUTHORIZED: ["Autorizado", "ad-rev"], PARTIALLY_PAID: ["Pago parcial", "ad-rev"],
  PARTIALLY_REFUNDED: ["Reembolso parcial", "ad-off"], REFUNDED: ["Reembolsado", "ad-off"], VOIDED: ["Anulado", "ad-off"], EXPIRED: ["Pago vencido", "ad-bad"]
};
const TW_ENVIO = {
  FULFILLED: ["Despachado", "ad-on"], UNFULFILLED: ["Por preparar", "ad-rev"], OPEN: ["Por preparar", "ad-rev"], PENDING_FULFILLMENT: ["Por preparar", "ad-rev"],
  PARTIALLY_FULFILLED: ["Envío parcial", "ad-rev"], IN_PROGRESS: ["Preparando", "ad-rev"], SCHEDULED: ["Programado", "ad-rev"],
  ON_HOLD: ["En espera", "ad-bad"], REQUEST_DECLINED: ["Rechazado", "ad-bad"], RESTOCKED: ["Repuesto", "ad-off"]
};
/* Pedidos que esperan algo de la tienda: despacharlos o cobrarlos. */
const TW_POR_PREPARAR = ["UNFULFILLED", "OPEN", "PENDING_FULFILLMENT", "PARTIALLY_FULFILLED", "IN_PROGRESS", "ON_HOLD"];
const TW_POR_COBRAR = ["PENDING", "AUTHORIZED", "PARTIALLY_PAID"];
const TW_VISITAS = [["region", "Región"], ["ciudad", "Ciudad"], ["dispositivo", "Dispositivo"], ["pagina", "Página de entrada"]];

/* ---------- formato ---------- */
const twLow = s => String(s == null ? "" : s).trim().toLowerCase();
function twSlug(s){ return twLow(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function twHost(u){ try{ return new URL(u).hostname.replace(/^www\./, ""); }catch(e){ return ""; } }
function twCur(){ return (TW.con && TW.con.currency) || (typeof ANIMA_CUR !== "undefined" ? ANIMA_CUR : "CLP"); }
const twMoney = n => adMoney(n, null, twCur());
function twHora(iso){ return new Date(iso).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", ""); }
const twUrl = u => /^https:\/\//i.test(String(u || "")) ? String(u) : "";
function twAdminUrl(path){ const h = String((TW.con && TW.con.shop_domain) || "").replace(/\.myshopify\.com$/, ""); return "https://admin.shopify.com/store/" + encodeURIComponent(h) + (path || ""); }
function twDia(o){ if(!o._dia) o._dia = adYmd(new Date(o.created_at)); return o._dia; }

/* Cuánto vale 1 unidad de la moneda de Meta en la moneda de la tienda. Si la
   tienda vende en la moneda de ANIMA, es el mismo número de Anuncios. */
function twFxClave(){ const de = adCur(), a = twCur(); return a === (typeof ANIMA_CUR !== "undefined" ? ANIMA_CUR : "CLP") ? "anima_ads_fx_" + de : "anima_tw_fx_" + de + "_" + a; }
function twFx(){
  const de = adCur(), a = twCur();
  if(de === a) return 1;
  if(a === (typeof ANIMA_CUR !== "undefined" ? ANIMA_CUR : "CLP")) return adFx();
  try{ const v = Number(localStorage.getItem(twFxClave())); if(v > 0) return v; }catch(e){}
  return de === "USD" && a === "CLP" ? 950 : 1;
}

/* ---------- datos ---------- */
async function twCargar(){
  const a = me();
  if(TW.loading) return;
  if(!Cloud.enabled || !Cloud.client || !a || !a.live || !a.almaId){ TW.con = null; return; }
  TW.loading = true;
  try{
    const c = await Cloud.client.from("shop_connections").select("*").eq("alma_id", a.almaId).maybeSingle();
    if(c.error) throw c.error;
    TW.con = c.data || null; TW.almaId = a.almaId;
    if(TW.con){
      const desde = adDia(-400);
      const [o, s, p] = await Promise.all([
        adTodo(q => q.from("shop_orders").select("*").eq("alma_id", a.almaId).gte("created_at", desde).order("created_at", { ascending: false })),
        adTodo(q => q.from("shop_sessions_daily").select("day,referrer_source,referrer_name,utm_source,utm_medium,utm_campaign,utm_content,utm_term,sessions,visitors,carts,checkouts,completed")
          .eq("alma_id", a.almaId).gte("day", desde).order("day")),
        adTodo(q => q.from("shop_products").select("*").eq("alma_id", a.almaId))
      ]);
      TW.orders = o; TW.sessions = s; TW.products = p; TW.error = "";
    }
  }catch(e){ console.error("ANIMA · tienda web", e); TW.con = TW.con === undefined ? null : TW.con; TW.error = e.message || String(e); }
  TW.loading = false;
  twRefresh();
  twAutoSync();
}
/* «Estado real»: si lo guardado tiene más de 15 minutos, se le pregunta a Shopify al abrir. */
function twAutoSync(){
  const c = TW.con;
  if(!c || TW.autoSync || TW.busy) return;
  TW.autoSync = true;
  if(c.last_sync_at && Date.now() - new Date(c.last_sync_at).getTime() < 15 * 60000) return;
  TW.busy = "auto"; twRefresh();
  twFn({ action: "sync" }).catch(() => {}).finally(() => { TW.busy = ""; twCargar(); });
}
function twRefresh(){
  if(state.view !== "tienda") return;
  const f = document.activeElement;
  if(f && f.closest && f.closest("#view") && /^(INPUT|TEXTAREA)$/.test(f.tagName)) return;
  const d = document.querySelector(".tw-drawer"), y = d ? d.scrollTop : 0;
  renderView();
  const d2 = document.querySelector(".tw-drawer"); if(d2 && y) d2.scrollTop = y;
}
async function twFn(body){
  const s = await Cloud.session();
  if(!s) throw new Error("Tu sesión expiró. Vuelve a entrar.");
  const r = await fetch(SB_URL + "/functions/v1/tienda-shopify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + s.access_token, "apikey": SB_KEY },
    body: JSON.stringify({ ...body, alma_id: me().almaId })
  });
  const j = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(j.msg || ("Error " + r.status));
  return j;
}
/* Los anuncios los carga el panel de Anuncios; aquí solo se espera a que estén. */
function twCargarMeta(){
  if(typeof AD === "undefined" || AD.con !== undefined || TW.metaEspera) return;
  TW.metaEspera = true;
  const listo = () => { TW.metaEspera = false; twRefresh(); };
  if(AD.loading){ setTimeout(listo, 700); return; }
  Promise.resolve(loadAds()).finally(listo);
}
/* Eventos del píxel (carrito, pago, compra según Meta) de las campañas de la tienda. */
async function twCargarPixel(ids){
  const key = [...ids].sort().join(",");
  if(!key || TW.actsKey === key) return;
  TW.actsKey = key;
  try{
    TW.acts = await adTodo(q => q.from("meta_ads_daily").select("ad_id,day,campaign_id,actions")
      .eq("alma_id", me().almaId).in("campaign_id", [...ids]).gte("day", adDia(-400)));
  }catch(e){ TW.acts = []; }
  twRefresh();
}

/* ---------- de dónde viene cada visita y cada pedido ---------- */
function twIndice(){
  if(TW._idx && TW._idxDe === AD.objs) return TW._idx;
  const i = { ad: new Map(), set: new Map(), camp: new Map(), adN: new Map(), setN: new Map(), campN: new Map() };
  for(const o of AD.objs){
    const [porId, porNombre] = o.level === "ad" ? [i.ad, i.adN] : o.level === "adset" ? [i.set, i.setN] : [i.camp, i.campN];
    porId.set(String(o.object_id), o);
    const s = twSlug(o.name); if(s && !porNombre.has(s)) porNombre.set(s, o);
  }
  TW._idx = i; TW._idxDe = AD.objs;
  return i;
}
/* ¿Qué anuncio, conjunto o campaña de Meta trajo esta visita? Por id (exacto) y, si no, por nombre. */
function twAnuncioDe(x){
  if(!x || typeof AD === "undefined" || !AD.objs.length) return null;
  const i = twIndice();
  const c = String(x.content || "").trim(), t = String(x.term || "").trim(), k = String(x.campaign || "").trim();
  const ad = i.ad.get(c) || i.ad.get(t) || (c && i.adN.get(twSlug(c)));
  if(ad) return { ad: ad.object_id, set: ad.adset_id, camp: ad.campaign_id };
  const set = i.set.get(t) || i.set.get(c) || (t && i.setN.get(twSlug(t)));
  if(set) return { ad: null, set: set.object_id, camp: set.campaign_id };
  const camp = i.camp.get(k) || (k && i.campN.get(twSlug(k)));
  return camp ? { ad: null, set: null, camp: camp.object_id } : null;
}
/* Canal de un «toque»: {source, medium, campaign, content, term, ref, refSource, referrer, landing}. */
function twCanal(x){
  const src = twLow(x.source), med = twLow(x.medium), ref = twLow(x.ref), rs = twLow(x.refSource);
  const meta = TW_META_FUENTES.includes(src) || /facebook|instagram|messenger|threads/.test(ref) || TW_META_REF.test(twHost(x.referrer)) || /[?&]fbclid=/.test(x.landing || "");
  if(meta) return TW_PAGADO.includes(med) || twAnuncioDe(x) ? "meta" : "metaorg";
  if(/google|bing|yahoo|duckduckgo|ecosia/.test(src + " " + ref) || rs === "search") return "google";
  if(/tiktok/.test(src + " " + ref)) return "tiktok";
  if(med === "email" || rs === "email" || /mail|klaviyo|newsletter/.test(src)) return "email";
  if(!src && !med && !twHost(x.referrer) && (!ref || ref === "direct" || rs === "direct")) return "directo";
  return "otros";
}
const twToqueSesion = r => ({ source: r.utm_source, medium: r.utm_medium, campaign: r.utm_campaign, content: r.utm_content, term: r.utm_term, ref: r.referrer_name, refSource: r.referrer_source });
function twToqueVisita(v){ const u = (v && v.utm) || {}; return { source: u.source, medium: u.medium, campaign: u.campaign, content: u.content, term: u.term, ref: v && v.source, refSource: "", referrer: v && v.referrer, landing: v && v.landing }; }
function twDirecta(v){ return !v || (!v.utm && !twHost(v.referrer) && (!v.source || twLow(v.source) === "direct") && !/[?&]fbclid=/.test(v.landing || "")); }
/* La visita que se lleva el pedido: la última, salvo que haya sido directa. */
function twVisitaDe(o){ const lv = o.last_visit, fv = o.first_visit; return !twDirecta(lv) ? lv : !twDirecta(fv) ? fv : (lv || fv || null); }
/* Canal y anuncio, calculados una vez por cada versión de los anuncios cargados. */
function twInfoSesion(r){
  if(r._k !== AD.objs){ const x = twToqueSesion(r); r._k = AD.objs; r._canal = twCanal(x); r._ad = r._canal === "meta" ? twAnuncioDe(x) : null; }
  return r;
}
function twInfoPedido(o){
  if(o._k !== AD.objs){
    const sn = twLow(o.source_name), v = twVisitaDe(o), x = v ? twToqueVisita(v) : null;
    o._k = AD.objs;
    o._canal = sn === "pos" || sn === "shopify_draft_order" ? "manual" : x ? twCanal(x) : sn === "web" ? "directo" : "otros";
    o._ad = o._canal === "meta" ? twAnuncioDe(x) : null;
  }
  return o;
}
const twNuevo = o => o.customer_order_index === 1 || (o.customer_order_index == null && o.customer_orders === 1);

/* Campañas de Meta que llevan a la tienda: las elegidas en ⚙ o, si no, las que
   aparecen en los UTM de la tienda y las que buscan Ventas o Tráfico. */
function twCampanas(){
  if(typeof AD === "undefined" || !AD.con) return [];
  const camps = AD.objs.filter(o => o.level === "campaign");
  const elegidas = TW.con && TW.con.meta_campaign_ids;
  if(Array.isArray(elegidas)) return camps.filter(c => elegidas.includes(c.object_id));
  const porUtm = new Set();
  for(const r of TW.sessions){ const x = twInfoSesion(r); if(x._ad && x._ad.camp) porUtm.add(x._ad.camp); }
  for(const o of TW.orders){ const x = twInfoPedido(o); if(x._ad && x._ad.camp) porUtm.add(x._ad.camp); }
  return camps.filter(c => porUtm.has(c.object_id) || /OUTCOME_SALES|OUTCOME_TRAFFIC|CONVERSIONS|LINK_CLICKS|PRODUCT_CATALOG_SALES/.test(c.objective || ""));
}
function twIds(){ return new Set((TW.campana ? (TW._camps || []).filter(c => c.object_id === TW.campana) : (TW._camps || [])).map(c => c.object_id)); }
const twDeLaCampana = x => x._canal === "meta" && (!TW.campana || (x._ad && x._ad.camp === TW.campana));

function twAct(lista, tipos){
  for(const t of tipos){ const x = (lista || []).find(a => a.action_type === t); if(x) return Number(x.value || 0) || 0; }
  return 0;
}
function twPixel(desde, hasta, filtro){
  const t = { ver: 0, carrito: 0, pago: 0, compra: 0 }, ids = twIds();
  for(const r of TW.acts){
    if(r.day < desde || r.day > hasta || !ids.has(r.campaign_id) || (filtro && !filtro(r))) continue;
    for(const k in TW_PIXEL) t[k] += twAct(r.actions, TW_PIXEL[k]);
  }
  return t;
}

/* Todo lo de un periodo: la tienda entera y lo que vino de los anuncios. */
function twResumen(desde, hasta){
  const sum = (l, k) => l.reduce((s, x) => s + Number(x[k] || 0), 0);
  const ped = TW.orders.filter(o => !o.cancelled_at && twDia(o) >= desde && twDia(o) <= hasta).map(twInfoPedido);
  const ses = TW.sessions.filter(r => r.day >= desde && r.day <= hasta).map(twInfoSesion);
  const pedMeta = ped.filter(twDeLaCampana), sesMeta = ses.filter(twDeLaCampana);
  const ids = twIds();
  const m = typeof AD !== "undefined" && AD.con ? adSuma(AD.daily.filter(r => r.day >= desde && r.day <= hasta && ids.has(r.campaign_id))) : null;
  const clientes = l => new Set(l.map(o => o.customer_id || o.order_id)).size;
  return {
    ped, ses, pedMeta, sesMeta, m,
    ventas: sum(ped, "total"), pedidos: ped.length, nuevos: clientes(ped.filter(twNuevo)),
    visitas: sum(ses, "sessions"), carritos: sum(ses, "carts"), pago: sum(ses, "checkouts"), completadas: sum(ses, "completed"),
    ventasMeta: sum(pedMeta, "total"), pedidosMeta: pedMeta.length, nuevosMeta: clientes(pedMeta.filter(twNuevo)),
    visitasMeta: sum(sesMeta, "sessions"), carritosMeta: sum(sesMeta, "carts"), pagoMeta: sum(sesMeta, "checkouts")
  };
}

/* ---------- vista ---------- */
function vTienda(a){
  if(!a.live || !Cloud.enabled) return `<div class="grid"><div class="card s12"><p class="muted">La tienda web necesita tu sesión en la nube de ANIMA.</p></div></div>`;
  if(TW.almaId && TW.almaId !== a.almaId){ Object.assign(TW, { con: undefined, orders: [], sessions: [], products: [], acts: [], actsKey: "", visitas: {}, open: null, autoSync: false, campana: "" }); }
  if(TW.con === undefined){ setTimeout(twCargar, 0); return `<div class="grid"><div class="card s12 ld-cargando"><span class="ld-spin"></span>Cargando la tienda…</div></div>`; }
  if(!TW.con) return `<div class="grid ad tw">${twConectarHTML(true)}</div>`;
  twCargarMeta();

  const meta = typeof AD !== "undefined" && AD.con;
  TW._camps = twCampanas();
  if(TW.campana && !TW._camps.some(c => c.object_id === TW.campana)) TW.campana = "";
  const ids = twIds();
  if(meta && ids.size) setTimeout(() => twCargarPixel(new Set(TW._camps.map(c => c.object_id))), 0);

  const p = adPeriodo(TW);
  const r = twResumen(p.desde, p.hasta), r0 = twResumen(p.prevDesde, p.prevHasta);
  const fx = twFx();
  const t = r.m || adSuma([]), t0 = r0.m || adSuma([]);
  const roas = t.spend ? r.ventasMeta / (t.spend * fx) : NaN, roas0 = t0.spend ? r0.ventasMeta / (t0.spend * fx) : NaN;
  const cpa = r.pedidosMeta && t.spend ? t.spend * fx / r.pedidosMeta : NaN, cpa0 = r0.pedidosMeta && t0.spend ? t0.spend * fx / r0.pedidosMeta : NaN;
  const sesOk = TW.con.sessions_ok !== false;
  const opt = (v, txt, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(txt)}</option>`;

  const delta = (x, y, malo) => {
    if(!isFinite(x) || !isFinite(y) || !y) return `<small class="ad-d">—</small>`;
    const v = (x - y) / Math.abs(y); if(Math.abs(v) < 0.005) return `<small class="ad-d">= igual</small>`;
    const bien = malo ? v < 0 : v > 0;
    return `<small class="ad-d ${bien ? "ad-up" : "ad-down"}">${v > 0 ? "▲" : "▼"} ${adPct(Math.abs(v), 0)}</small>`;
  };
  const sub = s => `<small class="ad-d">${s}</small>`;
  const tile = (k, v, d, ayuda) => `<div class="ad-kpi" ${ayuda ? `title="${esc(ayuda)}"` : ""}><span>${esc(k)}</span><b>${v}</b>${d || ""}</div>`;

  const filtros = `<div class="ad-filtros">
      <select class="ld-sel on" data-twrango aria-label="Periodo">${AD_RANGOS.map(([k, x]) => opt(k, x, TW.rango)).join("")}</select>
      ${TW.rango === "rango" ? `<span class="ld-rango"><input type="date" data-twfecha="desde" value="${esc(TW.desde || p.desde)}" aria-label="Desde"><span>→</span><input type="date" data-twfecha="hasta" value="${esc(TW.hasta || p.hasta)}" aria-label="Hasta"></span>` : ""}
      ${meta && TW._camps.length > 1 ? `<select class="ld-sel ${TW.campana ? "on" : ""}" data-twcampana aria-label="Campaña">${opt("", "Todas las campañas de la tienda", TW.campana)}${TW._camps.map(c => opt(c.object_id, (c.name || "") + (adVigente(c) ? "" : " · " + AD_VIDA[adVida(c)][0].toLowerCase()), TW.campana)).join("")}</select>` : ""}
      <span class="ad-per muted">${esc(adFechaCorta(p.desde))} – ${esc(adFechaCorta(p.hasta))} · vs. ${esc(adFechaCorta(p.prevDesde))} – ${esc(adFechaCorta(p.prevHasta))}</span>
    </div>`;

  const kpisTienda = `<div class="ad-kpis">
      ${tile("Ventas", twMoney(r.ventas), delta(r.ventas, r0.ventas), "Total de los pedidos del periodo (después de devoluciones), sin los anulados")}
      ${tile("Pedidos", adNum(r.pedidos), delta(r.pedidos, r0.pedidos))}
      ${tile("Ticket promedio", r.pedidos ? twMoney(r.ventas / r.pedidos) : "—", delta(r.pedidos ? r.ventas / r.pedidos : NaN, r0.pedidos ? r0.ventas / r0.pedidos : NaN))}
      ${tile("Clientes nuevos", adNum(r.nuevos), r.pedidos ? sub(adPct(r.nuevos / Math.max(r.pedidos, 1), 0) + " de los pedidos") : "", "Personas cuya primera compra en la tienda cae en el periodo")}
      ${tile("Visitas", sesOk ? adNum(r.visitas) : "—", sesOk ? delta(r.visitas, r0.visitas) : sub("sin permiso"), "Sesiones en la tienda online (Shopify)")}
      ${tile("Agregaron al carrito", sesOk ? adNum(r.carritos) : "—", sesOk && r.visitas ? sub(adPct(r.carritos / r.visitas, 1) + " de las visitas") : "")}
      ${tile("Llegaron al pago", sesOk ? adNum(r.pago) : "—", sesOk && r.visitas ? sub(adPct(r.pago / r.visitas, 1) + " de las visitas") : "")}
      ${tile("Conversión", sesOk && r.visitas ? adPct(r.completadas / r.visitas, 2) : "—", sesOk ? delta(r.visitas ? r.completadas / r.visitas : NaN, r0.visitas ? r0.completadas / r0.visitas : NaN) : "", "Visitas que terminaron en compra")}
    </div>`;
  const kpisMeta = meta ? `<div class="ad-kpis ad-kpis-n">
      ${tile("Inversión", adMoney(t.spend), fx !== 1 && t.spend ? sub("≈ " + twMoney(t.spend * fx)) : delta(t.spend, t0.spend), "Lo gastado en Meta en las campañas de la tienda")}
      ${tile("Clics en el enlace", adNum(t.link_clicks), delta(t.link_clicks, t0.link_clicks), "Según Meta")}
      ${tile("Entraron a la tienda", sesOk ? adNum(r.visitasMeta) : adNum(t.landing_views), sesOk ? (t.link_clicks ? sub(adPct(Math.min(r.visitasMeta / t.link_clicks, 9.99), 0) + " de los clics") : delta(r.visitasMeta, r0.visitasMeta)) : sub("según Meta"), "Visitas a la tienda que vinieron de un anuncio (Shopify)")}
      ${tile("Al carrito", sesOk ? adNum(r.carritosMeta) : "—", sesOk && r.visitasMeta ? sub(adPct(r.carritosMeta / r.visitasMeta, 1) + " de esas visitas") : "")}
      ${tile("Compras", adNum(r.pedidosMeta), r.nuevosMeta ? sub(adNum(r.nuevosMeta) + " cliente" + (r.nuevosMeta === 1 ? "" : "s") + " nuevo" + (r.nuevosMeta === 1 ? "" : "s")) : delta(r.pedidosMeta, r0.pedidosMeta), "Pedidos cuyo último clic (no directo) vino de un anuncio")}
      ${tile("Ventas del anuncio", twMoney(r.ventasMeta), delta(r.ventasMeta, r0.ventasMeta))}
      ${tile("Retorno (ROAS)", isFinite(roas) && t.spend ? adDec(roas, 2) + "×" : "—", fx !== 1 ? sub(`<button class="ad-fx" data-twfx>1 ${esc(adCur())} = ${esc(adNum(fx))} ${esc(twCur())}</button>`) : delta(roas, roas0), "Ventas del anuncio / inversión")}
      ${tile("Costo por venta", isFinite(cpa) ? twMoney(cpa) : "—", delta(cpa, cpa0, true), "Inversión / compras del anuncio")}
    </div>` : `<div class="tw-sinmeta"><span>Conecta tu cuenta publicitaria en <b>Anuncios</b> para ver cuánto invertiste y cuánto volvió.</span><button class="btn ghost sm" data-twgo="anuncios">Ir a Anuncios</button></div>`;

  return `<div class="grid ad tw">
    <div class="card s12 ad-card">
      <div class="ld-head">
        <div class="ld-title"><h2>Tienda web</h2><p>${esc(TW.con.shop_name || TW.con.shop_domain)} · ${esc(TW.con.primary_host || TW.con.shop_domain)} · ${esc(twCur())} · ${twConexionTxt()}</p></div>
        <div class="ld-tools">
          <button class="btn ghost sm" data-twsync ${TW.busy ? "disabled" : ""}>${TW.busy ? "Actualizando…" : "↻ Actualizar"}</button>
          <a class="btn ghost sm" href="https://${esc(TW.con.primary_host || TW.con.shop_domain)}" target="_blank" rel="noopener">Ver tienda ↗</a>
          <a class="btn ghost sm" href="${esc(twAdminUrl(""))}" target="_blank" rel="noopener">Shopify ↗</a>
          <button class="btn ghost sm" data-twconnect aria-label="Ajustes de la tienda">⚙</button>
        </div>
      </div>
      ${TW.connectOpen ? twAjustesHTML() : ""}
      ${twVivoHTML()}
      ${filtros}
      <div class="ad-sec"><span class="ld-lbl">En la tienda</span>${kpisTienda}</div>
      <div class="ad-sec"><span class="ld-lbl">Desde tus anuncios${meta ? " · " + twCampanasTxt() : ""}</span>${kpisMeta}</div>
    </div>
    ${twSaludHTML(p, r, t)}
    <div class="card s12 ad-card"><div class="ad-h"><h3>Día a día</h3><small class="muted">Pasa el dedo o el mouse por una barra para ver el detalle</small></div>
      <div class="ad-charts">
        ${adGrafico(p, "v", "Ventas por día", v => twMoney(v), r.ped.map(o => ({ day: twDia(o), v: o.total })))}
        ${sesOk ? adGrafico(p, "sessions", "Entraron desde un anuncio", v => adNum(v), r.sesMeta) : adGrafico(p, "v", "Pedidos por día", v => adNum(v), r.ped.map(o => ({ day: twDia(o), v: 1 })))}
        ${meta ? adGrafico(p, "spend", "Inversión por día", v => adMoney(v), AD.daily.filter(x => x.day >= p.desde && x.day <= p.hasta && ids.has(x.campaign_id))) : adGrafico(p, "v", "Pedidos desde un anuncio", v => adNum(v), r.pedMeta.map(o => ({ day: twDia(o), v: 1 })))}
      </div>
    </div>
    <div class="card s12 ad-card"><div class="ad-h"><h3>Del anuncio a la compra</h3><small class="muted">Cuántos pasan de un paso al siguiente</small></div>
      ${twEmbudo(t, r, sesOk, meta)}
      ${meta ? twPixelHTML(p, r) : ""}
    </div>
    ${twClientesHTML(r)}
    <div class="card s7 ad-card">${twVisitasHTML(p, sesOk)}</div>
    <div class="card s5 ad-card">${twCanalesHTML(r)}</div>
    ${meta ? `<div class="card s12 ad-card">${twAnunciosHTML(p, r, fx)}</div>` : ""}
    <div class="card s12 ad-card">${twProductosHTML(r)}</div>
  </div>
  ${TW.open ? twPedidoHTML(TW.orders.find(o => o.order_id === TW.open)) : ""}`;
}

function twConexionTxt(){
  const c = TW.con; if(!c) return "";
  if(TW.busy === "auto") return `<span>actualizando con Shopify…</span>`;
  const mal = c.last_sync_ok === false;
  return `<span class="${mal ? "ad-bad-t" : ""}">${esc(mal ? "Error: " + (c.last_sync_msg || "") : "actualizado " + (c.last_sync_at ? "hace " + timeAgo(c.last_sync_at) : "—"))}</span>`;
}
function twCampanasTxt(){
  const c = TW._camps || [];
  const modo = Array.isArray(TW.con.meta_campaign_ids) ? "elegida" + (c.length === 1 ? "" : "s") : "detectada" + (c.length === 1 ? "" : "s");
  return c.length ? `${c.length} campaña${c.length === 1 ? "" : "s"} ${modo} <button class="ad-fx tw-lbl-b" data-twcamps>cambiar</button>` : `ninguna campaña de la tienda <button class="ad-fx tw-lbl-b" data-twcamps>elegir</button>`;
}

/* Lo que está pasando ahora: hoy, pedidos que esperan algo y stock. */
function twVivoHTML(){
  const hoy = adDia(0), c = TW.con;
  const ped = TW.orders.filter(o => !o.cancelled_at);
  const deHoy = ped.filter(o => twDia(o) === hoy);
  const visitasHoy = TW.sessions.filter(r => r.day === hoy).reduce((s, r) => s + r.sessions, 0);
  const metaHoy = TW.sessions.filter(r => r.day === hoy).map(twInfoSesion).filter(r => r._canal === "meta").reduce((s, r) => s + r.sessions, 0);
  const preparar = ped.filter(o => o.financial_status === "PAID" && TW_POR_PREPARAR.includes(o.fulfillment_status));
  const cobrar = ped.filter(o => TW_POR_COBRAR.includes(o.financial_status));
  const agotados = TW.products.filter(x => x.tracks_inventory && x.inventory != null && x.inventory <= 0);
  const edad = c.last_sync_at ? Date.now() - new Date(c.last_sync_at).getTime() : Infinity;
  const led = c.last_sync_ok === false ? "mal" : edad < 20 * 60000 ? "on" : "";
  const sesOk = c.sessions_ok !== false;
  const anunciosVivos = typeof AD !== "undefined" && AD.con ? AD.objs.filter(o => o.level === "ad" && (TW._camps || []).some(x => x.object_id === o.campaign_id) && adVida(o) === "marcha").length : null;
  const pill = (k, v, s, attr, cls) => `<div class="tw-pill ${cls || ""}" ${attr || ""}><span>${k}</span><b>${v}</b>${s ? `<small>${s}</small>` : ""}</div>`;
  return `<div class="tw-vivo" role="group" aria-label="Estado de la tienda ahora">
    ${pill(`<i class="tw-led ${led}" aria-hidden="true"></i>${TW.busy === "auto" ? "Actualizando…" : led === "mal" ? "Sin conexión" : led ? "En vivo" : "Hace " + esc(timeAgo(c.last_sync_at) || "—")}`,
      sesOk ? adNum(visitasHoy) : "—", sesOk ? `visita${visitasHoy === 1 ? "" : "s"} hoy${metaHoy ? " · " + adNum(metaHoy) + " por anuncios" : ""}` : "sin datos de visitas")}
    ${pill("Pedidos de hoy", adNum(deHoy.length), deHoy.length ? twMoney(deHoy.reduce((s, o) => s + Number(o.total || 0), 0)) : "aún ninguno")}
    ${pill("Por preparar", adNum(preparar.length), preparar.length ? "pagados, sin despachar" : "todo despachado", preparar.length ? `data-twir="preparar" role="button" tabindex="0" title="Ver el que lleva más tiempo esperando"` : "", preparar.length ? "tw-pill-a" : "")}
    ${pill("Por cobrar", adNum(cobrar.length), cobrar.length ? "esperan el pago" : "nada pendiente", cobrar.length ? `data-twir="cobrar" role="button" tabindex="0" title="Ver el que lleva más tiempo esperando"` : "", cobrar.length ? "tw-pill-a" : "")}
    ${pill("Productos", adNum(TW.products.length), agotados.length ? adNum(agotados.length) + " agotado" + (agotados.length === 1 ? "" : "s") : "todos con stock", "", agotados.length ? "tw-pill-a" : "")}
    ${anunciosVivos != null ? pill("Anuncios en marcha", adNum(anunciosVivos), anunciosVivos ? "llevan gente a la tienda" : "ninguno entregando", "", anunciosVivos ? "" : "tw-pill-a") : ""}
  </div>`;
}

/* Salud: lo que conviene mirar hoy. Siempre ícono + texto. */
function twAlertas(p, r, t){
  const out = [], c = TW.con, sesOk = c.sessions_ok !== false, meta = typeof AD !== "undefined" && AD.con, ids = twIds();
  if(c.last_sync_ok === false) out.push({ nivel: "critico", t: "No se pudo leer la tienda", d: c.last_sync_msg || "Revisa la conexión en ⚙.", ir: "ajustes" });
  if(meta){
    for(const o of AD.objs.filter(x => x.level === "ad" && ids.has(x.campaign_id) && adVida(x) === "problema")){
      const motivo = Array.isArray(o.issues) && o.issues[0] ? (o.issues[0].error_summary || o.issues[0].error_message || "") : "";
      out.push({ nivel: "critico", t: (o.name || "Anuncio") + ": " + (AD_ESTADO[o.effective_status] || [o.effective_status])[0].toLowerCase(), d: motivo || "No se está mostrando. Revísalo en el Administrador de anuncios.", ad: o.object_id });
    }
    if(sesOk && t.link_clicks >= 15 && !r.visitasMeta)
      out.push({ nivel: "alto", t: "Meta cuenta " + adNum(t.link_clicks) + " clics y la tienda no ve ninguna visita de un anuncio", d: "El anuncio no lleva parámetros de URL o no apunta a la tienda. Copia los parámetros desde ⚙ y pégalos en el anuncio.", ir: "ajustes" });
    else if(sesOk && t.link_clicks >= 30 && r.visitasMeta / t.link_clicks < 0.5)
      out.push({ nivel: "alto", t: "Solo " + adDec(r.visitasMeta / t.link_clicks * 10, 0) + " de cada 10 clics llega a la tienda", d: "El resto se va antes de que cargue. Revisa la velocidad (fotos pesadas) y que el enlace lleve directo al producto del anuncio." });
    /* Contra qué se mide «gastó mucho»: el ticket promedio de 90 días o, en una
       tienda que aún no vende, el precio del producto típico. */
    const ref = TW.orders.filter(o => !o.cancelled_at && twDia(o) >= adDia(-89));
    const precios = TW.products.map(x => Number(x.price_min || 0)).filter(x => x > 0).sort((a, b) => a - b);
    const ventaRef = ref.length ? ref.reduce((s, o) => s + Number(o.total || 0), 0) / ref.length : precios.length ? precios[Math.floor(precios.length / 2)] : 0;
    if(t.spend && !r.pedidosMeta && ventaRef && t.spend * twFx() > ventaRef * 1.5)
      out.push({ nivel: "alto", t: adMoney(t.spend) + " invertidos sin una venta desde el anuncio", d: "Ya se gastó más que 1,5 veces " + (ref.length ? "el ticket promedio" : "el precio típico de un producto") + " de la tienda (" + twMoney(ventaRef) + "). Mira dónde se cae el embudo antes de seguir invirtiendo." });
  }
  if(sesOk && r.visitasMeta >= 40 && !r.carritosMeta)
    out.push({ nivel: "alto", t: adNum(r.visitasMeta) + " visitas desde el anuncio y nadie agregó al carrito", d: "La página de destino tiene que mostrar el producto del anuncio con su precio, fotos y el botón a la vista." });
  if(sesOk && r.carritosMeta >= 3 && !r.pedidosMeta)
    out.push({ nivel: "medio", t: adNum(r.carritosMeta) + " agregaron al carrito desde el anuncio y nadie compró", d: "Revisa el costo de envío y los medios de pago, y que el correo de carrito abandonado esté activo en Shopify." });
  const viejo = Date.now() - 48 * 3600000;
  const atrasados = TW.orders.filter(o => !o.cancelled_at && o.financial_status === "PAID" && ["UNFULFILLED", "OPEN", "PENDING_FULFILLMENT"].includes(o.fulfillment_status) && new Date(o.created_at).getTime() < viejo);
  if(atrasados.length) out.push({ nivel: "alto", t: atrasados.length + " pedido" + (atrasados.length === 1 ? "" : "s") + " pagado" + (atrasados.length === 1 ? "" : "s") + " esperando despacho hace más de 2 días", d: atrasados.slice(0, 4).map(o => o.name).join(", ") + ". Cada día de espera baja la nota y la recompra.", pedido: atrasados[0].order_id });
  const cobrar = TW.orders.filter(o => !o.cancelled_at && o.financial_status === "PENDING");
  if(cobrar.length) out.push({ nivel: "medio", t: cobrar.length + " pedido" + (cobrar.length === 1 ? "" : "s") + " por cobrar", d: "Pagos pendientes (transferencia u otro medio manual). Confírmalos o escríbeles.", pedido: cobrar[0].order_id });
  const agotados = TW.products.filter(x => x.tracks_inventory && x.inventory != null && x.inventory <= 0);
  if(agotados.length) out.push({ nivel: "medio", t: agotados.length + " producto" + (agotados.length === 1 ? "" : "s") + " activo" + (agotados.length === 1 ? "" : "s") + " sin stock", d: agotados.slice(0, 4).map(x => x.title).join(", ") + ". Siguen visibles pero no se pueden comprar: repón o escóndelos, sobre todo si salen en un anuncio." });
  if(meta){
    const px = twPixel(p.desde, p.hasta);
    if(px.compra > r.pedidosMeta) out.push({ nivel: "bajo", t: "Meta se atribuye " + adNum(px.compra) + " compra" + (px.compra === 1 ? "" : "s") + " y Shopify ve " + adNum(r.pedidosMeta) + " desde el anuncio", d: "Meta cuenta a quien vio el anuncio y compró después (hasta 1 día) o hizo clic (hasta 7 días); Shopify, el último clic. Las ventas reales son las de Shopify." });
    const sinId = r.sesMeta.filter(x => !x._ad).reduce((s, x) => s + x.sessions, 0);
    if(sinId >= 5) out.push({ nivel: "bajo", t: adNum(sinId) + " visitas de anuncios sin anuncio identificado", d: "Agrega utm_content={{ad.id}} a los parámetros de URL para saber qué anuncio las trajo.", ir: "ajustes" });
    if(Array.isArray(c.meta_campaign_ids)){
      const fuera = new Map();
      for(const x of r.ses) if(x._canal === "meta" && x._ad && x._ad.camp && !c.meta_campaign_ids.includes(x._ad.camp)) fuera.set(x._ad.camp, (fuera.get(x._ad.camp) || 0) + x.sessions);
      for(const [id, n] of fuera) out.push({ nivel: "bajo", t: ((adObj(id) || {}).name || "Una campaña") + " trae visitas a la tienda (" + adNum(n) + ") y no está en la lista", d: "Agrégala en «cambiar» para sumar su inversión al retorno.", ir: "campanas" });
    }
  }
  if(!sesOk) out.push({ nivel: "bajo", t: "Sin datos de visitas de Shopify", d: (c.sessions_msg || "") + " Mientras tanto se usan las visitas que cuenta Meta.", ir: "ajustes" });
  const orden = { critico: 0, alto: 1, medio: 2, bajo: 3 };
  return out.sort((x, y) => orden[x.nivel] - orden[y.nivel]);
}
function twSaludHTML(p, r, t){
  const al = twAlertas(p, r, t);
  const ICO = { critico: "⛔", alto: "▲", medio: "●", bajo: "○" };
  const TXT = { critico: "Crítico", alto: "Importante", medio: "Mirar", bajo: "Sugerencia" };
  const attr = x => x.ad ? `data-twad="${esc(x.ad)}"` : x.pedido ? `data-twpedido="${esc(x.pedido)}"` : x.ir ? `data-twir="${esc(x.ir)}"` : "";
  return `<div class="card s12 ad-card"><div class="ad-h"><h3>Salud de la tienda</h3><small class="muted">${al.length ? al.length + " cosa" + (al.length === 1 ? "" : "s") + " por mirar" : "Todo en orden"}</small></div>
    ${al.length ? `<ul class="ad-alertas">${al.slice(0, 8).map(x => `<li class="ad-al ad-al-${x.nivel} ${attr(x) ? "tw-al-go" : ""}" ${attr(x)} ${attr(x) ? `role="button" tabindex="0"` : ""}>
        <span class="ad-al-i" aria-hidden="true">${ICO[x.nivel]}</span><div><b>${esc(x.t)}</b><small>${esc(x.d)}</small></div><span class="ad-al-t">${TXT[x.nivel]}</span></li>`).join("")}</ul>`
      : `<p class="muted" style="margin:6px 0 0;font-size:13px">Sin pedidos atrasados, sin productos agotados y con el anuncio llevando gente a la tienda.</p>`}</div>`;
}

function twEmbudo(t, r, sesOk, meta){
  const pasos = [
    ...(meta ? [["Vieron el anuncio", t.impressions, "Impresiones (Meta)"], ["Hicieron clic", t.link_clicks, "Clics en el enlace (Meta)"]] : []),
    sesOk ? ["Entraron a la tienda", r.visitasMeta, "Visitas desde un anuncio (Shopify)"] : ["Cargaron la página", t.landing_views, "Vistas de la página de destino (Meta)"],
    ...(sesOk ? [["Agregaron al carrito", r.carritosMeta, "Shopify"], ["Llegaron al pago", r.pagoMeta, "Shopify"]] : []),
    ["Compraron", r.pedidosMeta, "Pedidos atribuidos al anuncio (Shopify)"]
  ];
  const max = Math.max(pasos[0][1], 1);
  return `<div class="ad-funnel">${pasos.map(([k, v, ayuda], i) => {
    const prev = i ? pasos[i - 1][1] : 0;
    const conv = !i || !prev ? "" : v > prev ? "incluye visitas de días anteriores" : adPct(v / prev, v / prev < 0.01 ? 2 : 1) + " del paso anterior";
    const w = v ? Math.max(2, Math.sqrt(v / max) * 100) : 0;   // escala raíz: las impresiones son miles y las compras, pocas
    return `<div class="ad-step" title="${esc(ayuda)}"><span class="ad-step-k">${esc(k)}</span><span class="ad-step-bar"><i style="width:${w}%"></i></span><b>${adNum(v)}</b><small>${conv}</small></div>`;
  }).join("")}</div>`;
}
/* Lo que cuenta el píxel de Meta, al lado de lo que ve Shopify. */
function twPixelHTML(p, r){
  const px = twPixel(p.desde, p.hasta);
  if(!px.ver && !px.carrito && !px.pago && !px.compra) return `<p class="muted ad-nota">Meta no reporta eventos del píxel en estas campañas. Si quieres compararlos, conecta el canal «Facebook e Instagram» de Shopify (instala el píxel y la API de conversiones).</p>`;
  const fila = (k, a, b) => `<div class="tw-px-r"><span>${esc(k)}</span><b>${adNum(a)}</b><b>${b == null ? "—" : adNum(b)}</b></div>`;
  return `<div class="tw-px"><div class="tw-px-r tw-px-h"><span>Lo que cuenta cada uno</span><span>Píxel de Meta</span><span>Shopify</span></div>
    ${fila("Vieron un producto", px.ver, null)}${fila("Agregaron al carrito", px.carrito, TW.con.sessions_ok !== false ? r.carritosMeta : null)}
    ${fila("Iniciaron el pago", px.pago, TW.con.sessions_ok !== false ? r.pagoMeta : null)}${fila("Compraron", px.compra, r.pedidosMeta)}</div>`;
}

/* Las personas que compraron desde un anuncio (quien solo mira no deja nombre: va en «¿Quién entra?»). */
function twClientesHTML(r){
  const lista = r.pedMeta.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const nuevos = lista.filter(twNuevo).length;
  const ventas = lista.reduce((s, o) => s + Number(o.total || 0), 0);
  const mostrar = TW.verTodos ? lista : lista.slice(0, 8);
  const fila = o => {
    const ad = o._ad && o._ad.ad ? adObj(o._ad.ad) : null, camp = o._ad && o._ad.camp ? adObj(o._ad.camp) : null;
    const pago = TW_PAGO[o.financial_status], env = TW_ENVIO[o.fulfillment_status];
    const prods = (o.lines || []).map(l => (l.q > 1 ? l.q + "× " : "") + l.t).join(", ");
    const idx = o.customer_order_index || o.customer_orders;
    return `<li><button class="tw-cli" data-twpedido="${esc(o.order_id)}">
      <span class="tw-cli-n"><b>${esc(o.customer_name || "Cliente sin nombre")}</b>
        <small>${esc(o.name || "")} · ${esc(twHora(o.created_at))}${o.region ? " · " + esc(o.region) : ""}</small>
        <small class="tw-cli-p">${esc(prods || "—")}</small>
        <small>${ad ? "Anuncio: " + esc(ad.name || "") : camp ? "Campaña: " + esc(camp.name || "") : "Anuncio sin identificar"}${o.days_to_conversion != null ? " · compró " + (o.days_to_conversion ? "a los " + o.days_to_conversion + " día" + (o.days_to_conversion === 1 ? "" : "s") : "el mismo día") : ""}</small>
        <span class="tw-tags">${twNuevo(o) ? `<span class="ad-st ad-on">Nuevo</span>` : idx > 1 ? `<span class="ad-st ad-off">${adNum(idx)}ª compra</span>` : ""}
        ${pago ? `<span class="ad-st ${pago[1]}">${esc(pago[0])}</span>` : ""}${env && o.financial_status === "PAID" ? `<span class="ad-st ${env[1]}">${esc(env[0])}</span>` : ""}</span></span>
      <span class="tw-cli-v"><b>${twMoney(o.total)}</b></span>
    </button></li>`;
  };
  return `<div class="card s12 ad-card"><div class="ad-h"><h3>Clientes que llegaron por el anuncio</h3>
      <small class="muted">${lista.length ? `${adNum(lista.length)} compra${lista.length === 1 ? "" : "s"} · ${twMoney(ventas)} · ${adNum(nuevos)} nuevo${nuevos === 1 ? "" : "s"}, ${adNum(lista.length - nuevos)} que ya habían comprado` : "Nadie compró desde un anuncio en este periodo"}</small></div>
    ${lista.length ? `<ul class="tw-clis">${mostrar.map(fila).join("")}</ul>
      ${lista.length > 8 ? `<button class="btn ghost sm" data-twtodos style="margin-top:10px">${TW.verTodos ? "Ver menos" : "Ver las " + adNum(lista.length)}</button>` : ""}`
      : `<p class="muted" style="margin:4px 0 0;font-size:13px">${r.visitasMeta ? adNum(r.visitasMeta) + " persona" + (r.visitasMeta === 1 ? "" : "s") + " entraron desde un anuncio: en «¿Quién entra desde el anuncio?» ves de dónde son y qué página abrieron." : "Cuando alguien compre después de tocar un anuncio, aparece aquí con lo que compró y qué anuncio lo trajo."}</p>`}
  </div>`;
}

/* Desglose en vivo de las visitas (ShopifyQL): región, ciudad, dispositivo, página. */
function twVisitasHTML(p, sesOk){
  const titulo = `<div class="ad-h"><h3>¿Quién entra ${TW.soloMeta ? "desde el anuncio" : "a la tienda"}?</h3>
    <span class="ad-vista" role="group" aria-label="Qué visitas"><button class="ld-camp ad-vb ${TW.soloMeta ? "on" : ""}" data-twsolo="1" aria-pressed="${TW.soloMeta}">Desde anuncios</button><button class="ld-camp ad-vb ${TW.soloMeta ? "" : "on"}" data-twsolo="0" aria-pressed="${!TW.soloMeta}">Todas</button></span></div>`;
  if(!sesOk) return titulo + `<p class="muted" style="font-size:13px">Shopify no entregó las visitas: ${esc(TW.con.sessions_msg || "falta el permiso read_reports")}. Agrégalo a la app y vuelve a conectar.</p>`;
  const k = [p.desde, p.hasta, TW.porVisitas, TW.soloMeta ? "meta" : "todas"].join("|"), des = TW.visitas[k];
  if(des === undefined){ const q = { since: p.desde, until: p.hasta, por: TW.porVisitas, solo: TW.soloMeta ? "meta" : "" }; setTimeout(() => twPedirVisitas(k, q), 0); }
  let cuerpo;
  if(!des) cuerpo = `<p class="muted" style="font-size:13px">Consultando a Shopify…</p>`;
  else if(des.error) cuerpo = `<p class="muted" style="font-size:13px">${esc(des.error)}</p>`;
  else if(!des.filas.length) cuerpo = `<p class="muted" style="font-size:13px">Sin visitas en este periodo.</p>`;
  else {
    const max = Math.max(...des.filas.map(x => x.sessions), 1);
    const nombre = x => TW.porVisitas === "dispositivo" ? ({ mobile: "Celular", desktop: "Computador", tablet: "Tableta" }[twLow(x)] || x || "Sin dato") : (x || "Sin dato");
    cuerpo = `<div class="ad-des">${des.filas.slice(0, 15).map(x => `<div class="ad-des-r"><span class="ad-des-k tw-des-k" title="${esc(nombre(x.clave))}">${esc(nombre(x.clave))}</span><span class="ad-step-bar"><i style="width:${Math.max(2, x.sessions / max * 100)}%"></i></span>
        <span class="ad-des-v"><b>${adNum(x.sessions)} visita${x.sessions === 1 ? "" : "s"}</b><small>${adNum(x.carts)} al carrito · ${adNum(x.completed)} compra${x.completed === 1 ? "" : "s"}</small></span></div>`).join("")}</div>`;
  }
  return titulo + `<div class="ad-seg">${TW_VISITAS.map(([v, x]) => `<button class="ld-camp ${TW.porVisitas === v ? "on" : ""}" data-twpor="${v}">${esc(x)}</button>`).join("")}</div>${cuerpo}
    <p class="muted ad-nota">Visitas anónimas: Shopify no guarda quién es la persona hasta que compra o deja su correo.</p>`;
}
async function twPedirVisitas(k, q){
  if(TW.visitas[k] !== undefined) return;
  TW.visitas[k] = null;
  try{ const r = await twFn({ action: "visitas", ...q }); TW.visitas[k] = r.ok ? r : { error: r.msg }; }
  catch(e){ TW.visitas[k] = { error: e.message }; }
  twRefresh();
}

/* De dónde vienen las visitas y las ventas. */
function twCanalesHTML(r){
  const fila = {};
  for(const [k] of TW_CANALES) fila[k] = { visitas: 0, pedidos: 0, ventas: 0 };
  for(const x of r.ses) fila[x._canal].visitas += x.sessions;
  for(const o of r.ped) { fila[o._canal].pedidos++; fila[o._canal].ventas += Number(o.total || 0); }
  const lista = TW_CANALES.filter(([k]) => fila[k].visitas || fila[k].pedidos);
  if(!lista.length) return `<div class="ad-h"><h3>Canales</h3></div><p class="muted" style="font-size:13px">Sin visitas ni pedidos en este periodo.</p>`;
  const max = Math.max(...lista.map(([k]) => fila[k].visitas), 1);
  return `<div class="ad-h"><h3>Canales</h3><small class="muted">De dónde vienen las visitas y las ventas</small></div>
    <div class="ad-des">${lista.map(([k, t]) => { const f = fila[k];
      return `<div class="ad-des-r tw-can ${k === "meta" ? "tw-can-on" : ""}"><span class="ad-des-k tw-des-k" title="${esc(t)}">${esc(t)}</span><span class="ad-step-bar"><i style="width:${f.visitas ? Math.max(2, f.visitas / max * 100) : 0}%"></i></span>
        <span class="ad-des-v"><b>${adNum(f.visitas)} visita${f.visitas === 1 ? "" : "s"}</b><small>${adNum(f.pedidos)} pedido${f.pedidos === 1 ? "" : "s"}${f.ventas ? " · " + twMoney(f.ventas) : ""}${f.visitas && f.pedidos ? " · " + adPct(f.pedidos / f.visitas, 1) : ""}</small></span></div>`; }).join("")}</div>
    <p class="muted ad-nota">«Directo» incluye a quien escribe la dirección y a los anuncios sin parámetros de URL: Instagram suele abrir la tienda sin decir de dónde viene.</p>`;
}

/* Cada anuncio de la tienda: lo que costó y lo que trajo. */
function twAnunciosHTML(p, r, fx){
  const ids = twIds();
  const ads = AD.objs.filter(o => o.level === "ad" && ids.has(o.campaign_id));
  const filas = ads.map(o => {
    const t = adSuma(AD.daily.filter(x => x.ad_id === o.object_id && x.day >= p.desde && x.day <= p.hasta));
    const ses = r.sesMeta.filter(x => x._ad && x._ad.ad === o.object_id), ped = r.pedMeta.filter(x => x._ad && x._ad.ad === o.object_id);
    const visitas = ses.reduce((s, x) => s + x.sessions, 0), carritos = ses.reduce((s, x) => s + x.carts, 0);
    const ventas = ped.reduce((s, x) => s + Number(x.total || 0), 0);
    const px = twPixel(p.desde, p.hasta, x => x.ad_id === o.object_id);
    return { o, t, visitas, carritos, pedidos: ped.length, ventas, roas: t.spend ? ventas / (t.spend * fx) : NaN, cpa: ped.length && t.spend ? t.spend * fx / ped.length : NaN, pixel: px.compra };
  }).filter(x => x.t.spend || x.visitas || x.pedidos || adVigente(x.o)).sort((a, b) => (b.t.spend - a.t.spend) || (b.visitas - a.visitas));
  const sinId = r.sesMeta.filter(x => !x._ad || !x._ad.ad), pedSinId = r.pedMeta.filter(x => !x._ad || !x._ad.ad);
  const miniatura = o => { const c = o.creative || {}; const u = c.thumbnail_url || c.image_url; return u ? `<img class="ad-thumb" src="${esc(u)}" alt="" loading="lazy">` : `<span class="ad-thumb ad-thumb-v" aria-hidden="true">▣</span>`; };
  const cols = ["Anuncio", "Estado", "Inversión", "Clics", "Entraron", "Carrito", "Compras", "Ventas", "ROAS", "Costo/venta", "Compras (Meta)"];
  const head = `<div class="ad-tr tw-tr ad-thr" role="row">${cols.map(c => `<span class="ad-th" role="columnheader">${esc(c)}</span>`).join("")}</div>`;
  const cuerpo = filas.map(x => `<div class="ad-tr tw-tr" role="row" tabindex="0" data-twad="${esc(x.o.object_id)}">
      <span class="ad-td ad-td-n" role="cell">${miniatura(x.o)}<span><b>${esc(x.o.name || "Sin nombre")}</b><small>${esc((adObj(x.o.campaign_id) || {}).name || "")}</small></span></span>
      <span class="ad-td" role="cell">${adEstadoBadge(x.o)}</span>
      <span class="ad-td" role="cell">${adMoney(x.t.spend)}</span>
      <span class="ad-td" role="cell">${adNum(x.t.link_clicks)}</span>
      <span class="ad-td" role="cell">${adNum(x.visitas)}</span>
      <span class="ad-td" role="cell">${adNum(x.carritos)}</span>
      <span class="ad-td" role="cell">${adNum(x.pedidos)}</span>
      <span class="ad-td" role="cell">${twMoney(x.ventas)}</span>
      <span class="ad-td" role="cell">${isFinite(x.roas) && x.t.spend ? adDec(x.roas, 2) + "×" : "—"}</span>
      <span class="ad-td" role="cell">${isFinite(x.cpa) ? twMoney(x.cpa) : "—"}</span>
      <span class="ad-td" role="cell">${adNum(x.pixel)}</span>
    </div>`).join("");
  const nSin = sinId.reduce((s, x) => s + x.sessions, 0);
  return `<div class="ad-h"><h3>Cada anuncio de la tienda</h3><small class="muted">Toca uno para verlo completo en Anuncios</small></div>
    ${filas.length ? `<div class="ad-tabla" role="table" aria-label="Anuncios de la tienda">${head}${cuerpo}</div>` : `<div class="ld-empty"><b>Sin anuncios de la tienda en este periodo.</b><span>${(TW._camps || []).length ? "Prueba otro periodo." : "Elige qué campañas llevan a la tienda en «cambiar», arriba."}</span></div>`}
    ${nSin || pedSinId.length ? `<p class="muted ad-nota">Además: ${adNum(nSin)} visita${nSin === 1 ? "" : "s"} y ${adNum(pedSinId.length)} compra${pedSinId.length === 1 ? "" : "s"} de anuncios sin el id del anuncio en la URL.</p>` : ""}
    <p class="muted ad-nota">Entraron, carrito y compras = Shopify. Compras (Meta) = lo que cuenta el píxel, con la atribución de Meta.</p>`;
}

/* Lo que más se vende, con su stock y cuánto salió por los anuncios. */
function twProductosHTML(r){
  const por = new Map();
  for(const o of r.ped) for(const l of (o.lines || [])){
    const k = l.p || l.t, x = por.get(k) || { p: l.p, t: l.t, q: 0, a: 0, qMeta: 0 };
    x.q += Number(l.q || 0); x.a += Number(l.a || 0); if(o._canal === "meta") x.qMeta += Number(l.q || 0);
    por.set(k, x);
  }
  const vendidos = [...por.values()].sort((a, b) => b.a - a.a).slice(0, 8);
  const prod = id => TW.products.find(x => x.product_id === id);
  const stock = pr => !pr ? `<span class="ad-st ad-off">Inactivo</span>` : !pr.tracks_inventory || pr.inventory == null ? "" : pr.inventory <= 0 ? `<span class="ad-st ad-bad">Agotado</span>` : `<span class="ad-st ${pr.inventory <= 2 ? "ad-rev" : "ad-off"}">${adNum(pr.inventory)} en stock</span>`;
  const img = pr => pr && twUrl(pr.image_url) ? `<img src="${esc(pr.image_url)}" alt="" loading="lazy">` : `<span aria-hidden="true">▣</span>`;
  const agotados = TW.products.filter(x => x.tracks_inventory && x.inventory != null && x.inventory <= 0);
  return `<div class="ad-h"><h3>Productos</h3><small class="muted">${adNum(TW.products.length)} activo${TW.products.length === 1 ? "" : "s"}${agotados.length ? " · " + adNum(agotados.length) + " agotado" + (agotados.length === 1 ? "" : "s") : ""}</small></div>
    ${vendidos.length ? `<span class="ld-lbl">Lo más vendido en el periodo</span><ul class="tw-prods">${vendidos.map(v => { const pr = v.p ? prod(v.p) : null;
      const url = pr && twUrl(pr.url);
      return `<li>${url ? `<a class="tw-prod" href="${esc(url)}" target="_blank" rel="noopener">` : `<div class="tw-prod">`}
        <span class="tw-prod-i">${img(pr)}</span><span class="tw-prod-t"><b>${esc(v.t)}</b><small>${adNum(v.q)} vendido${v.q === 1 ? "" : "s"}${v.qMeta ? " · " + adNum(v.qMeta) + " por anuncios" : ""}</small></span>
        <span class="tw-prod-v"><b>${twMoney(v.a)}</b>${stock(pr)}</span>${url ? "</a>" : "</div>"}</li>`; }).join("")}</ul>`
      : `<p class="muted" style="font-size:13px;margin:0 0 10px">Sin ventas en este periodo.</p>`}
    ${agotados.length ? `<span class="ld-lbl" style="margin-top:14px">Agotados (siguen activos)</span><div class="tw-agot">${agotados.slice(0, 12).map(x => `<a href="${esc(twAdminUrl("/products/" + x.product_id))}" target="_blank" rel="noopener" class="tw-chip">${esc(x.title)} ↗</a>`).join("")}</div>` : ""}`;
}

/* Un pedido: quién, qué, cuánto y el camino que hizo hasta comprar. */
function twPedidoHTML(o){
  if(!o) return "";
  twInfoPedido(o);
  const pago = TW_PAGO[o.financial_status], env = TW_ENVIO[o.fulfillment_status];
  const kv = (k, v) => v ? `<div class="ld-kv"><span>${esc(k)}</span><b>${v}</b></div>` : "";
  const canal = (TW_CANALES.find(c => c[0] === o._canal) || [, ""])[1];
  const ad = o._ad && o._ad.ad ? adObj(o._ad.ad) : null, camp = o._ad && o._ad.camp ? adObj(o._ad.camp) : null;
  const visita = (titulo, v) => { if(!v) return ""; const u = v.utm || {};
    return `<div class="tw-paso"><b>${esc(titulo)}</b><small>${esc(twHora(v.at))} · ${esc(v.source || "directo")}${twHost(v.referrer) ? " · desde " + esc(twHost(v.referrer)) : ""}</small>
      ${v.landing ? `<small>Entró a ${esc(String(v.landing).replace(/^https?:\/\/[^/]+/, "").split("?")[0] || "/")}</small>` : ""}
      ${u.source || u.campaign ? `<small class="tw-utm">${esc(["source", "medium", "campaign", "content", "term"].filter(k => u[k]).map(k => k + "=" + u[k]).join(" · "))}</small>` : ""}</div>`; };
  return `<div class="ld-scrim" data-twback></div>
  <aside class="ld-drawer ad-drawer tw-drawer" tabindex="-1" role="dialog" aria-modal="true" aria-label="Pedido ${esc(o.name || "")}">
    <header class="ld-dh">
      <div class="ld-dh-t"><small>Pedido ${esc(o.name || "")}</small><h3>${esc(o.customer_name || "Cliente sin nombre")}</h3>
        <small>${pago ? `<span class="ad-st ${pago[1]}">${esc(pago[0])}</span> ` : ""}${env ? `<span class="ad-st ${env[1]}">${esc(env[0])}</span> ` : ""}${esc(twHora(o.created_at))}</small></div>
      <button class="ld-x" data-twback aria-label="Cerrar">✕</button>
    </header>
    <div class="ld-quick"><a class="btn ghost sm" href="${esc(twAdminUrl("/orders/" + o.order_id))}" target="_blank" rel="noopener">Abrir en Shopify ↗</a>
      ${ad ? `<button class="btn ghost sm" data-twad="${esc(ad.object_id)}">Ver el anuncio</button>` : ""}</div>
    <div class="ld-dsec"><div class="ad-kpis ad-kpis-s">
      <div class="ad-kpi"><span>Total</span><b>${twMoney(o.total)}</b></div>
      <div class="ad-kpi"><span>Productos</span><b>${adNum(o.items)}</b></div>
      <div class="ad-kpi"><span>Envío</span><b>${twMoney(o.shipping)}</b></div>
      ${o.discounts ? `<div class="ad-kpi"><span>Descuentos</span><b>${twMoney(o.discounts)}</b></div>` : ""}
      ${o.refunded ? `<div class="ad-kpi"><span>Reembolsado</span><b>${twMoney(o.refunded)}</b></div>` : ""}
    </div></div>
    <div class="ld-dsec"><span class="ld-lbl">Qué compró</span>
      <ul class="tw-lineas">${(o.lines || []).map(l => `<li><span>${l.q > 1 ? adNum(l.q) + "× " : ""}${esc(l.t)}${l.v ? `<small>${esc(l.v)}</small>` : ""}</span><b>${twMoney(l.a)}</b></li>`).join("")}</ul></div>
    <div class="ld-dsec"><span class="ld-lbl">Cómo llegó</span>
      ${kv("Canal", esc(canal))}
      ${kv("Anuncio", ad ? esc(ad.name || "") : camp ? "Campaña " + esc(camp.name || "") : "")}
      ${kv("Cliente", twNuevo(o) ? "Primera compra" : (o.customer_order_index || o.customer_orders) > 1 ? adNum(o.customer_order_index || o.customer_orders) + "ª compra" : "")}
      ${kv("Tardó", o.days_to_conversion != null ? (o.days_to_conversion ? o.days_to_conversion + " día" + (o.days_to_conversion === 1 ? "" : "s") + " desde su primera visita" : "Compró el mismo día de su primera visita") : "")}
      ${kv("Visitas", o.moments ? adNum(o.moments) + " momento" + (o.moments === 1 ? "" : "s") + " registrados por Shopify" : "")}
      ${kv("Desde", esc([o.city, o.region, o.country].filter(Boolean).join(", ")))}
      <div class="tw-camino">${visita("Primera visita", o.first_visit)}${o.last_visit && (!o.first_visit || o.last_visit.at !== o.first_visit.at) ? visita("Última visita antes de comprar", o.last_visit) : ""}</div>
      ${o.journey_ready === false ? `<p class="muted ad-nota">Shopify todavía está armando el recorrido de este pedido.</p>` : ""}
    </div>
  </aside>`;
}

/* ---------- conexión y ajustes ---------- */
function twConectarHTML(primera){
  const inner = `<div class="ld-panel">
      <h3>${primera ? "Conecta tu tienda de Shopify" : "Conexión con Shopify"}</h3>
      ${primera ? `<p class="muted" style="margin-top:0;font-size:13.5px">Verás tu tienda en vivo —visitas, carritos, pedidos por preparar y stock— y, cruzado con tus anuncios de Meta, quién entró desde cada anuncio, quién compró y cuánto volvió por cada peso invertido. Se actualiza sola cada hora y al abrir esta pestaña.</p>` : ""}
      <ol class="lead-pasos">
        <li>Entra a <b>dev.shopify.com</b> con la cuenta dueña de la tienda → <b>Apps</b> → <b>Crear app</b> (llámala «ANIMA»).</li>
        <li>En la versión de la app marca los permisos <code>read_orders</code>, <code>read_products</code>, <code>read_customers</code> y <code>read_reports</code> (opcional <code>read_all_orders</code> para más de 60 días). En <b>Acceso a datos protegidos de clientes</b> activa nombre y dirección. Publica la versión.</li>
        <li><b>Instala</b> la app en tu tienda y copia el <b>Client ID</b> y el <b>Client secret</b> desde <b>App settings</b>.</li>
      </ol>
      <label class="lead-f">Tienda<input id="twShop" autocomplete="off" spellcheck="false" placeholder="mitienda.myshopify.com o admin.shopify.com/store/…" value="${esc((TW.con && TW.con.shop_domain) || "")}"></label>
      <div class="lead-f2">
        <label class="lead-f">Client ID<input id="twId" autocomplete="off" spellcheck="false"></label>
        <label class="lead-f">Client secret<input id="twSecret" type="password" autocomplete="off"></label>
      </div>
      <details class="tw-alt"><summary>¿Tienes una app antigua creada en el admin (token shpat_…)?</summary>
        <label class="lead-f" style="margin-top:8px">Token de acceso de la API Admin<input id="twTok" type="password" autocomplete="off" placeholder="shpat_…"></label></details>
      <p class="muted" style="font-size:12px;margin:6px 0 12px">Las credenciales viajan una vez a tu servidor de ANIMA y quedan cifradas ahí. No se guardan en este dispositivo.</p>
      <button class="btn sm" data-twdoconnect ${TW.busy ? "disabled" : ""}>${TW.busy === "connect" ? "Conectando…" : (TW.con ? "Reconectar" : "Conectar")}</button>
      ${!primera ? `<button class="btn ghost sm pd-del" data-twdisconnect>Desconectar</button>` : ""}
    </div>`;
  return primera ? `<div class="card s12 ad-card">${inner}</div>` : inner;
}
function twAjustesHTML(){
  const meta = typeof AD !== "undefined" && AD.con;
  const elegidas = Array.isArray(TW.con.meta_campaign_ids) ? new Set(TW.con.meta_campaign_ids) : null;
  const camps = meta ? AD.objs.filter(o => o.level === "campaign").sort((x, y) => (adVigente(y) - adVigente(x)) || String(y.created_time || "").localeCompare(String(x.created_time || ""))) : [];
  const auto = new Set((elegidas ? [] : (TW._camps || [])).map(c => c.object_id));
  const sc = String(TW.con.scopes || "").split(",").filter(Boolean);
  const faltan = sc.length ? ["read_orders", "read_products", "read_customers", "read_reports"].filter(x => !sc.includes(x) && !sc.includes(x.replace(/^read_/, "write_"))) : [];
  return `<div class="tw-ajustes">
    <div class="ld-panel" id="twCamps"><h3>Campañas de Meta que llevan a la tienda</h3>
      ${meta ? `<p class="muted" style="margin-top:0;font-size:12.5px">Su inversión es la que se compara con las ventas. ${elegidas ? "Elegidas a mano." : "Ahora se detectan solas: las de Ventas o Tráfico y las que aparecen en los UTM de la tienda."}</p>
        <div class="tw-camps">${camps.slice(0, 40).map(c => `<label class="ad-check"><input type="checkbox" data-twcamp="${esc(c.object_id)}" ${(elegidas ? elegidas.has(c.object_id) : auto.has(c.object_id)) ? "checked" : ""}> ${esc(c.name || c.object_id)} <small class="muted">${esc(AD_OBJETIVO[c.objective] || "")} · ${esc(AD_VIDA[adVida(c)][0].toLowerCase())}</small></label>`).join("")}</div>
        <div style="margin-top:10px"><button class="btn sm" data-twguardarcamps ${TW.busy ? "disabled" : ""}>Guardar selección</button>${elegidas ? ` <button class="btn ghost sm" data-twautocamps>Volver a detectarlas solas</button>` : ""}</div>`
        : `<p class="muted" style="margin:0;font-size:13px">Primero conecta tu cuenta publicitaria en <b>Taller → Anuncios</b>.</p>`}
    </div>
    <div class="ld-panel"><h3>Parámetros de URL del anuncio</h3>
      <p class="muted" style="margin-top:0;font-size:12.5px">Pégalos en cada anuncio que lleve a la tienda (Administrador de anuncios → anuncio → <b>Seguimiento</b> → <b>Parámetros de URL</b>). Así Shopify sabe qué anuncio trajo cada visita y cada venta, aunque Instagram abra la tienda sin decir de dónde viene.</p>
      <div class="tw-utmbox"><code>${esc(TW_UTM)}</code><button class="btn ghost sm" data-twcopiar>Copiar</button></div>
    </div>
    ${faltan.length ? `<div class="ld-panel"><h3>Permisos que faltan</h3><p style="margin:0;font-size:13px">La app de Shopify no tiene ${faltan.map(x => `<code>${esc(x)}</code>`).join(", ")}. Agrégalos en la versión de la app, publícala, apruébala en la tienda y toca «Actualizar».</p></div>` : ""}
    ${twConectarHTML(false)}
    <div><button class="btn ghost sm" data-twcancel>Cerrar ajustes</button></div>
  </div>`;
}
async function twConectar(){
  const v = id => ((document.getElementById(id) || {}).value || "").trim();
  const body = { shop: v("twShop"), client_id: v("twId") || undefined, client_secret: v("twSecret") || undefined, token: v("twTok") || undefined };
  if(!body.shop){ toast("Escribe el dominio de la tienda."); return; }
  if(!body.token && !(body.client_id && body.client_secret)){ toast("Pega el Client ID y el Client secret de la app."); return; }
  TW.busy = "connect"; renderView();
  try{
    const r = await twFn({ action: "connect", ...body });
    if(r.ok){ TW.connectOpen = false; toast("✓ Conectada: " + r.tienda.name + (r.sync ? " · " + r.sync.msg : "")); }
    else toast(r.msg || "No se pudo conectar.");
  }catch(e){ toast("Shopify: " + (e.message || e)); }
  TW.busy = ""; TW.con = undefined; TW.autoSync = true; TW.visitas = {}; await twCargar();
}
async function twGuardarCampanas(ids){
  TW.busy = "camps"; renderView();
  try{
    await twFn({ action: "ajustes", meta_campaign_ids: ids });
    TW.con.meta_campaign_ids = ids; TW.actsKey = ""; TW.campana = "";
    toast(ids ? "✓ " + ids.length + " campaña" + (ids.length === 1 ? "" : "s") + " de la tienda" : "✓ Las campañas se detectan solas");
  }catch(e){ toast("No se pudo guardar: " + e.message); }
  TW.busy = ""; renderView();
}

/* ---------- eventos ---------- */
function twAbrirAnuncio(id){
  TW.open = null;
  go("anuncios");
  if(typeof adAbrir === "function") adAbrir(id);
}
function twIrA(destino){
  if(destino === "ajustes" || destino === "campanas"){
    TW.connectOpen = true; renderView();
    requestAnimationFrame(() => { const el = document.getElementById(destino === "campanas" ? "twCamps" : "twShop"); if(el) el.scrollIntoView({ behavior: "smooth", block: "center" }); });
    return;
  }
  /* «Por preparar» / «Por cobrar»: el pedido que lleva más tiempo esperando. */
  const ped = TW.orders.filter(o => !o.cancelled_at && (destino === "cobrar" ? TW_POR_COBRAR.includes(o.financial_status)
    : o.financial_status === "PAID" && TW_POR_PREPARAR.includes(o.fulfillment_status)));
  const viejo = ped.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
  if(viejo) twAbrirPedido(viejo.order_id);
}
function twAbrirPedido(id){
  TW.open = id; renderView();
  requestAnimationFrame(() => { const d = document.querySelector(".tw-drawer"); if(d) d.focus(); });
}

document.addEventListener("click", e => {
  if(state.view !== "tienda") return;
  const t = e.target;
  if(t.closest("[data-twsync]")){
    TW.busy = "sync"; renderView();
    twFn({ action: "sync" }).then(r => toast(r.ok ? "✓ " + r.msg : "Shopify: " + r.msg)).catch(err => toast("No se pudo actualizar: " + err.message))
      .finally(() => { TW.busy = ""; TW.visitas = {}; twCargar(); });
    return;
  }
  if(t.closest("[data-twconnect]")){ TW.connectOpen = !TW.connectOpen; renderView(); return; }
  if(t.closest("[data-twcancel]")){ TW.connectOpen = false; renderView(); return; }
  if(t.closest("[data-twdoconnect]")){ twConectar(); return; }
  if(t.closest("[data-twdisconnect]")){
    if(!confirm("¿Desconectar la tienda? Se borran de ANIMA los pedidos, visitas y productos guardados (en Shopify no se toca nada).")) return;
    twFn({ action: "disconnect" }).then(() => { toast("Tienda desconectada."); Object.assign(TW, { connectOpen: false, con: undefined, orders: [], sessions: [], products: [], visitas: {} }); renderView(); })
      .catch(err => toast("No se pudo desconectar: " + err.message));
    return;
  }
  if(t.closest("[data-twcamps]")){ twIrA("campanas"); return; }
  if(t.closest("[data-twguardarcamps]")){
    const ids = [...document.querySelectorAll("[data-twcamp]")].filter(x => x.checked).map(x => x.dataset.twcamp);
    twGuardarCampanas(ids); return;
  }
  if(t.closest("[data-twautocamps]")){ twGuardarCampanas(null); return; }
  if(t.closest("[data-twcopiar]")){
    const ok = () => toast("✓ Parámetros copiados. Pégalos en el anuncio, en «Parámetros de URL».");
    try{ navigator.clipboard.writeText(TW_UTM).then(ok, () => prompt("Copia los parámetros:", TW_UTM)); }catch(err){ prompt("Copia los parámetros:", TW_UTM); }
    return;
  }
  if(t.closest("[data-twfx]")){
    const v = prompt("¿Cuántos " + twCur() + " vale 1 " + adCur() + "?", String(twFx()));
    const n = Number(String(v || "").replace(/\./g, "").replace(",", "."));
    if(n > 0){ try{ localStorage.setItem(twFxClave(), String(n)); }catch(err){} renderView(); }
    return;
  }
  if(t.closest("[data-twtodos]")){ TW.verTodos = !TW.verTodos; renderView(); return; }
  const so = t.closest("[data-twsolo]"); if(so){ TW.soloMeta = so.dataset.twsolo === "1"; renderView(); return; }
  const pr = t.closest("[data-twpor]"); if(pr){ TW.porVisitas = pr.dataset.twpor; renderView(); return; }
  const g = t.closest("[data-twgo]"); if(g){ go(g.dataset.twgo); return; }
  const ad = t.closest("[data-twad]"); if(ad){ twAbrirAnuncio(ad.dataset.twad); return; }
  if(t.closest("[data-twback]")){ TW.open = null; renderView(); return; }
  const pe = t.closest("[data-twpedido]"); if(pe){ twAbrirPedido(pe.dataset.twpedido); return; }
  const ir = t.closest("[data-twir]"); if(ir){ twIrA(ir.dataset.twir); return; }
});
document.addEventListener("change", e => {
  if(state.view !== "tienda") return;
  const el = e.target;
  if(el.matches("[data-twrango]")){ TW.rango = el.value; if(TW.rango === "rango" && !TW.desde){ const p = adPeriodo(TW); TW.desde = p.desde; TW.hasta = p.hasta; } renderView(); return; }
  if(el.matches("[data-twfecha]")){ TW[el.dataset.twfecha] = el.value; renderView(); return; }
  if(el.matches("[data-twcampana]")){ TW.campana = el.value; renderView(); return; }
});
document.addEventListener("keydown", e => {
  if(state.view !== "tienda") return;
  if(e.key === "Escape" && TW.open){ TW.open = null; renderView(); return; }
  if(e.key !== "Enter" || !e.target.matches || e.target.tagName === "BUTTON") return;
  if(e.target.matches("[data-twad]")) twAbrirAnuncio(e.target.dataset.twad);
  else if(e.target.matches("[data-twir]")) twIrA(e.target.dataset.twir);
  else if(e.target.matches("[data-twpedido]")) twAbrirPedido(e.target.dataset.twpedido);
});
