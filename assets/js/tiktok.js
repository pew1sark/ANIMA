/* ===========================================================
   ANIMA STUDIO — TikTok (Taller)
   -----------------------------------------------------------
   Los anuncios de TikTok de punta a punta: lo que se invierte, cuánto
   ven el video, lo que la gente comenta (y se responde desde aquí) y
   los formularios que llegan al Centro de clientes, hasta el trabajo
   ganado.

   DE DÓNDE SALE CADA NÚMERO
   - TikTok (tablas tiktok_*, migración 0148): la Edge Function
     `tiktok-ads` sincroniza cada hora campañas, grupos, anuncios,
     métricas por anuncio y día, comentarios y formularios. Al abrir
     la pestaña se pide una actualización si la última tiene más de
     15 minutos.
   - Alcance y frecuencia del periodo se piden en vivo (no se suman
     día a día), como en Anuncios.
   - Formularios en ANIMA = client_leads con source 'tiktok'. Cotizadas,
     ganadas y valor ganado salen de ahí, igual que en Anuncios.

   Vive en `TT`, en memoria, como `AD` y `TW`.
   Se carga DESPUÉS de anuncios.js (usa sus ad*) y ANTES de avisos.js
   (lee la vuelta del ingreso con TikTok antes de que se limpie la URL).
   =========================================================== */

const TT = { con: undefined, objs: [], daily: [], comments: [], loading: false, busy: "", almaId: null, error: "",
             rango: "7", desde: "", hasta: "", campana: "", nivel: "campaign", orden: "spend", dir: -1, vista: "marcha",
             reach: {}, open: null, connectOpen: false, pick: null, autoSync: false, app: undefined,
             bandeja: "pendientes", responder: null, enviando: "" };

const TT_NIVELES = [["campaign", "Campañas"], ["adgroup", "Grupos"], ["ad", "Anuncios"]];
const TT_OBJETIVO = { LEAD_GENERATION: "Clientes potenciales", TRAFFIC: "Tráfico", REACH: "Alcance", VIDEO_VIEWS: "Reproducciones",
  ENGAGEMENT: "Interacción", COMMUNITY_INTERACTION: "Comunidad", WEB_CONVERSIONS: "Conversiones web", CONVERSIONS: "Conversiones",
  APP_PROMOTION: "Apps", PRODUCT_SALES: "Ventas de productos", RF_REACH: "Alcance y frecuencia" };
/* Se guarda en la URL de vuelta: así el aviso de STUDIO (avisos.js) abre esta pestaña. */
const TT_VUELTA = "ir=tiktok";

/* La vuelta del ingreso con TikTok trae ?auth_code=…&state=…: se guarda antes de
   que avisos.js limpie la URL, y se canjea cuando la pestaña tenga sesión. */
(function ttLeerVuelta(){
  try{
    const q = new URLSearchParams(location.search);
    const code = q.get("auth_code") || q.get("code"), st = q.get("state");
    if(code && st && q.get("ir") === "tiktok") sessionStorage.setItem("anima_tt_auth", JSON.stringify({ code, st }));
  }catch(e){}
})();

/* ---------- formato ---------- */
function ttCur(){ return (TT.con && TT.con.currency) || "USD"; }
const ttMoney = (n, dec) => adMoney(n, dec, ttCur());
/* Cuánto vale 1 unidad de la moneda de TikTok en la moneda de ANIMA (el mismo ajuste que Anuncios). */
function ttFx(){
  const c = ttCur(), base = typeof ANIMA_CUR !== "undefined" ? ANIMA_CUR : "CLP";
  if(c === base) return 1;
  try{ const v = Number(localStorage.getItem("anima_ads_fx_" + c)); if(v > 0) return v; }catch(e){}
  return c === "USD" ? 950 : 1;
}
function ttObj(id){ return TT.objs.find(o => o.object_id === id); }

/* ¿Funciona de verdad? TikTok lo dice en secondary_status: se traduce a la misma
   «vida» que Anuncios para que los dos paneles se lean igual. */
const TT_VIDA = {
  marcha: ["En marcha", "ad-on"], programado: ["Programado", "ad-rev"], revision: ["En revisión", "ad-rev"],
  presupuesto: ["Sin presupuesto", "ad-rev"], problema: ["Con problemas", "ad-bad"], rechazado: ["Rechazado", "ad-bad"],
  terminado: ["Terminado", "ad-off"], pausado: ["Pausado", "ad-off"], eliminado: ["Eliminado", "ad-off"]
};
const TT_VIGENTES = ["marcha", "programado", "revision", "presupuesto", "problema", "rechazado"];
function ttVida(o){
  const s = String(o.secondary_status || "").toUpperCase();
  if(/DELETE/.test(s)) return "eliminado";
  if(/AUDIT_DENY|NOT_APPROVE|REJECT/.test(s)) return "rechazado";
  if(/BALANCE|ADVERTISER|ACCOUNT|FROZEN|SHUTDOWN|PUNISH/.test(s)) return "problema";
  if(/BUDGET_EXCEED|CAMPAIGN_EXCEED|ADGROUP_EXCEED/.test(s)) return "presupuesto";
  if(/AUDIT|REVIEW/.test(s)) return "revision";
  if(/NOT_START|NO_SCHEDULE/.test(s)) return "programado";
  if(/TIME_DONE|_DONE$|FINISH|END/.test(s)) return "terminado";
  if(/DISABLE|PAUSE/.test(s)) return "pausado";
  if(/DELIVERY_OK|ENABLE|ACTIVE/.test(s)) return "marcha";
  return o.operation_status === "ENABLE" ? "marcha" : "pausado";
}
const ttVigente = o => TT_VIGENTES.includes(ttVida(o));

/* ---------- datos ---------- */
async function ttCargar(force){
  const a = me();
  if(TT.loading) return;
  if(!Cloud.enabled || !Cloud.client || !a || !a.live || !a.almaId){ TT.con = null; return; }
  TT.loading = true;
  try{
    const c = await Cloud.client.from("tiktok_ads_connections").select("*").eq("alma_id", a.almaId).maybeSingle();
    if(c.error) throw c.error;
    TT.con = c.data || null; TT.almaId = a.almaId;
    if(TT.con){
      const [o, d, m] = await Promise.all([
        adTodo(q => q.from("tiktok_ads_objects").select("*").eq("alma_id", a.almaId)),
        adTodo(q => q.from("tiktok_ads_daily").select("ad_id,day,campaign_id,adgroup_id,spend,impressions,reach,clicks,conversions,results,landing_views,video_plays,video_2s,video_6s,video_p25,video_p50,video_p75,video_p100,likes,comments,shares,follows,profile_visits")
          .eq("alma_id", a.almaId).gte("day", adDia(-400)).order("day")),
        adTodo(q => q.from("tiktok_ad_comments").select("comment_id,ad_id,adgroup_id,campaign_id,parent_id,kind,user_name,text,likes,replies,hidden,pinned,mine,commented_at,answered_at,done_at")
          .eq("alma_id", a.almaId).gte("commented_at", adDia(-120)).order("commented_at", { ascending: false }))
      ]);
      TT.objs = o; TT.daily = d; TT.comments = m; TT.error = "";
      if(force) TT.reach = {};
    }
  }catch(e){ console.error("ANIMA · tiktok", e); TT.con = TT.con === undefined ? null : TT.con; TT.error = e.message || String(e); }
  TT.loading = false;
  if(typeof CC !== "undefined" && CC.leads === undefined && typeof loadLeads === "function") loadLeads();
  ttRefresh();
  ttPedirAlcance();
  ttAutoSync();
}
/* «Estado real»: si lo guardado tiene más de 15 minutos, se le pregunta a TikTok al abrir. */
function ttAutoSync(){
  const c = TT.con;
  if(!c || TT.autoSync || TT.busy) return;
  TT.autoSync = true;
  if(c.last_sync_at && Date.now() - new Date(c.last_sync_at).getTime() < 15 * 60000) return;
  TT.busy = "auto"; ttRefresh();
  ttFn({ action: "sync" }).catch(() => {}).finally(() => { TT.busy = ""; ttCargar(true); });
}
function ttRefresh(){
  if(state.view !== "tiktok") return;
  const f = document.activeElement;
  if(f && f.closest && f.closest("#view") && /^(INPUT|TEXTAREA)$/.test(f.tagName)) return;
  const d = document.querySelector(".tt-drawer"), y = d ? d.scrollTop : 0;
  renderView();
  const d2 = document.querySelector(".tt-drawer"); if(d2 && y) d2.scrollTop = y;
}
async function ttFn(body){
  const s = await Cloud.session();
  if(!s) throw new Error("Tu sesión expiró. Vuelve a entrar.");
  const r = await fetch(SB_URL + "/functions/v1/tiktok-ads", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + s.access_token, "apikey": SB_KEY },
    body: JSON.stringify({ ...body, alma_id: me().almaId })
  });
  const j = await r.json().catch(() => ({}));
  if(!r.ok && !j.elegir) throw new Error(j.msg || ("Error " + r.status));
  return j;
}

/* Alcance real del periodo (cuenta, nivel de la tabla y anuncios), una vez por combinación. */
function ttPedirAlcance(levels){
  if(!TT.con) return;
  const p = adPeriodo(TT);
  for(const level of levels || [...new Set(["account", TT.nivel, "ad"])]){
    const k = p.desde + "|" + p.hasta + "|" + level;
    if(TT.reach[k]) continue;
    TT.reach[k] = { cargando: true };
    ttFn({ action: "alcance", since: p.desde, until: p.hasta, level })
      .then(r => { TT.reach[k] = r.ok ? Object.fromEntries((r.filas || []).map(x => [x.id, x])) : { error: r.msg }; ttRefresh(); })
      .catch(e => { TT.reach[k] = { error: e.message }; });
  }
}
function ttAlcanceDe(level, id){
  const p = adPeriodo(TT), m = TT.reach[p.desde + "|" + p.hasta + "|" + level];
  if(!m || m.cargando || m.error) return null;
  return m[id] || { reach: 0, frequency: 0 };
}

/* ---------- métricas ---------- */
function ttSuma(filas){
  const t = { spend: 0, impressions: 0, clicks: 0, conversions: 0, results: 0, landing_views: 0, video_plays: 0, video_2s: 0, video_6s: 0,
              video_p25: 0, video_p50: 0, video_p75: 0, video_p100: 0, likes: 0, comments: 0, shares: 0, follows: 0, profile_visits: 0, reachDia: 0 };
  for(const r of filas){
    for(const k in t) if(k !== "reachDia") t[k] += Number(r[k] || 0);
    t.reachDia = Math.max(t.reachDia, Number(r.reach || 0));
  }
  t.ctr = t.impressions ? t.clicks / t.impressions : NaN;
  t.cpc = t.clicks ? t.spend / t.clicks : NaN;
  t.cpm = t.impressions ? t.spend / t.impressions * 1000 : NaN;
  t.cpr = t.results ? t.spend / t.results : NaN;
  t.hook = t.video_plays && t.video_2s ? t.video_2s / t.video_plays : NaN;     // cuántos pasan de 2 s
  t.hold = t.video_plays && t.video_p100 ? t.video_p100 / t.video_plays : NaN; // cuántos lo ven entero
  t.er = t.impressions ? (t.likes + t.comments + t.shares) / t.impressions : NaN;
  return t;
}
/* Filas del periodo, opcionalmente de una campaña, grupo o anuncio. */
function ttFilas(desde, hasta, id){
  const o = id ? ttObj(id) : null;
  return TT.daily.filter(r => r.day >= desde && r.day <= hasta
    && (!TT.campana || r.campaign_id === TT.campana)
    && (!o || (o.level === "ad" ? r.ad_id === id : o.level === "adgroup" ? r.adgroup_id === id : r.campaign_id === id)));
}
/* Los formularios de TikTok en el Centro de clientes, y lo que pasó con ellos. */
function ttAnima(desde, hasta, id){
  const o = id ? ttObj(id) : null;
  const adsDe = new Set(TT.objs.filter(x => x.level === "ad" && (!o || (o.level === "ad" ? x.object_id === id : o.level === "adgroup" ? x.adgroup_id === id : x.campaign_id === id))
    && (!TT.campana || x.campaign_id === TT.campana)).map(x => x.object_id));
  const filtra = !!(o || TT.campana);
  const L = (typeof leadsList === "function" ? leadsList() : []).filter(l => {
    if(l.source !== "tiktok") return false;
    const d = adYmd(new Date(l.lead_created_at));
    if(d < desde || d > hasta) return false;
    return !filtra || (l.ad_id && adsDe.has(String(l.ad_id)));
  });
  const etapa = l => (LEAD_ESTADOS[l.status] || { i: 0 }).i;
  const proyectos = me().projects || [];
  const valor = l => { const p = l.project_id && proyectos.find(x => x._id === l.project_id); return p ? Number(p.budget || 0) : 0; };
  const cot = L.filter(l => l.status !== "descartado" && etapa(l) >= LEAD_ESTADOS.cotizado.i);
  const won = L.filter(l => l.status === "ganado");
  return { lista: L, solicitudes: L.length,
    contactadas: L.filter(l => l.status !== "descartado" && etapa(l) >= LEAD_ESTADOS.contactado.i).length,
    cotizadas: cot.length, ganadas: won.length,
    valorCotizado: cot.reduce((s, l) => s + valor(l), 0), valorGanado: won.reduce((s, l) => s + valor(l), 0) };
}

/* ---------- comentarios ---------- */
/* Un comentario espera respuesta si es de otra persona, no está oculto y nadie lo atendió. */
function ttRespondido(c){ return !!c.answered_at || TT.comments.some(x => x.mine && x.parent_id === c.comment_id); }
function ttPendiente(c){ return !c.mine && c.kind !== "REPLY" && !c.hidden && !c.done_at && !ttRespondido(c); }
function ttComentarios(){
  const L = TT.comments.filter(c => !c.mine && (!TT.campana || c.campaign_id === TT.campana || (c.ad_id && (ttObj(c.ad_id) || {}).campaign_id === TT.campana)));
  return {
    pendientes: L.filter(ttPendiente),
    todos: L.filter(c => !c.hidden),
    ocultos: L.filter(c => c.hidden)
  };
}

/* Salud: lo que conviene mirar hoy. Siempre ícono + texto. */
function ttAlertas(p){
  const cuenta = ttSuma(ttFilas(p.desde, p.hasta));
  const out = [];
  for(const o of TT.objs.filter(x => x.level === "ad" && (!TT.campana || x.campaign_id === TT.campana))){
    const vida = ttVida(o), nombre = o.name || "Anuncio";
    if(vida === "rechazado"){ out.push({ nivel: "critico", id: o.object_id, t: nombre + ": rechazado en la revisión", d: "No se está mostrando. Revisa el motivo en TikTok Ads Manager y corrige el video o el texto." }); continue; }
    if(vida === "problema"){ out.push({ nivel: "critico", id: o.object_id, t: nombre + ": la cuenta no está entregando", d: "Puede faltar saldo o haber una revisión de la cuenta. Míralo en TikTok Ads Manager." }); continue; }
    if(vida !== "marcha" && vida !== "presupuesto") continue;
    const t = ttSuma(ttFilas(p.desde, p.hasta, o.object_id));
    if(vida === "presupuesto") out.push({ nivel: "alto", id: o.object_id, t: nombre + ": se le acabó el presupuesto", d: "Dejó de mostrarse hasta que se renueve el presupuesto del grupo o la campaña." });
    if(!t.spend) continue;
    if(t.impressions >= 1000 && t.ctr < 0.004) out.push({ nivel: "medio", id: o.object_id, t: nombre + ": pocos clics (CTR " + adPct(t.ctr, 2) + ")", d: "En TikTok lo normal es sobre 0,8 %. Prueba otro gancho en los primeros segundos o un llamado más claro." });
    if(isFinite(t.hook) && t.video_plays >= 500 && t.hook < 0.25) out.push({ nivel: "bajo", id: o.object_id, t: nombre + ": el video no engancha (" + adPct(t.hook, 0) + " pasa de 2 s)", d: "Los primeros segundos no detienen el scroll. Abre con el resultado terminado o un antes/después." });
    if(isFinite(cuenta.cpr) && t.results && t.cpr > cuenta.cpr * 1.5) out.push({ nivel: "medio", id: o.object_id, t: nombre + ": resultados caros (" + ttMoney(t.cpr) + " c/u)", d: "Cuesta " + adDec(t.cpr / cuenta.cpr, 1) + " veces el promedio de la cuenta (" + ttMoney(cuenta.cpr) + ")." });
    if(!t.results && isFinite(cuenta.cpr) && t.spend > cuenta.cpr * 2) out.push({ nivel: "alto", id: o.object_id, t: nombre + ": gasta sin resultados", d: ttMoney(t.spend) + " invertidos sin ningún resultado. Considera pausarlo." });
  }
  const com = ttComentarios().pendientes;
  if(com.length) out.push({ nivel: com.length >= 5 ? "alto" : "medio", t: com.length + " comentario" + (com.length === 1 ? "" : "s") + " sin responder", d: "Responder rápido en el anuncio sube la confianza de quien está mirando. Están aquí abajo, en Mensajes.", ir: "mensajes" });
  const an = ttAnima(p.desde, p.hasta);
  const sinResp = an.lista.filter(l => l.status === "nuevo" || l.status === "revisado");
  if(sinResp.length) out.push({ nivel: "alto", t: sinResp.length + " formulario" + (sinResp.length === 1 ? "" : "s") + " de TikTok sin responder", d: "Cada hora sin respuesta baja la probabilidad de cerrar. Contéstalos desde el Centro de clientes.", ir: "centro" });
  if(TT.con && TT.con.comments_ok === false) out.push({ nivel: "bajo", t: "Los comentarios no se pudieron leer", d: TT.con.comments_msg || "Revisa que la app de TikTok tenga el permiso de comentarios." });
  if(TT.con && TT.con.leads_ok === false) out.push({ nivel: "medio", t: "Los formularios no se pudieron traer", d: TT.con.leads_msg || "Revisa que la app de TikTok tenga el permiso de clientes potenciales (Lead Management) y que seas administrador de la cuenta." });
  const orden = { critico: 0, alto: 1, medio: 2, bajo: 3 };
  return out.sort((x, y) => orden[x.nivel] - orden[y.nivel]);
}

/* ---------- vista ---------- */
function vTiktok(a){
  if(!a.live || !Cloud.enabled) return `<div class="grid"><div class="card s12"><p class="muted">La pestaña TikTok necesita tu sesión en la nube de ANIMA.</p></div></div>`;
  if(TT.almaId && TT.almaId !== a.almaId){ Object.assign(TT, { con: undefined, objs: [], daily: [], comments: [], reach: {}, open: null, autoSync: false, app: undefined }); }
  if(ttVueltaPendiente()) return `<div class="grid"><div class="card s12 ld-cargando"><span class="ld-spin"></span>Conectando con TikTok…</div></div>`;
  if(TT.con === undefined){ setTimeout(ttCargar, 0); return `<div class="grid"><div class="card s12 ld-cargando"><span class="ld-spin"></span>Cargando TikTok…</div></div>`; }
  if(!TT.con) return `<div class="grid ad tt">${ttConectarHTML(true)}</div>`;

  const p = adPeriodo(TT);
  const t = ttSuma(ttFilas(p.desde, p.hasta)), t0 = ttSuma(ttFilas(p.prevDesde, p.prevHasta));
  const an = ttAnima(p.desde, p.hasta), an0 = ttAnima(p.prevDesde, p.prevHasta);
  const alc = ttAlcanceDe("account", "account");
  const fx = ttFx();
  const roas = t.spend ? an.valorGanado / (t.spend * fx) : NaN;
  const campanas = TT.objs.filter(o => o.level === "campaign" && ttVida(o) !== "eliminado").sort((x, y) => (ttVigente(y) - ttVigente(x)) || String(x.name).localeCompare(String(y.name), "es"));
  const opt = (v, txt, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(txt)}</option>`;

  const filtros = `<div class="ad-filtros">
      <select class="ld-sel on" data-ttrango aria-label="Periodo">${AD_RANGOS.map(([k, x]) => opt(k, x, TT.rango)).join("")}</select>
      ${TT.rango === "rango" ? `<span class="ld-rango"><input type="date" data-ttfecha="desde" value="${esc(TT.desde || p.desde)}" aria-label="Desde"><span>→</span><input type="date" data-ttfecha="hasta" value="${esc(TT.hasta || p.hasta)}" aria-label="Hasta"></span>` : ""}
      <select class="ld-sel ${TT.campana ? "on" : ""}" data-ttcampana aria-label="Campaña">${opt("", "Todas las campañas", TT.campana)}${campanas.map(c => opt(c.object_id, (c.name || "") + (ttVigente(c) ? "" : " · " + TT_VIDA[ttVida(c)][0].toLowerCase()), TT.campana)).join("")}</select>
      <span class="ad-per muted">${esc(adFechaCorta(p.desde))} – ${esc(adFechaCorta(p.hasta))} · vs. ${esc(adFechaCorta(p.prevDesde))} – ${esc(adFechaCorta(p.prevHasta))}</span>
    </div>`;

  const delta = (x, y, malo) => {
    if(!isFinite(x) || !isFinite(y) || !y) return `<small class="ad-d">—</small>`;
    const v = (x - y) / Math.abs(y); if(Math.abs(v) < 0.005) return `<small class="ad-d">= igual</small>`;
    const bien = malo ? v < 0 : v > 0;
    return `<small class="ad-d ${bien ? "ad-up" : "ad-down"}">${v > 0 ? "▲" : "▼"} ${adPct(Math.abs(v), 0)}</small>`;
  };
  const tile = (k, v, d, ayuda) => `<div class="ad-kpi" ${ayuda ? `title="${esc(ayuda)}"` : ""}><span>${esc(k)}</span><b>${v}</b>${d || ""}</div>`;
  const alcPend = TT.reach[p.desde + "|" + p.hasta + "|account"];
  const kpisTT = `<div class="ad-kpis">
      ${tile("Inversión", ttMoney(t.spend), delta(t.spend, t0.spend), "Lo gastado en TikTok en el periodo")}
      ${tile("Alcance", alc ? adNum(alc.reach) : (t.reachDia ? "≈ " + adNum(t.reachDia) : "—"), alc ? "" : `<small class="ad-d">${alcPend && alcPend.cargando ? "consultando…" : "sin dato"}</small>`, "Personas distintas que lo vieron (TikTok, periodo completo)")}
      ${tile("Impresiones", adNum(t.impressions), delta(t.impressions, t0.impressions))}
      ${tile("Frecuencia", alc && alc.frequency ? adDec(alc.frequency, 2) : "—", "", "Veces promedio que cada persona lo vio")}
      ${tile("Clics", adNum(t.clicks), delta(t.clicks, t0.clicks), "Clics hacia el destino del anuncio")}
      ${tile("CTR", adPct(t.ctr, 2), delta(t.ctr, t0.ctr), "Clics / impresiones")}
      ${tile("CPC", isFinite(t.cpc) ? ttMoney(t.cpc) : "—", delta(t.cpc, t0.cpc, true), "Costo por clic")}
      ${tile("CPM", isFinite(t.cpm) ? ttMoney(t.cpm) : "—", delta(t.cpm, t0.cpm, true), "Costo por mil impresiones")}
    </div>`;
  const kpisVideo = `<div class="ad-kpis">
      ${tile("Reproducciones", adNum(t.video_plays), delta(t.video_plays, t0.video_plays))}
      ${tile("Pasan de 2 s", isFinite(t.hook) ? adPct(t.hook, 0) : "—", `<small class="ad-d">${adNum(t.video_2s)}</small>`, "De cada reproducción, cuántas siguen después de 2 segundos")}
      ${tile("Ven 6 s", adNum(t.video_6s), delta(t.video_6s, t0.video_6s))}
      ${tile("Lo ven entero", isFinite(t.hold) ? adPct(t.hold, 1) : "—", `<small class="ad-d">${adNum(t.video_p100)}</small>`)}
      ${tile("Me gusta", adNum(t.likes), delta(t.likes, t0.likes))}
      ${tile("Comentarios", adNum(t.comments), delta(t.comments, t0.comments))}
      ${tile("Compartidos", adNum(t.shares), delta(t.shares, t0.shares))}
      ${tile("Seguidores nuevos", adNum(t.follows), delta(t.follows, t0.follows))}
    </div>`;
  const kpisNegocio = `<div class="ad-kpis ad-kpis-n">
      ${tile("Resultados (TikTok)", adNum(t.results), delta(t.results, t0.results), "Lo que optimiza cada grupo: formularios, mensajes, visitas…")}
      ${tile("Costo por resultado", isFinite(t.cpr) ? ttMoney(t.cpr) : "—", delta(t.cpr, t0.cpr, true))}
      ${tile("Formularios en ANIMA", adNum(an.solicitudes), delta(an.solicitudes, an0.solicitudes), "Llegaron al Centro de clientes")}
      ${tile("Contactadas", adNum(an.contactadas), an.solicitudes ? `<small class="ad-d">${adPct(an.contactadas / an.solicitudes, 0)} de los formularios</small>` : "")}
      ${tile("Cotizadas", adNum(an.cotizadas), an.cotizadas && t.spend ? `<small class="ad-d">${ttMoney(t.spend / an.cotizadas)} por cotización</small>` : "")}
      ${tile("Ganadas", adNum(an.ganadas), an.ganadas && t.spend ? `<small class="ad-d">${ttMoney(t.spend / an.ganadas)} por cliente</small>` : "")}
      ${tile("Valor ganado", money(an.valorGanado), an.valorCotizado ? `<small class="ad-d">${money(an.valorCotizado)} cotizado</small>` : "")}
      ${tile("Retorno (ROAS)", isFinite(roas) && t.spend ? adDec(roas, 1) + "×" : "—", fx !== 1 ? `<small class="ad-d"><button class="ad-fx" data-ttfx>1 ${esc(ttCur())} = ${esc(adNum(fx))} ${esc(ANIMA_CUR)}</button></small>` : "", "Valor ganado / inversión")}
    </div>`;

  const alertas = ttAlertas(p);
  const ICO = { critico: "⛔", alto: "▲", medio: "●", bajo: "○" };
  const TXT = { critico: "Crítico", alto: "Importante", medio: "Mirar", bajo: "Sugerencia" };
  const salud = `<div class="card s12 ad-card"><div class="ad-h"><h3>Salud de los anuncios</h3><small class="muted">${alertas.length ? alertas.length + " cosa" + (alertas.length === 1 ? "" : "s") + " por mirar" : "Todo en orden en este periodo"}</small></div>
      ${alertas.length ? `<ul class="ad-alertas">${alertas.slice(0, 8).map(x => `<li class="ad-al ad-al-${x.nivel}" ${x.id ? `data-ttopen="${esc(x.id)}"` : x.ir ? `data-ttgo="${esc(x.ir)}"` : ""}>
          <span class="ad-al-i" aria-hidden="true">${ICO[x.nivel]}</span><div><b>${esc(x.t)}</b><small>${esc(x.d)}</small></div><span class="ad-al-t">${TXT[x.nivel]}</span></li>`).join("")}</ul>`
        : `<p class="muted" style="margin:6px 0 0;font-size:13px">Sin rechazos, sin presupuestos agotados y sin anuncios gastando de más.</p>`}</div>`;

  const sinc = TT.busy ? (TT.busy === "auto" ? "Consultando a TikTok…" : "Actualizando…") : "↻ Actualizar";
  return `<div class="grid ad tt">
    <div class="card s12 ad-card">
      <div class="ld-head">
        <div class="ld-title"><h2>TikTok</h2><p>${esc(TT.con.advertiser_name || "Cuenta " + TT.con.advertiser_id)} · ${esc(ttCur())} · ${ttConexionTxt()}</p></div>
        <div class="ld-tools">
          <button class="btn ghost sm" data-ttsync ${TT.busy ? "disabled" : ""}>${sinc}</button>
          <a class="btn ghost sm" href="https://ads.tiktok.com/i18n/dashboard?aadvid=${esc(TT.con.advertiser_id)}" target="_blank" rel="noopener">Ads Manager ↗</a>
          <button class="btn ghost sm" data-ttconnect aria-label="Conexión">⚙</button>
        </div>
      </div>
      ${TT.connectOpen ? ttConectarHTML(false) : ""}
      ${filtros}
      <div class="ad-sec"><span class="ld-lbl">En TikTok</span>${kpisTT}</div>
      <div class="ad-sec"><span class="ld-lbl">Video y comunidad</span>${kpisVideo}</div>
      <div class="ad-sec"><span class="ld-lbl">En tu negocio</span>${kpisNegocio}</div>
    </div>
    <div class="card s12 ad-card"><div class="ad-h"><h3>Día a día</h3><small class="muted">Pasa el dedo o el mouse por una barra para ver el detalle</small></div>
      <div class="ad-charts">${adGrafico(p, "spend", "Inversión por día", v => ttMoney(v), ttFilas(p.desde, p.hasta))}${adGrafico(p, "results", "Resultados por día", v => adNum(v), ttFilas(p.desde, p.hasta))}${adGrafico(p, "video_plays", "Reproducciones por día", v => adNum(v), ttFilas(p.desde, p.hasta))}</div>
    </div>
    <div class="card s12 ad-card"><div class="ad-h"><h3>Del video al trabajo ganado</h3><small class="muted">Cuántos pasan de un paso al siguiente</small></div>${ttEmbudo(t, an)}</div>
    ${salud}
    ${ttMensajesHTML(p)}
    <div class="card s12 ad-card">${ttTablaHTML(p)}</div>
  </div>
  ${TT.open && ttObj(TT.open) ? ttPanelHTML(a, ttObj(TT.open), p) : ""}`;
}

function ttConexionTxt(){
  const c = TT.con; if(!c) return "";
  const mal = c.last_sync_ok === false;
  return `<span class="${mal ? "ad-bad-t" : ""}">${esc(mal ? "Error: " + (c.last_sync_msg || "") : "actualizado " + (c.last_sync_at ? "hace " + timeAgo(c.last_sync_at) : "—"))}</span>`;
}

function ttEmbudo(t, an){
  const pasos = [
    ["Impresiones", t.impressions], ["Ven 6 segundos", t.video_6s], ["Clics", t.clicks], ["Resultados (TikTok)", t.results],
    ["Formularios en ANIMA", an.solicitudes], ["Cotizadas", an.cotizadas], ["Ganadas", an.ganadas]
  ];
  const max = Math.max(pasos[0][1], 1);
  return `<div class="ad-funnel">${pasos.map(([k, v], i) => {
    const prev = i ? pasos[i - 1][1] : 0;
    const conv = i && prev ? adPct(v / prev, v / prev < 0.01 ? 2 : 1) : "";
    const w = v ? Math.max(2, Math.sqrt(v / max) * 100) : 0;   // escala raíz, como en Anuncios
    return `<div class="ad-step"><span class="ad-step-k">${esc(k)}</span><span class="ad-step-bar"><i style="width:${w}%"></i></span><b>${adNum(v)}</b><small>${conv ? conv + " del paso anterior" : ""}</small></div>`;
  }).join("")}</div>`;
}

/* ---------- mensajes: comentarios del anuncio y formularios ---------- */
function ttMensajesHTML(p){
  const g = ttComentarios();
  const lista = g[TT.bandeja] || g.pendientes;
  const tabs = [["pendientes", "Por responder"], ["todos", "Todos"], ["ocultos", "Ocultos"]]
    .map(([k, x]) => `<button class="ld-tab ${TT.bandeja === k ? "on" : ""}" data-ttbandeja="${k}">${x}<span>${g[k].length}</span></button>`).join("");
  const nombreAd = id => { const o = id && ttObj(id); return o ? o.name : ""; };
  const respuestas = id => TT.comments.filter(x => x.mine && x.parent_id === id);
  const item = c => {
    const resp = respuestas(c.comment_id);
    const abierto = TT.responder === c.comment_id;
    return `<li class="tt-com ${ttPendiente(c) ? "tt-pend" : ""}" id="ttc-${esc(c.comment_id)}">
      <div class="tt-com-h"><b>${esc(c.user_name || "Alguien")}</b><small>${esc(c.commented_at ? "hace " + timeAgo(c.commented_at) : "")}${nombreAd(c.ad_id) ? " · " + esc(nombreAd(c.ad_id)) : ""}${c.likes ? " · ♥ " + adNum(c.likes) : ""}${c.hidden ? " · oculto" : ""}</small></div>
      <p>${esc(c.text || "")}</p>
      ${resp.map(r => `<p class="tt-resp"><span>Tu respuesta</span>${esc(r.text || "")}</p>`).join("")}
      ${abierto ? `<div class="tt-resp-f"><textarea id="ttRespTxt" rows="2" maxlength="150" placeholder="Escribe tu respuesta (hasta 150 caracteres)…" aria-label="Respuesta"></textarea>
          <div><button class="btn sm" data-ttenviar="${esc(c.comment_id)}" ${TT.enviando ? "disabled" : ""}>${TT.enviando === c.comment_id ? "Enviando…" : "Responder en TikTok"}</button><button class="btn ghost sm" data-ttresp="">Cancelar</button></div></div>`
        : `<div class="tt-com-a">
          ${!c.hidden ? `<button class="btn ghost sm" data-ttresp="${esc(c.comment_id)}">Responder</button>` : ""}
          <button class="btn ghost sm" data-ttocultar="${esc(c.comment_id)}" data-v="${c.hidden ? "0" : "1"}">${c.hidden ? "Volver a mostrar" : "Ocultar"}</button>
          ${ttPendiente(c) ? `<button class="btn ghost sm" data-ttlisto="${esc(c.comment_id)}">Listo, no requiere respuesta</button>` : c.done_at ? `<button class="btn ghost sm" data-ttlisto="${esc(c.comment_id)}" data-v="0">Volver a pendientes</button>` : ""}
        </div>`}
    </li>`;
  };
  const an = ttAnima(p.desde, p.hasta);
  const leads = (typeof leadsList === "function" ? leadsList() : []).filter(l => l.source === "tiktok").slice(0, 6);
  const estadoCom = TT.con.comments_ok === false ? `<p class="muted tt-aviso">⚠ ${esc(TT.con.comments_msg || "No se pudieron leer los comentarios.")}</p>` : "";
  const estadoLeads = TT.con.leads_ok === false ? `<p class="muted tt-aviso">⚠ ${esc(TT.con.leads_msg || "No se pudieron traer los formularios.")}</p>`
    : TT.con.leads_msg ? `<p class="muted tt-aviso">${esc(TT.con.leads_msg)}</p>` : "";
  return `<div class="card s12 ad-card" id="ttMensajes">
    <div class="ad-h"><h3>Mensajes</h3><small class="muted">Lo que la gente le dice a tus anuncios</small></div>
    <div class="tt-msg">
      <section>
        <span class="ld-lbl">Comentarios en los anuncios</span>
        <nav class="ld-tabs ad-tabs tt-tabs" aria-label="Comentarios">${tabs}</nav>
        ${estadoCom}
        ${lista.length ? `<ul class="tt-coms">${lista.slice(0, 40).map(item).join("")}</ul>${lista.length > 40 ? `<p class="muted ad-nota">Se muestran los 40 más recientes.</p>` : ""}`
          : `<div class="ld-empty"><b>${TT.bandeja === "pendientes" ? "Nada por responder." : "Sin comentarios."}</b><span>${TT.bandeja === "pendientes" ? "Los comentarios nuevos aparecen aquí cada hora." : "Cuando comenten tus anuncios, aparecen aquí."}</span></div>`}
      </section>
      <section>
        <span class="ld-lbl">Formularios de TikTok</span>
        <p class="tt-num"><b>${adNum(an.solicitudes)}</b> en el periodo · ${adNum(an.ganadas)} ganado${an.ganadas === 1 ? "" : "s"}</p>
        ${estadoLeads}
        ${leads.length ? `<ul class="ad-leads">${leads.map(l => { const e = LEAD_ESTADOS[l.status] || LEAD_ESTADOS.nuevo;
          return `<li><button data-ttlead="${esc(l.id)}"><span>${esc(l.full_name || "Sin nombre")}<small>${esc([l.city, postDate(l.lead_created_at)].filter(Boolean).join(" · "))}</small></span><span class="lb ${e.cls}">${esc(e.t)}</span></button></li>`; }).join("")}</ul>`
          : `<p class="muted" style="font-size:13px">Cuando alguien llene un formulario instantáneo, llega al Centro de clientes como cualquier solicitud: con aviso, Vínculo y cotización.</p>`}
        <button class="btn ghost sm" data-ttgo="centro" style="margin-top:10px">Abrir el Centro de clientes →</button>
      </section>
    </div>
  </div>`;
}

/* ---------- tabla por campaña / grupo / anuncio ---------- */
const TT_COLS = [
  ["name", "Nombre"], ["status", "Estado"], ["spend", "Inversión"], ["impressions", "Impr."], ["reach", "Alcance"],
  ["clicks", "Clics"], ["ctr", "CTR"], ["cpc", "CPC"], ["video_plays", "Reprod."], ["hook", "Pasan 2 s"],
  ["results", "Result."], ["cpr", "Costo/res."], ["comments", "Coment."], ["solicitudes", "Form. ANIMA"], ["ganadas", "Ganadas"]
];
function ttFilasTabla(p){
  return TT.objs.filter(o => o.level === TT.nivel && ttVida(o) !== "eliminado" && (!TT.campana || o.campaign_id === TT.campana)
      && (TT.vista === "todos" || (TT.vista === "fin" ? !ttVigente(o) : ttVigente(o))))
    .map(o => {
      const t = ttSuma(ttFilas(p.desde, p.hasta, o.object_id)), an = ttAnima(p.desde, p.hasta, o.object_id);
      const r = ttAlcanceDe(TT.nivel, o.object_id);
      return { o, name: o.name || "", status: ttVida(o), spend: t.spend, impressions: t.impressions, reach: r ? r.reach : NaN,
        clicks: t.clicks, ctr: t.ctr, cpc: t.cpc, video_plays: t.video_plays, hook: t.hook, results: t.results, cpr: t.cpr,
        comments: t.comments, solicitudes: an.solicitudes, ganadas: an.ganadas };
    })
    .filter(x => x.spend || x.impressions || ttVigente(x.o) || x.solicitudes)
    .sort((x, y) => {
      const a = x[TT.orden], b = y[TT.orden];
      if(typeof a === "string") return String(a).localeCompare(String(b), "es") * TT.dir;
      return ((isFinite(a) ? a : -Infinity) - (isFinite(b) ? b : -Infinity)) * TT.dir;
    });
}
function ttEstadoBadge(o){ const [t, cls] = TT_VIDA[ttVida(o)] || ["—", "ad-off"]; return `<span class="ad-st ${cls}">${esc(t)}</span>`; }
function ttMiniatura(o){ const u = (o.creative || {}).cover_url; return u ? `<img class="ad-thumb" src="${esc(u)}" alt="" loading="lazy">` : `<span class="ad-thumb ad-thumb-v" aria-hidden="true">▶</span>`; }
function ttTablaHTML(p){
  const filas = ttFilasTabla(p);
  const lista = TT.objs.filter(o => o.level === TT.nivel && ttVida(o) !== "eliminado" && (!TT.campana || o.campaign_id === TT.campana));
  const n = { marcha: lista.filter(ttVigente).length, fin: lista.filter(o => !ttVigente(o)).length, todos: lista.length };
  const vistas = [["marcha", "En marcha"], ["fin", "Terminados y pausados"], ["todos", "Todos"]]
    .map(([k, x]) => `<button class="ld-camp ad-vb ${TT.vista === k ? "on" : ""}" data-ttvista="${k}" aria-pressed="${TT.vista === k}">${x} <span>${n[k]}</span></button>`).join("");
  const th = TT_COLS.map(([k, x]) => `<button class="ad-th ${TT.orden === k ? "on" : ""}" data-ttorden="${k}" role="columnheader" aria-sort="${TT.orden === k ? (TT.dir < 0 ? "descending" : "ascending") : "none"}">${esc(x)}${TT.orden === k ? (TT.dir < 0 ? " ↓" : " ↑") : ""}</button>`).join("");
  const sub = o => TT.nivel === "campaign" ? esc(TT_OBJETIVO[o.objective] || String(o.objective || "").replace(/_/g, " ").toLowerCase())
    : esc((ttObj(o.campaign_id) || {}).name || "");
  const cuerpo = filas.map(x => `<div class="ad-tr tt-tr" role="row" tabindex="0" data-ttopen="${esc(x.o.object_id)}">
      <span class="ad-td ad-td-n" role="cell">${TT.nivel === "ad" ? ttMiniatura(x.o) : ""}<span><b>${esc(x.name || "Sin nombre")}</b><small>${sub(x.o)}</small></span></span>
      <span class="ad-td" role="cell">${ttEstadoBadge(x.o)}</span>
      <span class="ad-td" role="cell">${ttMoney(x.spend)}</span>
      <span class="ad-td" role="cell">${adNum(x.impressions)}</span>
      <span class="ad-td" role="cell">${isFinite(x.reach) ? adNum(x.reach) : "…"}</span>
      <span class="ad-td" role="cell">${adNum(x.clicks)}</span>
      <span class="ad-td" role="cell">${adPct(x.ctr, 2)}</span>
      <span class="ad-td" role="cell">${isFinite(x.cpc) ? ttMoney(x.cpc) : "—"}</span>
      <span class="ad-td" role="cell">${adNum(x.video_plays)}</span>
      <span class="ad-td ${x.hook < 0.25 ? "ad-warn" : ""}" role="cell">${isFinite(x.hook) ? adPct(x.hook, 0) : "—"}</span>
      <span class="ad-td" role="cell">${adNum(x.results)}</span>
      <span class="ad-td" role="cell">${isFinite(x.cpr) ? ttMoney(x.cpr) : "—"}</span>
      <span class="ad-td" role="cell">${adNum(x.comments)}</span>
      <span class="ad-td" role="cell">${adNum(x.solicitudes)}</span>
      <span class="ad-td" role="cell">${adNum(x.ganadas)}</span>
    </div>`).join("");
  return `<div class="ad-h"><nav class="ld-tabs ad-tabs" aria-label="Nivel">${TT_NIVELES.map(([k, x]) => `<button class="ld-tab ${TT.nivel === k ? "on" : ""}" data-ttnivel="${k}">${x}<span>${TT.objs.filter(o => o.level === k && ttVida(o) !== "eliminado" && (!TT.campana || o.campaign_id === TT.campana)).length}</span></button>`).join("")}</nav>
      <span class="ad-vista" role="group" aria-label="Qué mostrar">${vistas}</span></div>
    ${filas.length ? `<div class="ad-tabla" role="table" aria-label="${esc((TT_NIVELES.find(x => x[0] === TT.nivel) || [])[1] || "")}"><div class="ad-tr tt-tr ad-thr" role="row">${th}</div>${cuerpo}</div>
      <p class="muted ad-nota">Resultados = lo que cuenta TikTok según lo que optimiza cada grupo. Formularios en ANIMA y ganadas = lo que pasó en el Centro de clientes con esas personas. Toca una fila para ver el detalle.</p>`
      : `<div class="ld-empty"><b>Nada que mostrar en este periodo.</b><span>${TT.objs.length ? "Prueba otro periodo o cambia a «Terminados» o «Todos»." : "Aún no se sincronizó nada: toca «Actualizar»."}</span></div>`}`;
}

/* ---------- detalle de una campaña, grupo o anuncio ---------- */
function ttPanelHTML(a, o, p){
  const t = ttSuma(ttFilas(p.desde, p.hasta, o.object_id)), an = ttAnima(p.desde, p.hasta, o.object_id);
  const r = ttAlcanceDe(o.level, o.object_id);
  const c = o.creative || {};
  const nivelTxt = { campaign: "Campaña", adgroup: "Grupo de anuncios", ad: "Anuncio" }[o.level];
  const kv = (k, v) => v ? `<div class="ld-kv"><span>${esc(k)}</span><b>${v}</b></div>` : "";
  const camp = ttObj(o.campaign_id), grupo = o.adgroup_id ? ttObj(o.adgroup_id) : null;
  const tg = (grupo && grupo.targeting) || o.targeting || null;
  const EDAD = { AGE_13_17: "13–17", AGE_18_24: "18–24", AGE_25_34: "25–34", AGE_35_44: "35–44", AGE_45_54: "45–54", AGE_55_100: "55+" };
  const publico = tg ? [Array.isArray(tg.age_groups) && tg.age_groups.length ? "Edad " + tg.age_groups.map(x => EDAD[x] || x).join(", ") : "",
    tg.gender === "GENDER_MALE" ? "Hombres" : tg.gender === "GENDER_FEMALE" ? "Mujeres" : "",
    Array.isArray(tg.location_ids) && tg.location_ids.length ? tg.location_ids.length + " ubicación" + (tg.location_ids.length === 1 ? "" : "es") : "",
    tg.placement_type === "PLACEMENT_TYPE_AUTOMATIC" ? "ubicaciones automáticas" : Array.isArray(tg.placements) ? tg.placements.map(x => String(x).replace("PLACEMENT_", "").toLowerCase()).join(", ") : ""
  ].filter(Boolean).join(" · ") : "";
  const conPresu = [o, grupo, camp].find(x => x && x.budget);
  const presup = conPresu ? (conPresu !== o ? "De " + (conPresu.level === "campaign" ? "la campaña" : "el grupo") + ": " : "") + ttMoney(conPresu.budget) + (/TOTAL/.test(conPresu.budget_mode || "") ? " en total" : " al día") : "";
  const fechas = [(grupo || o).start_time && new Date((grupo || o).start_time).toLocaleDateString("es-CL"), (grupo || o).stop_time && new Date((grupo || o).stop_time).toLocaleDateString("es-CL")].filter(Boolean).join(" → ");
  const coms = TT.comments.filter(x => !x.mine && (o.level === "ad" ? x.ad_id === o.object_id : o.level === "adgroup" ? x.adgroup_id === o.object_id : x.campaign_id === o.object_id || (x.ad_id && (ttObj(x.ad_id) || {}).campaign_id === o.object_id)));
  const pend = coms.filter(ttPendiente).length;
  const video = t.video_plays ? `<div class="ld-dsec"><span class="ld-lbl">Cuánto ven el video</span>${ttEmbudoVideo(t)}</div>` : "";
  const filasObj = TT.daily.filter(x => x.day >= p.desde && x.day <= p.hasta && (o.level === "ad" ? x.ad_id === o.object_id : o.level === "adgroup" ? x.adgroup_id === o.object_id : x.campaign_id === o.object_id));
  return `<div class="ld-scrim" data-ttback></div>
  <aside class="ld-drawer ad-drawer tt-drawer" tabindex="-1" role="dialog" aria-modal="true" aria-label="${esc(nivelTxt + " " + (o.name || ""))}">
    <header class="ld-dh">
      <div class="ld-dh-t"><small>${esc(nivelTxt)}</small><h3>${esc(o.name || "Sin nombre")}</h3><small>${ttEstadoBadge(o)} ${o.level !== "campaign" && camp ? esc(camp.name) : esc(TT_OBJETIVO[o.objective] || "")}</small></div>
      <button class="ld-x" data-ttback aria-label="Cerrar">✕</button>
    </header>
    ${o.level === "ad" ? `<div class="ld-dsec ad-crea">
      ${c.cover_url ? `<img src="${esc(c.cover_url)}" alt="Portada del video" loading="lazy">` : ""}
      <div>${c.display_name ? `<b>@${esc(String(c.display_name).replace(/^@/, ""))}</b>` : ""}${c.text ? `<p>${esc(c.text)}</p>` : ""}${c.cta ? `<span class="ad-cta">${esc(String(c.cta).replace(/_/g, " ").toLowerCase())}</span>` : ""}</div>
    </div>` : ""}
    <div class="ld-quick"><a class="btn ghost sm" href="https://ads.tiktok.com/i18n/perf/${o.level === "ad" ? "creative" : o.level === "adgroup" ? "adgroup" : "campaign"}?aadvid=${esc(TT.con.advertiser_id)}&keyword=${esc(o.object_id)}" target="_blank" rel="noopener">Abrir en Ads Manager ↗</a>
      ${c.landing ? `<a class="btn ghost sm" href="${esc(/^https?:\/\//i.test(c.landing) ? c.landing : "")}" target="_blank" rel="noopener">Destino ↗</a>` : ""}</div>
    <div class="ld-dsec"><span class="ld-lbl">${esc(adFechaCorta(p.desde))} – ${esc(adFechaCorta(p.hasta))}</span>
      <div class="ad-kpis ad-kpis-s">
        <div class="ad-kpi"><span>Inversión</span><b>${ttMoney(t.spend)}</b></div>
        <div class="ad-kpi"><span>Alcance</span><b>${r ? adNum(r.reach) : "…"}</b></div>
        <div class="ad-kpi"><span>Frecuencia</span><b>${r && r.frequency ? adDec(r.frequency, 2) : "…"}</b></div>
        <div class="ad-kpi"><span>Impresiones</span><b>${adNum(t.impressions)}</b></div>
        <div class="ad-kpi"><span>CTR</span><b>${adPct(t.ctr, 2)}</b></div>
        <div class="ad-kpi"><span>CPC</span><b>${isFinite(t.cpc) ? ttMoney(t.cpc) : "—"}</b></div>
        <div class="ad-kpi"><span>Resultados</span><b>${adNum(t.results)}</b></div>
        <div class="ad-kpi"><span>Costo/res.</span><b>${isFinite(t.cpr) ? ttMoney(t.cpr) : "—"}</b></div>
        <div class="ad-kpi"><span>Interacción</span><b>${adPct(t.er, 2)}</b></div>
        ${t.likes ? `<div class="ad-kpi"><span>Me gusta</span><b>${adNum(t.likes)}</b></div>` : ""}
        ${t.shares ? `<div class="ad-kpi"><span>Compartidos</span><b>${adNum(t.shares)}</b></div>` : ""}
        ${t.follows ? `<div class="ad-kpi"><span>Seguidores</span><b>${adNum(t.follows)}</b></div>` : ""}
      </div>
    </div>
    <div class="ld-dsec"><span class="ld-lbl">Día a día</span><div class="ad-charts ad-charts-1">${adGrafico(p, "spend", "Inversión", v => ttMoney(v), filasObj)}${adGrafico(p, "results", "Resultados", v => adNum(v), filasObj)}</div></div>
    ${video}
    <div class="ld-dsec"><span class="ld-lbl">Comentarios</span>
      <p style="margin:0 0 8px;font-size:13.5px">${adNum(coms.length)} en los últimos 120 días${pend ? ` · <b class="ad-bad-t">${adNum(pend)} por responder</b>` : ""}</p>
      ${coms.slice(0, 5).map(x => `<p class="tt-mini"><b>${esc(x.user_name || "Alguien")}</b> ${esc(x.text || "")}</p>`).join("")}
      ${coms.length ? `<button class="btn ghost sm" data-ttvercom>Ver en Mensajes</button>` : ""}
    </div>
    <div class="ld-dsec"><span class="ld-lbl">En tu negocio</span>${ttEmbudo(t, an)}
      ${an.lista.length ? `<ul class="ad-leads">${an.lista.slice(0, 12).map(l => { const e = LEAD_ESTADOS[l.status] || LEAD_ESTADOS.nuevo;
        return `<li><button data-ttlead="${esc(l.id)}"><span>${esc(l.full_name || "Sin nombre")}<small>${esc([l.city, postDate(l.lead_created_at)].filter(Boolean).join(" · "))}</small></span><span class="lb ${e.cls}">${esc(e.t)}</span></button></li>`; }).join("")}</ul>` : ""}
    </div>
    <div class="ld-dsec"><span class="ld-lbl">Configuración</span>
      ${kv("Objetivo", esc(TT_OBJETIVO[(camp || o).objective] || String((camp || o).objective || "").replace(/_/g, " ").toLowerCase()))}
      ${kv("Optimiza para", esc(String((grupo || o).optimization_goal || "").replace(/_/g, " ").toLowerCase()))}
      ${kv("Presupuesto", esc(presup))}
      ${kv("Fechas", esc(fechas))}
      ${kv("Público", esc(publico))}
      ${kv("Estado en TikTok", esc(String(o.secondary_status || "").replace(/_/g, " ").toLowerCase()))}
    </div>
  </aside>`;
}
function ttEmbudoVideo(t){
  const pasos = [["Reproducciones", t.video_plays], ["Pasan de 2 s", t.video_2s], ["Ven 6 s", t.video_6s], ["Ven el 25 %", t.video_p25], ["Ven el 50 %", t.video_p50], ["Ven el 75 %", t.video_p75], ["Lo ven entero", t.video_p100]];
  const base = Math.max(t.video_plays, 1);
  return `<div class="ad-funnel ad-funnel-v">${pasos.map(([k, v]) => `<div class="ad-step"><span class="ad-step-k">${esc(k)}</span><span class="ad-step-bar"><i style="width:${Math.max(v ? 2 : 0, v / base * 100)}%"></i></span><b>${adNum(v)}</b><small>${adPct(v / base, 0)}</small></div>`).join("")}</div>`;
}

/* ---------- conexión ---------- */
function ttVueltaUrl(){ return location.origin + location.pathname + "?" + TT_VUELTA; }
function ttConectarHTML(primera){
  if(TT.app === undefined && !TT.busy){ TT.app = null; ttFn({ action: "estado" }).then(r => { TT.app = r; ttRefresh(); }).catch(() => { TT.app = { app: false }; ttRefresh(); }); }
  if(TT.pick){
    return `<div class="card s12 ad-card"><div class="ld-panel"><h3>¿Qué cuenta publicitaria de TikTok conecto?</h3>
      ${TT.pick.map(c => `<button class="btn secondary sm" data-ttcuenta="${esc(c.id)}" style="margin:0 8px 8px 0">${esc(c.name)}${c.name !== c.id ? " · " + esc(c.id) : ""}</button>`).join("")}
      <div><button class="btn ghost sm" data-ttcancel>Cancelar</button></div></div></div>`;
  }
  const app = TT.app || {};
  const inner = `<div class="ld-panel">
      <h3>${primera ? "Conecta tu cuenta de TikTok Ads" : "Conexión con TikTok"}</h3>
      ${primera ? `<p class="muted" style="margin-top:0;font-size:13.5px">Verás aquí cada anuncio de TikTok con su inversión, cuánto ven el video, los comentarios (para responderlos sin salir de ANIMA) y los formularios, que llegan solos al Centro de clientes. Se actualiza cada hora.</p>` : ""}
      ${app.app ? `<button class="btn sm" data-ttentrar ${TT.busy ? "disabled" : ""}>${TT.busy === "connect" ? "Abriendo TikTok…" : "Entrar con TikTok"}</button>
        <p class="muted" style="font-size:12px;margin:8px 0 14px">Te lleva a TikTok for Business para autorizar tu cuenta publicitaria y vuelve aquí.</p>
        <details class="tt-mas"><summary>Conectar pegando un token</summary>${ttTokenForm()}</details>`
      : TT.app === null ? `<p class="muted" style="font-size:13px">Revisando…</p>`
      : `<ol class="lead-pasos">
          <li>En <b>business-api.tiktok.com</b> → <b>My Apps</b>, crea una app (o abre la tuya) con los permisos de cuentas, anuncios, reportes, comentarios y clientes potenciales.</li>
          <li>En la app, agrega como dirección de vuelta (Advertiser redirect URL): <code>${esc(ttVueltaUrl())}</code></li>
          <li>Pega aquí el <b>App ID</b> y la <b>clave secreta</b>. Después basta con «Entrar con TikTok».</li>
        </ol>
        <div class="lead-f2">
          <label class="lead-f">App ID<input id="ttAppId" autocomplete="off" inputmode="numeric"></label>
          <label class="lead-f">Clave secreta (Secret)<input id="ttAppSecret" type="password" autocomplete="off"></label>
        </div>
        <button class="btn sm" data-ttapp ${TT.busy ? "disabled" : ""}>${TT.busy === "app" ? "Guardando…" : "Guardar la app"}</button>
        <details class="tt-mas"><summary>¿Ya tienes un token de acceso? Pégalo</summary>${ttTokenForm()}</details>`}
      <p class="muted" style="font-size:12px;margin:12px 0">El token y la clave viajan una vez a tu servidor de ANIMA y quedan cifrados ahí. No se guardan en este dispositivo.</p>
      ${!primera ? `<button class="btn ghost sm" data-ttcancel>Cerrar</button><button class="btn ghost sm pd-del" data-ttdisconnect>Desconectar</button>` : ""}
    </div>`;
  return primera ? `<div class="card s12 ad-card">${inner}</div>` : inner;
}
function ttTokenForm(){
  return `<label class="lead-f">Token de acceso (Marketing API)<textarea id="ttTok" rows="2" autocomplete="off" spellcheck="false"></textarea></label>
    <label class="lead-f">ID de la cuenta publicitaria (advertiser ID)<input id="ttAdv" autocomplete="off" inputmode="numeric" placeholder="Arriba a la derecha en TikTok Ads Manager"></label>
    <button class="btn sm" data-ttdoconnect ${TT.busy ? "disabled" : ""}>${TT.busy === "connect" ? "Conectando…" : (TT.con ? "Reconectar" : "Conectar")}</button>`;
}
function ttResultadoConexion(r){
  if(r.elegir){ TT.pick = r.elegir; return; }
  if(r.ok){ TT.pick = null; TT.connectOpen = false; toast("✓ TikTok conectado: " + r.cuenta.name + (r.sync ? " · " + r.sync.msg : "")); }
  else toast(r.msg || "No se pudo conectar.");
}
async function ttConectar(opts){
  const body = {};
  if(opts.cuenta) body.advertiser_id = opts.cuenta;
  else {
    body.token = ((document.getElementById("ttTok") || {}).value || "").trim();
    body.advertiser_id = ((document.getElementById("ttAdv") || {}).value || "").trim() || undefined;
    if(!body.token){ toast("Pega el token de acceso."); return; }
  }
  TT.busy = "connect"; renderView();
  try{ ttResultadoConexion(await ttFn({ action: "connect", ...body })); }
  catch(e){ toast("TikTok: " + (e.message || e)); }
  TT.busy = ""; TT.con = undefined; TT.autoSync = true; await ttCargar(true);
}
async function ttEntrar(){
  TT.busy = "connect"; renderView();
  try{
    const r = await ttFn({ action: "auth_url", redirect_uri: ttVueltaUrl() });
    if(r.url){ state.view = "tiktok"; if(typeof save === "function") save(); location.href = r.url; return; }
    toast(r.msg || "No se pudo abrir TikTok.");
  }catch(e){ toast("TikTok: " + (e.message || e)); }
  TT.busy = ""; renderView();
}
/* Al volver de TikTok: se canjea el código una sola vez. */
function ttVueltaPendiente(){
  let v = null; try{ v = JSON.parse(sessionStorage.getItem("anima_tt_auth") || "null"); }catch(e){}
  if(!v) return false;
  if(TT.busy === "exchange") return true;
  try{ sessionStorage.removeItem("anima_tt_auth"); }catch(e){}
  TT.busy = "exchange";
  ttFn({ action: "exchange", auth_code: v.code, state: v.st })
    .then(ttResultadoConexion).catch(e => toast("TikTok: " + (e.message || e)))
    .finally(() => { TT.busy = ""; TT.con = undefined; TT.autoSync = true; ttCargar(true); });
  return true;
}

/* ---------- eventos ---------- */
function ttAbrir(id){
  TT.open = id; renderView();
  const o = ttObj(id); if(o) ttPedirAlcance([o.level]);
  requestAnimationFrame(() => { const d = document.querySelector(".tt-drawer"); if(d) d.focus(); });
}
function ttCambioPeriodo(){ renderView(); ttPedirAlcance(); if(TT.open) ttAbrir(TT.open); }
function ttIrMensajes(){ requestAnimationFrame(() => { const m = document.getElementById("ttMensajes"); if(m) m.scrollIntoView({ behavior: "smooth", block: "start" }); }); }

document.addEventListener("click", e => {
  if(state.view !== "tiktok") return;
  const t = e.target;
  if(t.closest("[data-ttsync]")){
    TT.busy = "sync"; renderView();
    ttFn({ action: "sync" }).then(r => toast(r.ok ? "✓ " + r.msg : "TikTok: " + r.msg)).catch(err => toast("No se pudo actualizar: " + err.message))
      .finally(() => { TT.busy = ""; ttCargar(true); });
    return;
  }
  if(t.closest("[data-ttconnect]")){ TT.connectOpen = !TT.connectOpen; TT.pick = null; renderView(); return; }
  if(t.closest("[data-ttcancel]")){ TT.connectOpen = false; TT.pick = null; renderView(); return; }
  if(t.closest("[data-ttdoconnect]")){ ttConectar({}); return; }
  if(t.closest("[data-ttentrar]")){ ttEntrar(); return; }
  const cu = t.closest("[data-ttcuenta]"); if(cu){ ttConectar({ cuenta: cu.dataset.ttcuenta }); return; }
  if(t.closest("[data-ttapp]")){
    const app_id = ((document.getElementById("ttAppId") || {}).value || "").trim(), secret = ((document.getElementById("ttAppSecret") || {}).value || "").trim();
    if(!app_id || !secret){ toast("Pega el App ID y la clave secreta."); return; }
    TT.busy = "app"; renderView();
    ttFn({ action: "app", app_id, secret }).then(r => { if(r.ok){ toast("✓ App guardada. Ahora entra con TikTok."); TT.app = { app: true, propia: true }; } else toast(r.msg); })
      .catch(err => toast(err.message)).finally(() => { TT.busy = ""; renderView(); });
    return;
  }
  if(t.closest("[data-ttdisconnect]")){
    if(!confirm("¿Desconectar TikTok? Se borran las métricas y comentarios guardados en ANIMA (en TikTok no se toca nada, y los formularios que ya llegaron al Centro de clientes se quedan).")) return;
    ttFn({ action: "disconnect" }).then(() => { toast("TikTok desconectado."); Object.assign(TT, { connectOpen: false, con: undefined, objs: [], daily: [], comments: [], reach: {} }); renderView(); })
      .catch(err => toast("No se pudo desconectar: " + err.message));
    return;
  }
  const bj = t.closest("[data-ttbandeja]"); if(bj){ TT.bandeja = bj.dataset.ttbandeja; TT.responder = null; renderView(); return; }
  const rs = t.closest("[data-ttresp]"); if(rs){
    TT.responder = rs.dataset.ttresp || null; renderView();
    if(TT.responder) requestAnimationFrame(() => { const x = document.getElementById("ttRespTxt"); if(x) x.focus(); });
    return;
  }
  const en = t.closest("[data-ttenviar]"); if(en){
    const id = en.dataset.ttenviar, texto = ((document.getElementById("ttRespTxt") || {}).value || "").trim();
    if(!texto){ toast("Escribe la respuesta."); return; }
    TT.enviando = id; en.disabled = true; en.textContent = "Enviando…";
    ttFn({ action: "responder", comment_id: id, text: texto })
      .then(r => { if(r.ok){ toast("✓ Respondido en TikTok"); TT.responder = null; } else toast(r.msg); })
      .catch(err => toast(err.message)).finally(() => { TT.enviando = ""; ttCargar(); });
    return;
  }
  const oc = t.closest("[data-ttocultar]"); if(oc){
    const ocultar = oc.dataset.v === "1";
    ttFn({ action: "ocultar", comment_ids: [oc.dataset.ttocultar], ocultar })
      .then(r => { if(r.ok){ const c = TT.comments.find(x => x.comment_id === oc.dataset.ttocultar); if(c) c.hidden = ocultar; toast(ocultar ? "Comentario oculto en TikTok" : "Comentario visible otra vez"); renderView(); } else toast(r.msg); })
      .catch(err => toast(err.message));
    return;
  }
  const ls = t.closest("[data-ttlisto]"); if(ls){
    const listo = ls.dataset.v !== "0", c = TT.comments.find(x => x.comment_id === ls.dataset.ttlisto);
    if(c){ c.done_at = listo ? new Date().toISOString() : null; renderView(); }
    ttFn({ action: "atendido", comment_id: ls.dataset.ttlisto, listo }).catch(err => toast(err.message));
    return;
  }
  if(t.closest("[data-ttvercom]")){ const o = ttObj(TT.open); TT.open = null; if(o && o.level === "campaign") TT.campana = o.object_id; TT.bandeja = "todos"; renderView(); ttIrMensajes(); return; }
  const vb = t.closest("[data-ttvista]"); if(vb){ TT.vista = vb.dataset.ttvista; renderView(); return; }
  const nv = t.closest("[data-ttnivel]"); if(nv){ TT.nivel = nv.dataset.ttnivel; renderView(); ttPedirAlcance([TT.nivel]); return; }
  const od = t.closest("[data-ttorden]"); if(od){ const k = od.dataset.ttorden; if(TT.orden === k) TT.dir *= -1; else { TT.orden = k; TT.dir = k === "name" ? 1 : -1; } renderView(); return; }
  const lg = t.closest("[data-ttlead]"); if(lg){ TT.open = null; if(typeof leadIrA === "function") leadIrA(lg.dataset.ttlead); return; }
  const g = t.closest("[data-ttgo]"); if(g){ if(g.dataset.ttgo === "mensajes"){ TT.bandeja = "pendientes"; renderView(); ttIrMensajes(); } else go(g.dataset.ttgo); return; }
  if(t.closest("[data-ttfx]")){
    const v = prompt("¿Cuántos " + ANIMA_CUR + " vale 1 " + ttCur() + "?", String(ttFx()));
    const n = Number(String(v || "").replace(/\./g, "").replace(",", "."));
    if(n > 0){ try{ localStorage.setItem("anima_ads_fx_" + ttCur(), String(n)); }catch(err){} renderView(); }
    return;
  }
  if(t.closest("[data-ttback]")){ TT.open = null; renderView(); return; }
  const op = t.closest("[data-ttopen]"); if(op){ ttAbrir(op.dataset.ttopen); return; }
});
document.addEventListener("change", e => {
  if(state.view !== "tiktok") return;
  const el = e.target;
  if(el.matches("[data-ttrango]")){ TT.rango = el.value; if(TT.rango === "rango" && !TT.desde){ const p = adPeriodo(TT); TT.desde = p.desde; TT.hasta = p.hasta; } ttCambioPeriodo(); return; }
  if(el.matches("[data-ttfecha]")){ TT[el.dataset.ttfecha] = el.value; ttCambioPeriodo(); return; }
  if(el.matches("[data-ttcampana]")){ TT.campana = el.value; renderView(); return; }
});
document.addEventListener("keydown", e => {
  if(state.view !== "tiktok") return;
  if(e.key === "Escape" && TT.open){ TT.open = null; renderView(); return; }
  if(e.key === "Enter" && e.target.matches && e.target.matches("[data-ttopen]")) ttAbrir(e.target.dataset.ttopen);
});
