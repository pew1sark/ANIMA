/* ===========================================================
   ANIMA STUDIO — Anuncios (Taller)
   -----------------------------------------------------------
   Panel para analizar y vigilar cada anuncio de Meta, cruzado con
   lo que pasa después dentro de ANIMA: la solicitud que dejó la
   persona, si se le contestó, si se cotizó y si se ganó el trabajo.

   DE DÓNDE SALE CADA NÚMERO
   - Meta (tablas meta_ads_*, migración 0137): la Edge Function
     `meta-ads` sincroniza cada hora campañas, conjuntos, anuncios con
     su creativo, y las métricas de cada anuncio por día.
   - Alcance y desgloses (edad, región, ubicación, dispositivo, hora)
     se le preguntan a Meta en vivo para el periodo elegido: el
     alcance NO se puede sumar día a día.
   - ANIMA: client_leads (Centro de clientes, ya en memoria en `CC`)
     por ad_id, y el valor de los proyectos enlazados (project_id).

   Como en el Centro de clientes, nada de esto va a `state` (que se
   guarda en el teléfono): vive en `AD`, en memoria.
   Se carga ANTES que anima.js: aquí solo se declaran funciones.
   =========================================================== */

const AD = { con: undefined, objs: [], daily: [], loading: false, busy: "",
             rango: "7", desde: "", hasta: "", campana: "", nivel: "campaign", orden: "spend", dir: -1, soloActivos: false,
             reach: {}, desglose: {}, porDesglose: "edad", open: null, pick: null, draft: null, connectOpen: false };

const AD_RANGOS = [
  ["hoy", "Hoy"], ["ayer", "Ayer"], ["7", "Últimos 7 días"], ["14", "Últimos 14 días"], ["30", "Últimos 30 días"],
  ["90", "Últimos 90 días"], ["mes", "Este mes"], ["mesant", "Mes pasado"], ["rango", "Elegir fechas…"]
];
const AD_NIVELES = [["campaign", "Campañas"], ["adset", "Conjuntos"], ["ad", "Anuncios"]];
const AD_DESGLOSES = [["edad", "Edad y género"], ["region", "Región"], ["ubicacion", "Ubicación"], ["dispositivo", "Dispositivo"], ["hora", "Hora del día"]];
const AD_ESTADO = {
  ACTIVE: ["Activo", "ad-on"], PAUSED: ["Pausado", "ad-off"], CAMPAIGN_PAUSED: ["Campaña pausada", "ad-off"], ADSET_PAUSED: ["Conjunto pausado", "ad-off"],
  IN_PROCESS: ["En revisión", "ad-rev"], PENDING_REVIEW: ["En revisión", "ad-rev"], DISAPPROVED: ["Rechazado", "ad-bad"], WITH_ISSUES: ["Con problemas", "ad-bad"],
  PENDING_BILLING_INFO: ["Falta pago", "ad-bad"], ARCHIVED: ["Archivado", "ad-off"], DELETED: ["Eliminado", "ad-off"], PREAPPROVED: ["Aprobado", "ad-rev"]
};
const AD_OBJETIVO = { OUTCOME_LEADS: "Clientes potenciales", OUTCOME_ENGAGEMENT: "Interacción", OUTCOME_AWARENESS: "Reconocimiento",
  OUTCOME_TRAFFIC: "Tráfico", OUTCOME_SALES: "Ventas", OUTCOME_APP_PROMOTION: "Apps", LEAD_GENERATION: "Clientes potenciales", MESSAGES: "Mensajes" };

/* ---------- fechas (días del calendario local, como AAAA-MM-DD) ---------- */
function adYmd(d){ return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function adDia(off){ const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return adYmd(d); }
function adSumar(ymd, n){ const [y, m, d] = ymd.split("-").map(Number); const x = new Date(y, m - 1, d, 12); x.setDate(x.getDate() + n); return adYmd(x); }
function adDias(a, b){ const f = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((f(b) - f(a)) / 86400000) + 1; }
/* [desde, hasta] inclusive, y el periodo anterior del mismo largo para comparar. */
function adPeriodo(){
  const r = AD.rango, hoy = adDia(0);
  let d, h = hoy;
  if(r === "hoy") d = hoy;
  else if(r === "ayer") d = h = adDia(-1);
  else if(r === "mes"){ const x = new Date(); d = adYmd(new Date(x.getFullYear(), x.getMonth(), 1, 12)); }
  else if(r === "mesant"){ const x = new Date(); d = adYmd(new Date(x.getFullYear(), x.getMonth() - 1, 1, 12)); h = adYmd(new Date(x.getFullYear(), x.getMonth(), 0, 12)); }
  else if(r === "rango"){ d = AD.desde || adDia(-6); h = AD.hasta || hoy; if(d > h){ const t = d; d = h; h = t; } }
  else d = adDia(1 - Number(r));
  const n = adDias(d, h);
  return { desde: d, hasta: h, n, prevDesde: adSumar(d, -n), prevHasta: adSumar(d, -1) };
}

/* ---------- formato ---------- */
function adCur(){ return (AD.con && AD.con.currency) || "USD"; }
function adMoney(n, dec){
  if(typeof ANIMA_DISCREET !== "undefined" && ANIMA_DISCREET) return "••••";
  const c = adCur(), sinDec = ["CLP", "COP", "JPY", "KRW", "PYG", "VND"].includes(c);
  try{ return new Intl.NumberFormat("es-CL", { style: "currency", currency: c, currencyDisplay: "narrowSymbol",
    minimumFractionDigits: sinDec ? 0 : (dec == null ? 2 : dec), maximumFractionDigits: sinDec ? 0 : (dec == null ? 2 : dec) }).format(n || 0).replace(/^\$/, c === "USD" ? "US$" : "$"); }
  catch(e){ return c + " " + Number(n || 0).toFixed(2); }
}
const adNum = n => Number(n || 0).toLocaleString("es-CL", { maximumFractionDigits: 0 });
const adPct = (n, dec) => isFinite(n) ? (n * 100).toLocaleString("es-CL", { minimumFractionDigits: dec == null ? 1 : dec, maximumFractionDigits: dec == null ? 1 : dec }) + "%" : "—";
const adDec = (n, d) => isFinite(n) ? Number(n).toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
function adFechaCorta(ymd){ const [y, m, d] = ymd.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("es-CL", { day: "numeric", month: "short" }).replace(".", ""); }

/* Tipo de cambio para comparar lo invertido (moneda de la cuenta) con lo que
   se cotizó y ganó (moneda de ANIMA). Se guarda solo en este dispositivo. */
function adFx(){
  if(adCur() === (typeof ANIMA_CUR !== "undefined" ? ANIMA_CUR : "CLP")) return 1;
  try{ const v = Number(localStorage.getItem("anima_ads_fx_" + adCur())); if(v > 0) return v; }catch(e){}
  return adCur() === "USD" ? 950 : 1;
}

/* ---------- datos ---------- */
async function loadAds(force){
  const a = me();
  if(AD.loading) return;
  if(!Cloud.enabled || !Cloud.client || !a || !a.live || !a.almaId){ AD.con = null; return; }
  AD.loading = true;
  try{
    const c = await Cloud.client.from("meta_ads_connections").select("*").eq("alma_id", a.almaId).maybeSingle();
    if(c.error) throw c.error;
    AD.con = c.data || null; AD.almaId = a.almaId;
    if(AD.con){
      const [o, d] = await Promise.all([
        adTodo(q => q.from("meta_ads_objects").select("*").eq("alma_id", a.almaId)),
        adTodo(q => q.from("meta_ads_daily").select("ad_id,day,campaign_id,adset_id,spend,impressions,reach,frequency,clicks,link_clicks,landing_views,leads,messages,engagement,video_3s,thruplays,video_p25,video_p50,video_p75,video_p100")
          .eq("alma_id", a.almaId).gte("day", adDia(-400)).order("day"))
      ]);
      AD.objs = o; AD.daily = d;
      if(force) AD.reach = {};
    }
  }catch(e){ console.error("ANIMA · anuncios", e); AD.con = AD.con === undefined ? null : AD.con; AD.error = e.message || String(e); }
  AD.loading = false;
  if(typeof leadsList === "function" && CC.leads === undefined && typeof loadLeads === "function") loadLeads();
  adRefresh();
  adPedirAlcance();
}
/* PostgREST entrega de a 1.000 filas: se pagina hasta traer todo. */
async function adTodo(armar){
  const out = []; const paso = 1000;
  for(let i = 0; i < 50; i++){
    const { data, error } = await armar(Cloud.client).range(i * paso, i * paso + paso - 1);
    if(error) throw error;
    out.push(...(data || []));
    if(!data || data.length < paso) break;
  }
  return out;
}
function adRefresh(){
  if(state.view !== "anuncios") return;
  const f = document.activeElement;
  if(f && f.closest && f.closest("#view") && /^(INPUT|TEXTAREA)$/.test(f.tagName)) return;
  /* Los datos en vivo (alcance, desgloses) llegan después: redibujar no debe
     devolver el panel abierto al principio. */
  const d = document.querySelector(".ad-drawer"), y = d ? d.scrollTop : 0;
  renderView();
  const d2 = document.querySelector(".ad-drawer"); if(d2 && y) d2.scrollTop = y;
}

async function adFn(body){
  const s = await Cloud.session();
  if(!s) throw new Error("Tu sesión expiró. Vuelve a entrar.");
  const r = await fetch(SB_URL + "/functions/v1/meta-ads", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + s.access_token, "apikey": SB_KEY },
    body: JSON.stringify({ ...body, alma_id: me().almaId })
  });
  const j = await r.json().catch(() => ({}));
  if(!r.ok && !j.elegir) throw new Error(j.msg || ("Error " + r.status));
  return j;
}

/* Alcance real del periodo (cuenta y nivel de la tabla), una vez por combinación. */
async function adPedirAlcance(){
  if(!AD.con) return;
  const p = adPeriodo();
  for(const level of [...new Set(["account", AD.nivel, "ad"])]){
    const k = p.desde + "|" + p.hasta + "|" + level;
    if(AD.reach[k]) continue;
    AD.reach[k] = { cargando: true };
    adFn({ action: "alcance", since: p.desde, until: p.hasta, level })
      .then(r => { AD.reach[k] = r.ok ? Object.fromEntries((r.filas || []).map(x => [x.id, x])) : { error: r.msg }; adRefresh(); })
      .catch(e => { AD.reach[k] = { error: e.message }; });
  }
}
function adAlcanceDe(level, id){
  const p = adPeriodo(), m = AD.reach[p.desde + "|" + p.hasta + "|" + level];
  if(!m || m.cargando || m.error) return null;
  return m[id] || { reach: 0, frequency: 0 };
}

/* ---------- métricas ---------- */
function adObj(id){ return AD.objs.find(o => o.object_id === id); }
function adSuma(filas){
  const t = { spend: 0, impressions: 0, clicks: 0, link_clicks: 0, landing_views: 0, leads: 0, messages: 0, engagement: 0,
              video_3s: 0, thruplays: 0, video_p25: 0, video_p50: 0, video_p75: 0, video_p100: 0, reachDia: 0, dias: new Set() };
  for(const r of filas){
    for(const k in t) if(typeof t[k] === "number" && k !== "reachDia") t[k] += Number(r[k] || 0);
    t.reachDia = Math.max(t.reachDia, Number(r.reach || 0));
    t.dias.add(r.day);
  }
  t.ctr = t.impressions ? t.link_clicks / t.impressions : NaN;
  t.cpc = t.link_clicks ? t.spend / t.link_clicks : NaN;
  t.cpm = t.impressions ? t.spend / t.impressions * 1000 : NaN;
  t.cpl = t.leads ? t.spend / t.leads : NaN;
  t.hook = t.impressions && t.video_3s ? t.video_3s / t.impressions : NaN;    // cuántos se quedan 3 s
  t.hold = t.video_3s && t.thruplays ? t.thruplays / t.video_3s : NaN;        // de esos, cuántos lo ven entero (o 15 s)
  return t;
}
function adFiltroDia(desde, hasta){ return r => r.day >= desde && r.day <= hasta; }
/* Filas del periodo, opcionalmente de un objeto (campaña, conjunto o anuncio). */
function adFilas(desde, hasta, id){
  const o = id ? adObj(id) : null;
  const campSel = AD.campana;
  return AD.daily.filter(r => r.day >= desde && r.day <= hasta
    && (!campSel || r.campaign_id === campSel)
    && (!o || (o.level === "ad" ? r.ad_id === id : o.level === "adset" ? r.adset_id === id : r.campaign_id === id)));
}

/* Lo que pasó en ANIMA con las solicitudes que trajo un anuncio (o campaña). */
function adAnima(desde, hasta, id){
  const o = id ? adObj(id) : null;
  const adsDe = new Set(AD.objs.filter(x => x.level === "ad" && (!o || (o.level === "ad" ? x.object_id === id : o.level === "adset" ? x.adset_id === id : x.campaign_id === id))
    && (!AD.campana || x.campaign_id === AD.campana)).map(x => x.object_id));
  const nombreCamp = o && o.level === "campaign" ? o.name : null;
  const L = (typeof leadsList === "function" ? leadsList() : []).filter(l => {
    const dia = adYmd(new Date(l.lead_created_at));
    if(dia < desde || dia > hasta) return false;
    if(l.ad_id) return adsDe.has(String(l.ad_id));
    if(l.source === "manual") return false;                   // anotadas a mano: no vienen de un anuncio
    return !o && !AD.campana ? !!l.campaign_name : (nombreCamp && l.campaign_name === nombreCamp);   // CSV sin ad_id
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

/* Salud de cada anuncio: lo que conviene mirar hoy. Siempre ícono + texto. */
function adAlertas(p){
  const cuenta = adSuma(adFilas(p.desde, p.hasta));
  const out = [];
  for(const o of AD.objs.filter(x => x.level === "ad" && (!AD.campana || x.campaign_id === AD.campana))){
    const t = adSuma(adFilas(p.desde, p.hasta, o.object_id));
    const est = o.effective_status || "";
    const nombre = o.name || "Anuncio";
    if(["DISAPPROVED", "WITH_ISSUES", "PENDING_BILLING_INFO"].includes(est)){
      const motivo = Array.isArray(o.issues) && o.issues[0] ? (o.issues[0].error_summary || o.issues[0].error_message || "") : "";
      out.push({ nivel: "critico", id: o.object_id, t: nombre + ": " + (AD_ESTADO[est] || [est])[0].toLowerCase(), d: motivo || "Revísalo en el Administrador de anuncios: no se está mostrando." });
      continue;
    }
    if(!t.spend) continue;
    const r = adAlcanceDe("ad", o.object_id);
    /* Costo por formulario solo tiene sentido si la campaña busca formularios. */
    const camp = adObj(o.campaign_id), buscaLeads = /LEAD/.test(String((camp && camp.objective) || "") + String((adObj(o.adset_id) || {}).optimization_goal || ""));
    const freq = r && r.frequency ? r.frequency : (t.reachDia ? t.impressions / Math.max(t.reachDia, 1) / Math.max(t.dias.size, 1) : 0);
    if(r && r.frequency >= 3.5) out.push({ nivel: "alto", id: o.object_id, t: nombre + ": fatiga (frecuencia " + adDec(freq, 1) + ")", d: "La misma gente lo vio muchas veces. Cambia el creativo o amplía el público." });
    if(t.impressions >= 1000 && t.ctr < 0.005) out.push({ nivel: "medio", id: o.object_id, t: nombre + ": pocos clics (CTR " + adPct(t.ctr, 2) + ")", d: "Menos de 1 de cada 200 lo toca. Prueba otra primera imagen o otro gancho." });
    if(buscaLeads && isFinite(cuenta.cpl) && t.leads && t.cpl > cuenta.cpl * 1.5) out.push({ nivel: "medio", id: o.object_id, t: nombre + ": clientes caros (" + adMoney(t.cpl) + " c/u)", d: "Cuesta " + adDec(t.cpl / cuenta.cpl, 1) + " veces el promedio de la cuenta (" + adMoney(cuenta.cpl) + ")." });
    if(buscaLeads && !t.leads && isFinite(cuenta.cpl) && t.spend > cuenta.cpl * 2) out.push({ nivel: "alto", id: o.object_id, t: nombre + ": gasta sin traer clientes", d: adMoney(t.spend) + " invertidos sin ningún formulario. Considera pausarlo." });
    if(isFinite(t.hook) && t.impressions >= 1000 && t.hook < 0.2) out.push({ nivel: "bajo", id: o.object_id, t: nombre + ": el video no engancha (" + adPct(t.hook, 0) + " se queda 3 s)", d: "Los primeros segundos no detienen el scroll. Empieza con el mural terminado o el antes/después." });
  }
  const an = adAnima(p.desde, p.hasta);
  if(cuenta.leads > an.solicitudes && typeof CC !== "undefined" && CC.leads)
    out.push({ nivel: "medio", t: "Meta cuenta " + cuenta.leads + " formularios y al Centro de clientes llegaron " + an.solicitudes, d: "Puede que falte conectar la página o traer el CSV. Revisa Taller → Centro de clientes." });
  const sinResp = an.lista.filter(l => l.status === "nuevo" || l.status === "revisado");
  if(sinResp.length) out.push({ nivel: "alto", t: sinResp.length + " solicitud" + (sinResp.length === 1 ? "" : "es") + " de anuncios sin responder", d: "Cada hora sin respuesta baja la probabilidad de cerrar. Contéstalas desde el Centro de clientes.", ir: "centro" });
  const orden = { critico: 0, alto: 1, medio: 2, bajo: 3 };
  return out.sort((x, y) => orden[x.nivel] - orden[y.nivel]);
}

/* ---------- vista ---------- */
function vAnuncios(a){
  if(!a.live || !Cloud.enabled) return `<div class="grid"><div class="card s12"><p class="muted">El panel de anuncios necesita tu sesión en la nube de ANIMA.</p></div></div>`;
  if(AD.almaId && AD.almaId !== a.almaId){ AD.con = undefined; AD.objs = []; AD.daily = []; AD.reach = {}; AD.open = null; }
  if(AD.con === undefined){ setTimeout(loadAds, 0); return `<div class="grid"><div class="card s12 ld-cargando"><span class="ld-spin"></span>Cargando anuncios…</div></div>`; }
  if(!AD.con) return `<div class="grid ad">${adConectarHTML(true)}</div>`;

  const p = adPeriodo();
  const t = adSuma(adFilas(p.desde, p.hasta)), t0 = adSuma(adFilas(p.prevDesde, p.prevHasta));
  const an = adAnima(p.desde, p.hasta), an0 = adAnima(p.prevDesde, p.prevHasta);
  const alc = adAlcanceDe("account", "account");
  const fx = adFx();
  const roas = t.spend ? an.valorGanado / (t.spend * fx) : NaN;
  const campanas = AD.objs.filter(o => o.level === "campaign").sort((x, y) => String(x.name).localeCompare(String(y.name), "es"));
  const opt = (v, txt, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(txt)}</option>`;

  const filtros = `<div class="ad-filtros">
      <select class="ld-sel on" data-adrango aria-label="Periodo">${AD_RANGOS.map(([k, x]) => opt(k, x, AD.rango)).join("")}</select>
      ${AD.rango === "rango" ? `<span class="ld-rango"><input type="date" data-adfecha="desde" value="${esc(AD.desde || p.desde)}" aria-label="Desde"><span>→</span><input type="date" data-adfecha="hasta" value="${esc(AD.hasta || p.hasta)}" aria-label="Hasta"></span>` : ""}
      <select class="ld-sel ${AD.campana ? "on" : ""}" data-adcampana aria-label="Campaña">${opt("", "Todas las campañas", AD.campana)}${campanas.map(c => opt(c.object_id, c.name, AD.campana)).join("")}</select>
      <label class="ad-check"><input type="checkbox" data-adactivos ${AD.soloActivos ? "checked" : ""}> Solo activos</label>
      <span class="ad-per muted">${esc(adFechaCorta(p.desde))} – ${esc(adFechaCorta(p.hasta))} · vs. ${esc(adFechaCorta(p.prevDesde))} – ${esc(adFechaCorta(p.prevHasta))}</span>
    </div>`;

  /* Variación contra el periodo anterior. `malo` = subir es malo (costos). */
  const delta = (x, y, malo) => {
    if(!isFinite(x) || !isFinite(y) || !y) return `<small class="ad-d">—</small>`;
    const v = (x - y) / Math.abs(y); if(Math.abs(v) < 0.005) return `<small class="ad-d">= igual</small>`;
    const bien = malo ? v < 0 : v > 0;
    return `<small class="ad-d ${bien ? "ad-up" : "ad-down"}">${v > 0 ? "▲" : "▼"} ${adPct(Math.abs(v), 0)}</small>`;
  };
  const tile = (k, v, d, ayuda) => `<div class="ad-kpi" ${ayuda ? `title="${esc(ayuda)}"` : ""}><span>${esc(k)}</span><b>${v}</b>${d || ""}</div>`;
  const kpisMeta = `<div class="ad-kpis">
      ${tile("Inversión", adMoney(t.spend), delta(t.spend, t0.spend), "Lo gastado en Meta en el periodo")}
      ${tile("Alcance", alc ? adNum(alc.reach) : (t.reachDia ? "≈ " + adNum(t.reachDia) : "—"), alc ? "" : `<small class="ad-d">${AD.reach[p.desde + "|" + p.hasta + "|account"] && AD.reach[p.desde + "|" + p.hasta + "|account"].cargando ? "consultando…" : "sin dato"}</small>`, "Personas distintas que lo vieron (Meta, periodo completo)")}
      ${tile("Impresiones", adNum(t.impressions), delta(t.impressions, t0.impressions))}
      ${tile("Frecuencia", alc && alc.frequency ? adDec(alc.frequency, 2) : "—", "", "Veces promedio que cada persona lo vio. Sobre 3,5 suele haber fatiga")}
      ${tile("Clics en el enlace", adNum(t.link_clicks), delta(t.link_clicks, t0.link_clicks))}
      ${tile("CTR", adPct(t.ctr, 2), delta(t.ctr, t0.ctr), "Clics en el enlace / impresiones")}
      ${tile("CPC", isFinite(t.cpc) ? adMoney(t.cpc) : "—", delta(t.cpc, t0.cpc, true), "Costo por clic en el enlace")}
      ${tile("CPM", isFinite(t.cpm) ? adMoney(t.cpm) : "—", delta(t.cpm, t0.cpm, true), "Costo por mil impresiones")}
    </div>`;
  const kpisNegocio = `<div class="ad-kpis ad-kpis-n">
      ${tile("Formularios (Meta)", adNum(t.leads), delta(t.leads, t0.leads))}
      ${tile("Costo por formulario", isFinite(t.cpl) ? adMoney(t.cpl) : "—", delta(t.cpl, t0.cpl, true))}
      ${tile("Solicitudes en ANIMA", adNum(an.solicitudes), delta(an.solicitudes, an0.solicitudes))}
      ${tile("Contactadas", adNum(an.contactadas), an.solicitudes ? `<small class="ad-d">${adPct(an.contactadas / an.solicitudes, 0)} de las solicitudes</small>` : "")}
      ${tile("Cotizadas", adNum(an.cotizadas), an.cotizadas && t.spend ? `<small class="ad-d">${adMoney(t.spend / an.cotizadas)} por cotización</small>` : "")}
      ${tile("Ganadas", adNum(an.ganadas), an.ganadas && t.spend ? `<small class="ad-d">${adMoney(t.spend / an.ganadas)} por cliente</small>` : "")}
      ${tile("Valor ganado", money(an.valorGanado), an.valorCotizado ? `<small class="ad-d">${money(an.valorCotizado)} cotizado</small>` : "")}
      ${tile("Retorno (ROAS)", isFinite(roas) && t.spend ? adDec(roas, 1) + "×" : "—", fx !== 1 ? `<small class="ad-d"><button class="ad-fx" data-adfx>1 ${esc(adCur())} = ${esc(adNum(fx))} ${esc(ANIMA_CUR)}</button></small>` : "", "Valor ganado / inversión")}
    </div>`;

  const alertas = adAlertas(p);
  const ICO = { critico: "⛔", alto: "▲", medio: "●", bajo: "○" };
  const TXT = { critico: "Crítico", alto: "Importante", medio: "Mirar", bajo: "Sugerencia" };
  const salud = `<div class="card s12 ad-card"><div class="ad-h"><h3>Salud de los anuncios</h3><small class="muted">${alertas.length ? alertas.length + " cosa" + (alertas.length === 1 ? "" : "s") + " por mirar" : "Todo en orden en este periodo"}</small></div>
      ${alertas.length ? `<ul class="ad-alertas">${alertas.slice(0, 8).map(x => `<li class="ad-al ad-al-${x.nivel}" ${x.id ? `data-adopen="${esc(x.id)}"` : x.ir ? `data-adgo="${esc(x.ir)}"` : ""}>
          <span class="ad-al-i" aria-hidden="true">${ICO[x.nivel]}</span><div><b>${esc(x.t)}</b><small>${esc(x.d)}</small></div><span class="ad-al-t">${TXT[x.nivel]}</span></li>`).join("")}</ul>`
        : `<p class="muted" style="margin:6px 0 0;font-size:13px">Sin rechazos, sin fatiga y sin anuncios gastando de más.</p>`}</div>`;

  return `<div class="grid ad">
    <div class="card s12 ad-card">
      <div class="ld-head">
        <div class="ld-title"><h2>Anuncios</h2><p>${esc(AD.con.account_name || "Cuenta " + AD.con.ad_account_id)} · ${esc(adCur())} · ${adConexionTxt()}</p></div>
        <div class="ld-tools">
          <button class="btn ghost sm" data-adsync ${AD.busy ? "disabled" : ""}>${AD.busy === "sync" ? "Actualizando…" : "↻ Actualizar"}</button>
          <a class="btn ghost sm" href="https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${esc(AD.con.ad_account_id)}" target="_blank" rel="noopener">Administrador ↗</a>
          <button class="btn ghost sm" data-adconnect aria-label="Conexión">⚙</button>
        </div>
      </div>
      ${AD.connectOpen ? adConectarHTML(false) : ""}
      ${filtros}
      <div class="ad-sec"><span class="ld-lbl">En Meta</span>${kpisMeta}</div>
      <div class="ad-sec"><span class="ld-lbl">En tu negocio</span>${kpisNegocio}</div>
    </div>
    <div class="card s12 ad-card"><div class="ad-h"><h3>Día a día</h3><small class="muted">Pasa el dedo o el mouse por una barra para ver el detalle</small></div>
      <div class="ad-charts">${adGrafico(p, "spend", "Inversión por día", v => adMoney(v))}${adGrafico(p, "leads", "Formularios por día", v => adNum(v))}${adGrafico(p, "link_clicks", "Clics en el enlace por día", v => adNum(v))}</div>
    </div>
    <div class="card s12 ad-card"><div class="ad-h"><h3>Del anuncio al trabajo ganado</h3><small class="muted">Cuántos pasan de un paso al siguiente</small></div>${adEmbudo(t, an)}</div>
    ${salud}
    <div class="card s12 ad-card">${adTablaHTML(p)}</div>
  </div>
  ${AD.open && adObj(AD.open) ? adPanelHTML(a, adObj(AD.open), p) : ""}`;
}

function adConexionTxt(){
  const c = AD.con; if(!c) return "";
  const mal = c.last_sync_ok === false;
  const vence = c.token_expires_at ? Math.round((new Date(c.token_expires_at) - Date.now()) / 86400000) : null;
  return `<span class="${mal ? "ad-bad-t" : ""}">${esc(mal ? "Error: " + (c.last_sync_msg || "") : "actualizado " + (c.last_sync_at ? "hace " + timeAgo(c.last_sync_at) : "—"))}</span>`
    + (vence != null && vence < 10 ? ` · <b class="ad-bad-t">el token vence en ${vence} día${vence === 1 ? "" : "s"}</b>` : "");
}

/* Barras por día (una serie por gráfico: nada de dos ejes). */
function adGrafico(p, campo, titulo, fmt, filas){
  const dias = []; for(let d = p.desde; d <= p.hasta; d = adSumar(d, 1)) dias.push(d);
  if(dias.length > 120) dias.splice(0, dias.length - 120);
  const por = {}; for(const r of (filas || adFilas(p.desde, p.hasta))) por[r.day] = (por[r.day] || 0) + Number(r[campo] || 0);
  const vals = dias.map(d => por[d] || 0), max = Math.max(...vals, 0);
  const total = vals.reduce((s, v) => s + v, 0);
  const W = 100 / Math.max(dias.length, 1);
  const barras = dias.map((d, i) => {
    const h = max ? Math.max(vals[i] ? 2 : 0, vals[i] / max * 100) : 0;
    return `<span class="ad-bar" style="--h:${h}%;width:${W}%" data-tip="${esc(adFechaCorta(d))}: ${esc(fmt(vals[i]))}" tabindex="0"><i></i></span>`;
  }).join("");
  return `<figure class="ad-chart"><figcaption><span>${esc(titulo)}</span><b>${esc(fmt(total))}</b></figcaption>
    <div class="ad-plot" role="img" aria-label="${esc(titulo)}: ${esc(fmt(total))} en ${dias.length} días">${max ? `<span class="ad-max">${esc(fmt(max))}</span>` : ""}${barras}</div>
    <div class="ad-axis"><span>${esc(adFechaCorta(dias[0] || p.desde))}</span><span>${esc(adFechaCorta(dias[dias.length - 1] || p.hasta))}</span></div>
    <div class="ad-tip" hidden></div></figure>`;
}

function adEmbudo(t, an){
  const pasos = [
    ["Impresiones", t.impressions], ["Clics en el enlace", t.link_clicks], ["Formularios (Meta)", t.leads],
    ["Solicitudes en ANIMA", an.solicitudes], ["Contactadas", an.contactadas], ["Cotizadas", an.cotizadas], ["Ganadas", an.ganadas]
  ];
  const max = Math.max(pasos[0][1], 1);
  return `<div class="ad-funnel">${pasos.map(([k, v], i) => {
    const prev = i ? pasos[i - 1][1] : 0;
    const conv = i && prev ? adPct(v / prev, v / prev < 0.01 ? 2 : 1) : "";
    // Escala raíz: las impresiones son miles y las ganadas, pocas; así se ven todas.
    const w = v ? Math.max(2, Math.sqrt(v / max) * 100) : 0;
    return `<div class="ad-step"><span class="ad-step-k">${esc(k)}</span><span class="ad-step-bar"><i style="width:${w}%"></i></span><b>${adNum(v)}</b><small>${conv ? conv + " del paso anterior" : ""}</small></div>`;
  }).join("")}</div>`;
}

/* Tabla por campaña / conjunto / anuncio, ordenable. */
const AD_COLS = [
  ["name", "Nombre"], ["status", "Estado"], ["spend", "Inversión"], ["impressions", "Impr."], ["reach", "Alcance"], ["frequency", "Frec."],
  ["link_clicks", "Clics"], ["ctr", "CTR"], ["cpc", "CPC"], ["leads", "Form."], ["cpl", "Costo/form."],
  ["solicitudes", "Solic."], ["cotizadas", "Cotiz."], ["ganadas", "Ganadas"], ["roas", "ROAS"]
];
function adFilasTabla(p){
  const fx = adFx();
  return AD.objs.filter(o => o.level === AD.nivel && (!AD.campana || o.campaign_id === AD.campana)
      && (!AD.soloActivos || o.effective_status === "ACTIVE"))
    .map(o => {
      const t = adSuma(adFilas(p.desde, p.hasta, o.object_id)), an = adAnima(p.desde, p.hasta, o.object_id);
      const r = adAlcanceDe(AD.nivel, o.object_id);
      return { o, t, an, name: o.name || "", status: o.effective_status || "", spend: t.spend, impressions: t.impressions,
        reach: r ? r.reach : NaN, frequency: r ? r.frequency : NaN, link_clicks: t.link_clicks, ctr: t.ctr, cpc: t.cpc,
        leads: t.leads, cpl: t.cpl, solicitudes: an.solicitudes, cotizadas: an.cotizadas, ganadas: an.ganadas,
        roas: t.spend ? an.valorGanado / (t.spend * fx) : NaN };
    })
    .filter(x => x.spend || x.impressions || x.o.effective_status === "ACTIVE" || x.solicitudes)
    .sort((x, y) => {
      const a = x[AD.orden], b = y[AD.orden];
      if(typeof a === "string") return String(a).localeCompare(String(b), "es") * AD.dir;
      return ((isFinite(a) ? a : -Infinity) - (isFinite(b) ? b : -Infinity)) * AD.dir;
    });
}
function adEstadoBadge(o){
  const [t, cls] = AD_ESTADO[o.effective_status] || [o.effective_status || "—", "ad-off"];
  return `<span class="ad-st ${cls}">${esc(t)}</span>`;
}
function adTablaHTML(p){
  const filas = adFilasTabla(p);
  const th = AD_COLS.map(([k, t]) => `<button class="ad-th ${AD.orden === k ? "on" : ""}" data-adorden="${k}" role="columnheader" aria-sort="${AD.orden === k ? (AD.dir < 0 ? "descending" : "ascending") : "none"}">${esc(t)}${AD.orden === k ? (AD.dir < 0 ? " ↓" : " ↑") : ""}</button>`).join("");
  const miniatura = o => { const c = o.creative || {}; const u = c.thumbnail_url || c.image_url; return u ? `<img class="ad-thumb" src="${esc(u)}" alt="" loading="lazy">` : `<span class="ad-thumb ad-thumb-v" aria-hidden="true">▣</span>`; };
  const cuerpo = filas.map(x => `<div class="ad-tr" role="row" tabindex="0" data-adopen="${esc(x.o.object_id)}">
      <span class="ad-td ad-td-n" role="cell">${AD.nivel === "ad" ? miniatura(x.o) : ""}<span><b>${esc(x.name || "Sin nombre")}</b>${AD.nivel !== "campaign" ? `<small>${esc((adObj(x.o.campaign_id) || {}).name || "")}</small>` : `<small>${esc(AD_OBJETIVO[x.o.objective] || x.o.objective || "")}</small>`}</span></span>
      <span class="ad-td" role="cell">${adEstadoBadge(x.o)}</span>
      <span class="ad-td" role="cell">${adMoney(x.spend)}</span>
      <span class="ad-td" role="cell">${adNum(x.impressions)}</span>
      <span class="ad-td" role="cell">${isFinite(x.reach) ? adNum(x.reach) : "…"}</span>
      <span class="ad-td ${x.frequency >= 3.5 ? "ad-warn" : ""}" role="cell">${isFinite(x.frequency) ? adDec(x.frequency, 1) : "…"}</span>
      <span class="ad-td" role="cell">${adNum(x.link_clicks)}</span>
      <span class="ad-td" role="cell">${adPct(x.ctr, 2)}</span>
      <span class="ad-td" role="cell">${isFinite(x.cpc) ? adMoney(x.cpc) : "—"}</span>
      <span class="ad-td" role="cell">${adNum(x.leads)}</span>
      <span class="ad-td" role="cell">${isFinite(x.cpl) ? adMoney(x.cpl) : "—"}</span>
      <span class="ad-td" role="cell">${adNum(x.solicitudes)}</span>
      <span class="ad-td" role="cell">${adNum(x.cotizadas)}</span>
      <span class="ad-td" role="cell">${adNum(x.ganadas)}</span>
      <span class="ad-td" role="cell">${isFinite(x.roas) && x.spend ? adDec(x.roas, 1) + "×" : "—"}</span>
    </div>`).join("");
  return `<div class="ad-h"><nav class="ld-tabs ad-tabs" aria-label="Nivel">${AD_NIVELES.map(([k, t]) => `<button class="ld-tab ${AD.nivel === k ? "on" : ""}" data-adnivel="${k}">${t}<span>${AD.objs.filter(o => o.level === k && (!AD.campana || o.campaign_id === AD.campana)).length}</span></button>`).join("")}</nav></div>
    ${filas.length ? `<div class="ad-tabla" role="table" aria-label="${esc((AD_NIVELES.find(n => n[0] === AD.nivel) || [])[1] || "")}"><div class="ad-tr ad-thr" role="row">${th}</div>${cuerpo}</div>
      <p class="muted ad-nota">Formularios = lo que cuenta Meta. Solicitudes, cotizadas y ganadas = lo que pasó en ANIMA con las personas de ese anuncio. Toca una fila para ver el detalle.</p>`
      : `<div class="ld-empty"><b>Nada que mostrar en este periodo.</b><span>${AD.objs.length ? "Prueba otro periodo o quita «Solo activos»." : "Aún no se sincronizó nada: toca «Actualizar»."}</span></div>`}`;
}

/* Detalle de una campaña, conjunto o anuncio. */
function adPanelHTML(a, o, p){
  const t = adSuma(adFilas(p.desde, p.hasta, o.object_id)), an = adAnima(p.desde, p.hasta, o.object_id);
  const r = adAlcanceDe(o.level, o.object_id);
  const c = o.creative || {};
  const nivelTxt = { campaign: "Campaña", adset: "Conjunto de anuncios", ad: "Anuncio" }[o.level];
  const kv = (k, v) => v ? `<div class="ld-kv"><span>${esc(k)}</span><b>${v}</b></div>` : "";
  const camp = adObj(o.campaign_id), set = o.adset_id ? adObj(o.adset_id) : null;
  const tg = (set && set.targeting) || o.targeting || null;
  const publico = tg ? [tg.age_min && ("Edad " + tg.age_min + "–" + (tg.age_max || "65+")),
    tg.genders && tg.genders.length === 1 ? (tg.genders[0] === 1 ? "Hombres" : "Mujeres") : "",
    tg.geo_locations && [...(tg.geo_locations.cities || []).map(x => x.name + (x.radius ? " +" + x.radius + " " + (x.distance_unit === "mile" ? "mi" : "km") : "")), ...(tg.geo_locations.regions || []).map(x => x.name), ...(tg.geo_locations.countries || [])].join(", "),
    tg.publisher_platforms && tg.publisher_platforms.join(", ")].filter(Boolean).join(" · ") : "";
  const presup = o.daily_budget ? adMoney(o.daily_budget) + " al día" : o.lifetime_budget ? adMoney(o.lifetime_budget) + " en total" : "";
  const fechas = [o.start_time && new Date(o.start_time).toLocaleDateString("es-CL"), o.stop_time && new Date(o.stop_time).toLocaleDateString("es-CL")].filter(Boolean).join(" → ");
  const video = t.video_3s ? `<div class="ld-dsec"><span class="ld-lbl">Cuánto ven el video</span>${adEmbudoVideo(t)}</div>` : "";
  const des = AD.desglose[o.object_id + "|" + AD.porDesglose + "|" + p.desde + "|" + p.hasta];
  const idAds = o.level === "ad" ? "selected_ad_ids" : o.level === "adset" ? "selected_adset_ids" : "selected_campaign_ids";
  const tab = o.level === "ad" ? "ads" : o.level === "adset" ? "adsets" : "campaigns";
  return `<div class="ld-scrim" data-adback></div>
  <aside class="ld-drawer ad-drawer" tabindex="-1" role="dialog" aria-modal="true" aria-label="${esc(nivelTxt + " " + (o.name || ""))}">
    <header class="ld-dh">
      <div class="ld-dh-t"><small>${esc(nivelTxt)}</small><h3>${esc(o.name || "Sin nombre")}</h3><small>${adEstadoBadge(o)} ${o.level !== "campaign" && camp ? esc(camp.name) : esc(AD_OBJETIVO[o.objective] || "")}</small></div>
      <button class="ld-x" data-adback aria-label="Cerrar">✕</button>
    </header>
    ${o.level === "ad" ? `<div class="ld-dsec ad-crea">
      ${c.thumbnail_url || c.image_url ? `<img src="${esc(c.image_url || c.thumbnail_url)}" alt="Creativo del anuncio" loading="lazy">` : ""}
      <div>${c.title ? `<b>${esc(c.title)}</b>` : ""}${c.body ? `<p>${esc(c.body)}</p>` : ""}${c.cta ? `<span class="ad-cta">${esc(c.cta.replace(/_/g, " ").toLowerCase())}</span>` : ""}</div>
    </div>` : ""}
    <div class="ld-quick"><a class="btn ghost sm" href="https://adsmanager.facebook.com/adsmanager/manage/${tab}?act=${esc(AD.con.ad_account_id)}&${idAds}=${esc(o.object_id)}" target="_blank" rel="noopener">Abrir en el Administrador ↗</a>
      ${c.post_id ? `<a class="btn ghost sm" href="https://www.facebook.com/${esc(c.post_id)}" target="_blank" rel="noopener">Ver publicación ↗</a>` : ""}</div>
    <div class="ld-dsec"><span class="ld-lbl">${esc(adFechaCorta(p.desde))} – ${esc(adFechaCorta(p.hasta))}</span>
      <div class="ad-kpis ad-kpis-s">
        <div class="ad-kpi"><span>Inversión</span><b>${adMoney(t.spend)}</b></div>
        <div class="ad-kpi"><span>Alcance</span><b>${r ? adNum(r.reach) : "…"}</b></div>
        <div class="ad-kpi"><span>Frecuencia</span><b>${r && r.frequency ? adDec(r.frequency, 2) : "…"}</b></div>
        <div class="ad-kpi"><span>Impresiones</span><b>${adNum(t.impressions)}</b></div>
        <div class="ad-kpi"><span>CTR</span><b>${adPct(t.ctr, 2)}</b></div>
        <div class="ad-kpi"><span>CPC</span><b>${isFinite(t.cpc) ? adMoney(t.cpc) : "—"}</b></div>
        <div class="ad-kpi"><span>CPM</span><b>${isFinite(t.cpm) ? adMoney(t.cpm) : "—"}</b></div>
        <div class="ad-kpi"><span>Formularios</span><b>${adNum(t.leads)}</b></div>
        <div class="ad-kpi"><span>Costo/form.</span><b>${isFinite(t.cpl) ? adMoney(t.cpl) : "—"}</b></div>
        ${t.messages ? `<div class="ad-kpi"><span>Conversaciones</span><b>${adNum(t.messages)}</b></div>` : ""}
        ${t.engagement ? `<div class="ad-kpi"><span>Interacciones</span><b>${adNum(t.engagement)}</b></div>` : ""}
        ${t.landing_views ? `<div class="ad-kpi"><span>Visitas a la web</span><b>${adNum(t.landing_views)}</b></div>` : ""}
      </div>
    </div>
    <div class="ld-dsec"><span class="ld-lbl">Día a día</span><div class="ad-charts ad-charts-1">${adGraficoDe(p, o.object_id, "spend", "Inversión", v => adMoney(v))}${adGraficoDe(p, o.object_id, "leads", "Formularios", v => adNum(v))}</div></div>
    ${video}
    <div class="ld-dsec"><span class="ld-lbl">En tu negocio</span>${adEmbudo(t, an)}
      ${an.lista.length ? `<ul class="ad-leads">${an.lista.slice(0, 12).map(l => { const e = LEAD_ESTADOS[l.status] || LEAD_ESTADOS.nuevo;
        return `<li><button data-adlead="${esc(l.id)}"><span>${esc(l.full_name || "Sin nombre")}<small>${esc([l.city, postDate(l.lead_created_at)].filter(Boolean).join(" · "))}</small></span><span class="lb ${e.cls}">${esc(e.t)}</span></button></li>`; }).join("")}</ul>` : ""}
    </div>
    <div class="ld-dsec"><span class="ld-lbl">¿A quién le llega?</span>
      <div class="ad-seg">${AD_DESGLOSES.map(([k, x]) => `<button class="ld-camp ${AD.porDesglose === k ? "on" : ""}" data-addesglose="${k}">${esc(x)}</button>`).join("")}</div>
      ${adDesgloseHTML(des)}
    </div>
    <div class="ld-dsec"><span class="ld-lbl">Configuración</span>
      ${kv("Objetivo", esc(AD_OBJETIVO[(camp || o).objective] || (camp || o).objective || ""))}
      ${kv("Optimiza para", esc(((set || o).optimization_goal || "").replace(/_/g, " ").toLowerCase()))}
      ${kv("Presupuesto", presup ? esc(presup) : (o.level !== "campaign" && camp && (camp.daily_budget || camp.lifetime_budget) ? "De la campaña: " + esc(camp.daily_budget ? adMoney(camp.daily_budget) + " al día" : adMoney(camp.lifetime_budget) + " en total") : ""))}
      ${kv("Fechas", esc(fechas))}
      ${kv("Público", esc(publico))}
      ${Array.isArray(o.issues) && o.issues.length ? kv("Problemas", esc(o.issues.map(x => x.error_summary || x.error_message).join(" · "))) : ""}
    </div>
  </aside>`;
}
function adGraficoDe(p, id, campo, titulo, fmt){
  const o = adObj(id);
  const filas = AD.daily.filter(r => r.day >= p.desde && r.day <= p.hasta
    && (o.level === "ad" ? r.ad_id === id : o.level === "adset" ? r.adset_id === id : r.campaign_id === id));
  return adGrafico(p, campo, titulo, fmt, filas);
}
function adEmbudoVideo(t){
  const pasos = [["Se quedan 3 s", t.video_3s], ["Ven el 25 %", t.video_p25], ["Ven el 50 %", t.video_p50], ["Ven el 75 %", t.video_p75], ["Lo ven entero", t.video_p100]];
  const base = Math.max(t.video_3s, 1);
  return `<div class="ad-funnel ad-funnel-v">${pasos.map(([k, v]) => `<div class="ad-step"><span class="ad-step-k">${esc(k)}</span><span class="ad-step-bar"><i style="width:${Math.max(v ? 2 : 0, v / base * 100)}%"></i></span><b>${adNum(v)}</b><small>${adPct(v / base, 0)}</small></div>`).join("")}</div>
    <p class="muted ad-nota">De cada 100 impresiones, ${adDec(t.hook * 100, 0)} se quedan 3 segundos${isFinite(t.hold) ? " y " + adPct(t.hold, 0) + " de ellos llegan a ThruPlay (15 s o entero)" : ""}.</p>`;
}
function adDesgloseHTML(des){
  if(!des) return `<p class="muted" style="font-size:13px">Consultando a Meta…</p>`;
  if(des.error) return `<p class="muted" style="font-size:13px">${esc(des.error)}</p>`;
  const filas = (des.filas || []).filter(x => x.impressions).sort((x, y) => AD.porDesglose === "hora" ? String(x.clave).localeCompare(String(y.clave)) : y.spend - x.spend).slice(0, 24);
  if(!filas.length) return `<p class="muted" style="font-size:13px">Sin datos en este periodo.</p>`;
  const max = Math.max(...filas.map(x => x.impressions), 1);
  const nombre = k => String(k).replace(/^(\d\d):00:00 - (\d\d):59:59$/, "$1 h").replace(/\bfemale\b/, "mujeres").replace(/\bmale\b/, "hombres").replace(/\bunknown\b/, "sin dato")
    .replace(/\bfacebook\b/, "Facebook").replace(/\binstagram\b/, "Instagram").replace(/\baudience_network\b/, "Audience Network").replace(/\bmessenger\b/, "Messenger").replace(/_/g, " ");
  return `<div class="ad-des">${filas.map(x => `<div class="ad-des-r"><span class="ad-des-k">${esc(nombre(x.clave))}</span><span class="ad-step-bar"><i style="width:${Math.max(2, x.impressions / max * 100)}%"></i></span>
      <span class="ad-des-v"><b>${adMoney(x.spend)}</b><small>${adNum(x.impressions)} impr · ${adPct(x.impressions ? x.link_clicks / x.impressions : NaN, 2)} CTR${x.leads ? " · " + adNum(x.leads) + " form." : ""}</small></span></div>`).join("")}</div>`;
}
async function adPedirDesglose(id){
  const p = adPeriodo(), k = id + "|" + AD.porDesglose + "|" + p.desde + "|" + p.hasta;
  if(AD.desglose[k]) return;
  AD.desglose[k] = null;
  try{ const r = await adFn({ action: "desglose", id, por: AD.porDesglose, since: p.desde, until: p.hasta }); AD.desglose[k] = r.ok ? r : { error: r.msg }; }
  catch(e){ AD.desglose[k] = { error: e.message }; }
  adRefresh();
}

/* ---------- conexión ---------- */
function adConectarHTML(primera){
  if(AD.pick){
    return `<div class="card s12 ad-card"><div class="ld-panel"><h3>¿Qué cuenta publicitaria conecto?</h3>
      ${AD.pick.map(c => `<button class="btn secondary sm" data-adcuenta="${esc(c.id)}" style="margin:0 8px 8px 0">${esc(c.name)} · ${esc(c.currency)}${c.activa ? "" : " (inactiva)"}</button>`).join("")}
      <div><button class="btn ghost sm" data-adcancel>Cancelar</button></div></div></div>`;
  }
  const leadsConectado = typeof CC !== "undefined" && CC.conn;
  const inner = `<div class="ld-panel">
      <h3>${primera ? "Conecta tu cuenta publicitaria de Meta" : "Conexión con Meta"}</h3>
      ${primera ? `<p class="muted" style="margin-top:0;font-size:13.5px">Verás aquí cada anuncio con su inversión, alcance, clics, costo por cliente y —lo que Meta no sabe— cuántas de esas personas cotizaron y cuántas terminaron en un trabajo ganado. Se actualiza solo cada hora.</p>` : ""}
      ${leadsConectado ? `<p style="font-size:13.5px">Tu página ya está conectada en el Centro de clientes: prueba primero con esa misma conexión.</p>
        <button class="btn sm" data-addoconnect="reusar" ${AD.busy ? "disabled" : ""}>${AD.busy === "connect" ? "Conectando…" : "Usar la conexión del Centro de clientes"}</button>
        <p class="muted" style="font-size:12px;margin:14px 0 6px">¿No funcionó? Pega un token nuevo:</p>` : ""}
      <ol class="lead-pasos">
        <li>En <b>developers.facebook.com</b> → <b>Explorador de la API Graph</b>, elige tu app.</li>
        <li>Pide los permisos <code>ads_read</code> y <code>ads_management</code> (si también quieres los formularios: <code>leads_retrieval</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_ads</code>, <code>business_management</code>) y genera el token.</li>
        <li>Pégalo aquí con el ID y la clave secreta de la app para que ANIMA lo cambie por uno de 60 días.</li>
      </ol>
      <label class="lead-f">Token de acceso<textarea id="adTok" rows="3" autocomplete="off" spellcheck="false" placeholder="EAAB…"></textarea></label>
      <div class="lead-f2">
        <label class="lead-f">ID de la app<input id="adAppId" autocomplete="off" inputmode="numeric" placeholder="Opcional si ya conectaste el Centro"></label>
        <label class="lead-f">Clave secreta de la app<input id="adAppSecret" type="password" autocomplete="off" placeholder="Opcional si ya conectaste el Centro"></label>
      </div>
      <p class="muted" style="font-size:12px;margin:6px 0 12px">El token viaja una vez a tu servidor de ANIMA y queda cifrado ahí. No se guarda en este dispositivo.</p>
      <button class="btn sm" data-addoconnect ${AD.busy ? "disabled" : ""}>${AD.busy === "connect" ? "Conectando…" : (AD.con ? "Reconectar" : "Conectar")}</button>
      ${!primera ? `<button class="btn ghost sm" data-adcancel>Cerrar</button><button class="btn ghost sm pd-del" data-addisconnect>Desconectar</button>` : ""}
    </div>`;
  return primera ? `<div class="card s12 ad-card">${inner}</div>` : inner;
}
async function adConectar(opts){
  const tok = opts.reusar ? "" : ((document.getElementById("adTok") || {}).value || "").trim();
  const app_id = ((document.getElementById("adAppId") || {}).value || "").trim();
  const app_secret = ((document.getElementById("adAppSecret") || {}).value || "").trim();
  const body = opts.cuenta ? { ...(AD.draft || {}), ad_account_id: opts.cuenta } : { token: tok || undefined, app_id: app_id || undefined, app_secret: app_secret || undefined };
  if(!opts.reusar && !opts.cuenta && !tok){ toast("Pega el token de acceso."); return; }
  AD.busy = "connect"; renderView();
  try{
    const r = await adFn({ action: "connect", ...body });
    if(r.elegir){ AD.pick = r.elegir; AD.draft = { token: body.token, app_id: body.app_id, app_secret: body.app_secret }; }
    else if(r.ok){ AD.pick = null; AD.draft = null; AD.connectOpen = false; toast("✓ Conectada: " + r.cuenta.name + (r.sync && r.sync.ok ? " · " + r.sync.msg : r.sync ? " · " + r.sync.msg : "")); }
    else toast(r.msg || "No se pudo conectar.");
  }catch(e){ toast("Meta: " + (e.message || e)); }
  AD.busy = ""; AD.con = undefined; await loadAds(true);
}

/* ---------- eventos ---------- */
function adAbrir(id){
  AD.open = id; renderView();
  const o = adObj(id); if(o) adPedirAlcanceNivel(o.level);
  adPedirDesglose(id);
  requestAnimationFrame(() => { const d = document.querySelector(".ad-drawer"); if(d) d.focus(); });
}
function adPedirAlcanceNivel(level){
  const p = adPeriodo(), k = p.desde + "|" + p.hasta + "|" + level;
  if(AD.reach[k]) return;
  AD.reach[k] = { cargando: true };
  adFn({ action: "alcance", since: p.desde, until: p.hasta, level })
    .then(r => { AD.reach[k] = r.ok ? Object.fromEntries((r.filas || []).map(x => [x.id, x])) : { error: r.msg }; adRefresh(); })
    .catch(e => { AD.reach[k] = { error: e.message }; });
}
function adCambioPeriodo(){ renderView(); adPedirAlcance(); if(AD.open) adAbrir(AD.open); }

document.addEventListener("click", e => {
  if(state.view !== "anuncios") return;
  const t = e.target;
  if(t.closest("[data-adsync]")){
    AD.busy = "sync"; renderView();
    adFn({ action: "sync" }).then(r => toast(r.ok ? "✓ " + r.msg : "Meta: " + r.msg)).catch(err => toast("No se pudo actualizar: " + err.message))
      .finally(() => { AD.busy = ""; loadAds(true); });
    return;
  }
  if(t.closest("[data-adconnect]")){ AD.connectOpen = !AD.connectOpen; AD.pick = null; renderView(); return; }
  if(t.closest("[data-adcancel]")){ AD.connectOpen = false; AD.pick = null; AD.draft = null; renderView(); return; }
  const dc = t.closest("[data-addoconnect]"); if(dc){ adConectar({ reusar: dc.dataset.addoconnect === "reusar" }); return; }
  const cu = t.closest("[data-adcuenta]"); if(cu){ adConectar({ cuenta: cu.dataset.adcuenta }); return; }
  if(t.closest("[data-addisconnect]")){
    if(!confirm("¿Desconectar la cuenta publicitaria? Se borran las métricas guardadas en ANIMA (en Meta no se toca nada).")) return;
    adFn({ action: "disconnect" }).then(() => { toast("Cuenta desconectada."); AD.connectOpen = false; AD.con = undefined; AD.objs = []; AD.daily = []; renderView(); })
      .catch(err => toast("No se pudo desconectar: " + err.message));
    return;
  }
  const nv = t.closest("[data-adnivel]"); if(nv){ AD.nivel = nv.dataset.adnivel; renderView(); adPedirAlcanceNivel(AD.nivel); return; }
  const od = t.closest("[data-adorden]"); if(od){ const k = od.dataset.adorden; if(AD.orden === k) AD.dir *= -1; else { AD.orden = k; AD.dir = k === "name" ? 1 : -1; } renderView(); return; }
  const lg = t.closest("[data-adlead]"); if(lg){ AD.open = null; if(typeof leadIrA === "function") leadIrA(lg.dataset.adlead); return; }
  const go_ = t.closest("[data-adgo]"); if(go_){ go(go_.dataset.adgo); return; }
  const ds = t.closest("[data-addesglose]"); if(ds){ AD.porDesglose = ds.dataset.addesglose; renderView(); if(AD.open) adPedirDesglose(AD.open); return; }
  if(t.closest("[data-adfx]")){
    const v = prompt("¿Cuántos " + ANIMA_CUR + " vale 1 " + adCur() + "?", String(adFx()));
    const n = Number(String(v || "").replace(/\./g, "").replace(",", "."));
    if(n > 0){ try{ localStorage.setItem("anima_ads_fx_" + adCur(), String(n)); }catch(err){} renderView(); }
    return;
  }
  if(t.closest("[data-adback]")){ AD.open = null; renderView(); return; }
  const op = t.closest("[data-adopen]"); if(op){ adAbrir(op.dataset.adopen); return; }
});
document.addEventListener("change", e => {
  if(state.view !== "anuncios") return;
  const el = e.target;
  if(el.matches("[data-adrango]")){ AD.rango = el.value; if(AD.rango === "rango" && !AD.desde){ const p = adPeriodo(); AD.desde = p.desde; AD.hasta = p.hasta; } adCambioPeriodo(); return; }
  if(el.matches("[data-adfecha]")){ AD[el.dataset.adfecha] = el.value; adCambioPeriodo(); return; }
  if(el.matches("[data-adcampana]")){ AD.campana = el.value; renderView(); return; }
  if(el.matches("[data-adactivos]")){ AD.soloActivos = el.checked; renderView(); }
});
document.addEventListener("keydown", e => {
  if(state.view !== "anuncios") return;
  if(e.key === "Escape" && AD.open){ AD.open = null; renderView(); return; }
  if(e.key === "Enter" && e.target.matches && e.target.matches("[data-adopen]")) adAbrir(e.target.dataset.adopen);
});
/* Tooltip de las barras: sigue al dedo o al mouse dentro del gráfico. */
function adTip(e){
  const b = e.target.closest && e.target.closest(".ad-bar"); const fig = e.target.closest && e.target.closest(".ad-chart");
  document.querySelectorAll(".ad-tip").forEach(x => { if(!fig || !fig.contains(x)) x.hidden = true; });
  if(!b || !fig) return;
  const tip = fig.querySelector(".ad-tip"); tip.textContent = b.dataset.tip; tip.hidden = false;
  const fr = fig.getBoundingClientRect(), br = b.getBoundingClientRect();
  tip.style.left = Math.min(Math.max(br.left - fr.left + br.width / 2, 50), fr.width - 50) + "px";
}
document.addEventListener("pointerover", adTip);
document.addEventListener("focusin", adTip);
