/* ===========================================================
   ANIMA STUDIO — Centro de clientes (Taller)
   -----------------------------------------------------------
   Las solicitudes que la gente deja en los formularios de los
   anuncios de Meta entran solas aquí (tabla client_leads,
   migración 0134). El Alma lee la solicitud, la confirma y abre
   WhatsApp con el mensaje ya escrito; al confirmar, la persona
   queda también como Vínculo.

   CÓMO LLEGAN
   - Edge Function `meta-leads`: el cron de la base la llama cada
     5 min, el botón «Traer ahora» también, y si se configura el
     webhook de Meta llega al instante.
   - STUDIO escucha los INSERT por Realtime: aviso, contador en el
     menú y la lista al día sin recargar.
   - Plan B sin conexión: importar el CSV que descarga el Centro de
     clientes potenciales de Meta (UTF-16 con tabulaciones).

   LO QUE NO SE GUARDA EN EL TELÉFONO
   `save()` vuelca todo `state` a localStorage. Por eso las
   solicitudes (datos personales de terceros) y la conexión viven
   en `CC`, en memoria, y el token que se pega al conectar va
   directo a la función y no se guarda en ninguna parte del
   navegador. En `state` solo quedan filtros de la pantalla.

   Se carga ANTES que anima.js: aquí solo se declaran funciones.
   =========================================================== */

const CC = { leads: undefined, conn: undefined, loading: false, busy: "", pick: null, draft: null, connectOpen: false, tplOpen: false,
             q: "", ciudad: "", origen: "", fecha: "", campana: "", desde: "", hasta: "",
             edit: false, nuevo: false, propios: new Set() };

/* Rango de días: se mide en días del calendario local, no en horas. */
const LEAD_FECHAS = [
  ["hoy", "Hoy"], ["ayer", "Ayer"], ["3", "Últimos 3 días"], ["7", "Últimos 7 días"], ["14", "Últimos 14 días"],
  ["30", "Últimos 30 días"], ["90", "Últimos 90 días"], ["rango", "Elegir fechas…"]
];
const LEAD_SIN_CAMPANA = "__sin";

/* Etapas como en el Centro de clientes potenciales de Meta (migración 0135). */
const LEAD_ETAPAS = [
  ["nuevo",      "Nueva",         "lb-nuevo"],
  ["revisado",   "Por responder", "lb-rev"],
  ["contactado", "Contactada",    "lb-con"],
  ["cotizado",   "Cotizada",      "lb-cot"],
  ["ganado",     "Ganada",        "lb-won"],
  ["descartado", "Descartada",    "lb-off"]
];
const LEAD_ESTADOS = Object.fromEntries(LEAD_ETAPAS.map(([k, t, cls], i) => [k, { t, cls, i }]));
/* Pestañas de arriba: filtran por etapa. «Activas» es todo menos lo descartado. */
const LEAD_TABS = [
  ["activas", "Activas", l => l.status !== "descartado"],
  ["nuevo", "Nuevas", l => l.status === "nuevo"],
  ["revisado", "Por responder", l => l.status === "revisado"],
  ["contactado", "Contactadas", l => l.status === "contactado"],
  ["cotizado", "Cotizadas", l => l.status === "cotizado"],
  ["ganado", "Ganadas", l => l.status === "ganado"],
  ["descartado", "Descartadas", l => l.status === "descartado"]
];
const LEAD_ORDEN = [
  ["recientes", "Más recientes"], ["antiguas", "Más antiguas"], ["nombre", "Nombre A–Z"],
  ["ciudad", "Ciudad A–Z"], ["etapa", "Etapa"]
];
/* Al pasar a una etapa se anota cuándo (si aún no estaba anotado). */
const LEAD_SELLO = { revisado:"reviewed_at", contactado:"contacted_at", cotizado:"quoted_at", ganado:"won_at" };

const WA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.44-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35M12.05 21.8h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.16-3.48-8.41"/></svg>';

const LEAD_TPL_DEFAULT =
  "Hola {nombre} 👋 Nicolás de PEW1 Murales por acá. Ya revisé tu solicitud.\n" +
  "Para prepararte una cotización detallada, ¿me mandas por aquí unas fotos de la superficie?";

/* ---------- datos ---------- */
function leadsList(){ return Array.isArray(CC.leads) ? CC.leads : []; }
function leadsPendientes(){ return leadsList().filter(l => l.status === "nuevo").length; }
function leadById(id){ return leadsList().find(l => String(l.id) === String(id)); }

async function loadLeads(){
  const a = me();
  if(CC.loading) return;
  if(!Cloud.enabled || !Cloud.client || !a || !a.live || !a.almaId){ CC.leads = []; CC.conn = null; return; }
  CC.loading = true;
  try{
    const [l, c] = await Promise.all([
      Cloud.client.from("client_leads").select("*").eq("alma_id", a.almaId).order("lead_created_at", { ascending:false }).limit(300),
      Cloud.client.from("meta_lead_connections").select("*").eq("alma_id", a.almaId).maybeSingle()
    ]);
    if(l.error) throw l.error;
    CC.leads = l.data || [];
    CC.conn = c.data || null;
    CC.almaId = a.almaId;
  }catch(e){ console.error("ANIMA · centro de clientes", e); CC.leads = null; }
  CC.loading = false;
  leadsRefresh();
  ensureLeadsRealtime();
  leadTraerVinculos();
}
/* Redibuja la pantalla, salvo que estés escribiendo en ella: Realtime puede
   traer una solicitud nueva a mitad de una nota y no hay que borrártela. */
function leadsRefresh(force){
  try{ renderNav(); }catch(e){}
  if(state.view !== "centro") return;
  const f = document.activeElement;
  if(!force && f && f.closest && f.closest("#view") && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)){ CC.pendiente = true; return; }
  renderView();
  if(CC.q) leadAplicarBusqueda();
}

/* En directo: cada INSERT de una solicitud mía aparece sola. */
function ensureLeadsRealtime(){
  const a = me();
  if(window.__leadsSub || !Cloud.client || !a || !a.almaId) return;
  try{
    window.__leadsSub = Cloud.client.channel("client-leads-live")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"client_leads", filter:"alma_id=eq."+a.almaId }, p => {
        const row = p.new; if(!row || row.alma_id !== me().almaId) return;
        if(!Array.isArray(CC.leads)){ loadLeads(); return; }
        if(CC.leads.some(x => x.id === row.id)) return;
        CC.leads.unshift(row);
        if(CC.propios.has(row.id)){ leadsRefresh(); return; }
        leadTraerVinculos();
        const quien = row.full_name || "alguien";
        toast("✦ Nueva solicitud de " + quien);
        leadAvisoDispositivo(quien, row);
        leadsRefresh();
      })
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"client_leads", filter:"alma_id=eq."+a.almaId }, p => {
        const row = p.new; if(!row || !Array.isArray(CC.leads)) return;
        const i = CC.leads.findIndex(x => x.id === row.id); if(i < 0) return;
        CC.leads[i] = { ...CC.leads[i], ...row };
        leadsRefresh(); leadTraerVinculos();
      })
      .subscribe();
  }catch(e){ window.__leadsSub = null; }
}
function leadAvisoDispositivo(quien, row){
  try{
    if(!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
    if(typeof AV !== "undefined" && AV.sub) return;     // ya llega por push: no avisar dos veces
    const n = new Notification("ANIMA · Nueva solicitud", { body: [quien, row.city].filter(Boolean).join(" · "), tag: "lead-"+row.id });
    n.onclick = () => { window.focus(); state.view = "centro"; CC_open(row.id); };
  }catch(e){}
}

/* La Edge Function, con la sesión del Alma. */
async function leadFn(body){
  const s = await Cloud.session();
  if(!s) throw new Error("Tu sesión expiró. Vuelve a entrar.");
  const r = await fetch(SB_URL + "/functions/v1/meta-leads", {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":"Bearer " + s.access_token, "apikey": SB_KEY },
    body: JSON.stringify({ ...body, alma_id: me().almaId })
  });
  const j = await r.json().catch(() => ({}));
  if(!r.ok && !j.elegir) throw new Error(j.msg || ("Error " + r.status));
  return j;
}

async function leadPatch(id, patch){
  const l = leadById(id); if(!l) return;
  Object.assign(l, patch);
  const { error } = await Cloud.client.from("client_leads").update(patch).eq("id", id);
  if(error) throw error;
}

/* ---------- mensaje de confirmación ---------- */
const leadTplKey = () => "anima_leadtpl_" + (me().almaId || me().id);
function leadTpl(){ try{ return localStorage.getItem(leadTplKey()) || LEAD_TPL_DEFAULT; }catch(e){ return LEAD_TPL_DEFAULT; } }
function leadTplSet(t){ try{ if(t && t.trim() && t.trim() !== LEAD_TPL_DEFAULT) localStorage.setItem(leadTplKey(), t); else localStorage.removeItem(leadTplKey()); }catch(e){} }
function leadPrimerNombre(n){ return String(n || "").trim().split(/\s+/)[0] || ""; }
/* Rellena la plantilla. Una línea cuyo dato no llegó se quita entera en vez
   de quedar "📐 " colgando; si la línea tiene más texto, solo se vacía el dato. */
function leadMensaje(l, tpl){
  const v = { nombre: leadPrimerNombre(l.full_name), ciudad: l.city || "", medidas: l.measures || "", idea: l.idea || "", fotos: l.photos_via || "" };
  return String(tpl || leadTpl()).split("\n").map(line => {
    const vars = line.match(/\{(\w+)\}/g) || [];
    const vacias = vars.filter(x => !v[x.slice(1, -1)]);
    let out = line.replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m);
    if(vacias.length && !out.replace(/[\s\p{Extended_Pictographic}\uFE0F:·,.\-«»"]/gu, "")) return null;
    return out.replace(/\s+([,.!?])/g, "$1").replace(/ {2,}/g, " ");
  }).filter(x => x !== null).join("\n").trim();
}
/* Número para wa.me: solo dígitos y con código de país (Chile por defecto). */
function leadWaNumero(p){
  let d = String(p || "").replace(/^p:/, "").replace(/\D/g, "");
  if(d.startsWith("00")) d = d.slice(2);
  if(d.length === 9 && d[0] === "9") d = "56" + d;
  else if(d.length === 8) d = "569" + d;
  return d;
}

/* ---------- filtros y orden ---------- */
function leadCiudad(l){ return String(l.city || "").split(/[,·]/)[0].trim(); }
/* Los «Chat automático» de Messenger/Instagram no traen nombre ni teléfono:
   la persona está en la conversación de Meta, no en un formulario. */
function leadEsChat(l){ return /chat/i.test(l.form_name || "") && !l.phone && !l.email; }
function leadNombre(l){ return l.full_name || (leadEsChat(l) ? "Chat de Messenger" : "Sin nombre"); }
const LEAD_INBOX = "https://business.facebook.com/latest/inbox/all";
/* Claves de nombre, teléfono y correo en cualquier idioma (la base ya las copia a sus columnas, migración 0142). */
const LEAD_CLAVE_CONTACTO = /^(full_name|first_name|last_name|nombre(_completo|_y_apellidos?|_de_pila)?|apellidos?|name|phone(_number)?|numero_de_(telefono|celular|whatsapp|movil)|telefono|celular|whatsapp|movil|e?_?mail|work_email|correo(_electronico)?)$/;
const leadClaveNorm = k => deburr(String(k || "")).replace(/[\s-]+/g, "_");
/* Los Vínculos que la base crea sola (0142) aún no están en a.clients si STUDIO ya estaba abierto. */
async function leadTraerVinculos(){
  const a = me(); if(!a || !a.live || !Cloud.client) return;
  const faltan = [...new Set(leadsList().map(l => l.client_id).filter(id => id && !(a.clients || []).some(c => c._id === id)))];
  if(!faltan.length) return;
  const { data } = await Cloud.client.from("clients").select("id,name,email,phone,notes,kind,role,created_at").in("id", faltan.slice(0, 200));
  for(const c of data || []) (a.clients || (a.clients = [])).push({ _id:c.id, name:c.name, email:c.email, phone:c.phone, notes:c.notes,
    kind:(String(c.kind || "cliente").toLowerCase() === "colaborador" ? "Colaborador" : "Cliente"), role:c.role || "", created:c.created_at });
  if(data && data.length) leadsRefresh();
}
function leadOrigen(l){ return l.source === "csv" ? "csv" : l.source === "manual" ? "manual" : (l.platform === "ig" ? "ig" : "fb"); }
const LEAD_ORIGEN_T = { ig:"Instagram", fb:"Facebook", csv:"CSV de Meta", manual:"Manual" };
function leadTexto(l){ return deburr([l.full_name, l.phone, l.email, l.city, l.idea, l.measures, l.campaign_name, l.ad_name].filter(Boolean).join(" ")); }
function leadCampana(l){ return String(l.campaign_name || "").trim(); }

/* [desde, hasta) en milisegundos para el filtro de fecha elegido. */
function leadVentana(){
  const f = CC.fecha; if(!f) return null;
  const d0 = (off) => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + off); return d.getTime(); };
  if(f === "hoy")  return [d0(0), Infinity];
  if(f === "ayer") return [d0(-1), d0(0)];
  if(f === "rango"){
    const dia = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
    return [CC.desde ? dia(CC.desde) : -Infinity, CC.hasta ? dia(CC.hasta) + 86400000 : Infinity];
  }
  return [d0(1 - Number(f)), Infinity];   // «últimos 7 días» = hoy y los 6 anteriores
}

function leadsFiltrados(){
  const tab = LEAD_TABS.find(t => t[0] === (state.leadTab || "activas")) || LEAD_TABS[0];
  let L = leadsList().filter(tab[2]);
  if(CC.ciudad) L = L.filter(l => deburr(leadCiudad(l)) === CC.ciudad);
  if(CC.origen) L = L.filter(l => leadOrigen(l) === CC.origen);
  if(CC.campana) L = L.filter(l => CC.campana === LEAD_SIN_CAMPANA ? !leadCampana(l) : leadCampana(l) === CC.campana);
  const w = leadVentana();
  if(w) L = L.filter(l => { const t = new Date(l.lead_created_at).getTime(); return t >= w[0] && t < w[1]; });
  const t = l => new Date(l.lead_created_at).getTime();
  const cmp = {
    recientes: (a, b) => t(b) - t(a),
    antiguas:  (a, b) => t(a) - t(b),
    nombre:    (a, b) => String(a.full_name || "~").localeCompare(String(b.full_name || "~"), "es"),
    ciudad:    (a, b) => (leadCiudad(a) || "~").localeCompare(leadCiudad(b) || "~", "es") || t(b) - t(a),
    etapa:     (a, b) => ((LEAD_ESTADOS[a.status] || {}).i - (LEAD_ESTADOS[b.status] || {}).i) || t(b) - t(a)
  }[state.leadOrden || "recientes"] || ((a, b) => t(b) - t(a));
  return L.slice().sort(cmp);
}
/* Buscar filtra en el sitio: el campo y el teclado no se mueven. */
function leadAplicarBusqueda(){
  const q = deburr(CC.q || "").split(" ").filter(Boolean); let n = 0;
  document.querySelectorAll(".ld-row[data-q]").forEach(el => { const ok = q.every(w => el.dataset.q.includes(w)); el.hidden = !ok; if(ok) n++; });
  const c = document.getElementById("ldCount"); if(c) c.textContent = n + (n === 1 ? " solicitud" : " solicitudes");
  const v = document.getElementById("ldNone"); if(v) v.hidden = n > 0;
}

/* Tiempo promedio entre que llega y se contacta: el dato que Meta pone arriba. */
function leadRespuestaMedia(){
  const xs = leadsList().filter(l => l.contacted_at).map(l => new Date(l.contacted_at) - new Date(l.lead_created_at)).filter(x => x > 0);
  if(!xs.length) return "";
  const m = xs.reduce((s, x) => s + x, 0) / xs.length / 60000;
  return m < 60 ? Math.round(m) + " min" : m < 1440 ? (m / 60).toFixed(1).replace(".0", "") + " h" : (m / 1440).toFixed(1).replace(".0", "") + " d";
}

function leadEtapaSelect(l, extra){
  const est = LEAD_ESTADOS[l.status] || LEAD_ESTADOS.nuevo;
  return `<select class="ld-stage ${est.cls} ${extra||""}" data-leadstage="${esc(l.id)}" aria-label="Etapa de ${esc(l.full_name || "la solicitud")}">` +
    LEAD_ETAPAS.map(([k, t]) => `<option value="${k}" ${k===l.status?"selected":""}>${t}</option>`).join("") + `</select>`;
}

/* ---------- vistas ---------- */
function vCentro(a){
  if(!a.live || !Cloud.enabled){
    return `<div class="grid"><div class="card s12"><p class="muted">El Centro de clientes necesita tu sesión en la nube de ANIMA.</p></div></div>`;
  }
  if(CC.almaId && CC.almaId !== a.almaId){ CC.leads = undefined; CC.conn = undefined; state.leadOpen = null; }
  if(CC.leads === undefined){ setTimeout(loadLeads, 0); return `<div class="grid"><div class="card s12 ld-cargando"><span class="ld-spin"></span>Cargando solicitudes…</div></div>`; }
  if(CC.leads === null){
    return `<div class="grid"><div class="card s12"><p class="muted">No se pudieron cargar las solicitudes.</p><button class="btn sm" data-leadreload>Reintentar</button></div></div>`;
  }
  const L = leadsList();
  const tabActual = state.leadTab || "activas";
  const tabs = LEAD_TABS.map(([k, t, f]) => { const n = L.filter(f).length;
    return `<button class="ld-tab ${tabActual===k?'on':''}" data-leadtab="${k}" ${tabActual===k?'aria-current="true"':''}>${t}<span>${n}</span></button>`; }).join("");

  const hoy0 = new Date(); hoy0.setHours(0,0,0,0);
  const nHoy = L.filter(l => new Date(l.lead_created_at) >= hoy0).length;
  const resp = leadRespuestaMedia();
  const resumen = [`${L.length} solicitud${L.length===1?"":"es"}`, nHoy ? `${nHoy} hoy` : "", resp ? `respondes en ${resp} en promedio` : ""].filter(Boolean).join(" · ");

  const ciudades = [...new Map(L.map(l => [deburr(leadCiudad(l)), leadCiudad(l)]).filter(([k]) => k)).entries()].sort((x, y) => x[1].localeCompare(y[1], "es"));
  const opt = (v, t, cur) => `<option value="${esc(v)}" ${v===cur?"selected":""}>${esc(t)}</option>`;
  const porCampana = new Map();
  L.forEach(l => { const k = leadCampana(l); if(k){ if(!porCampana.has(k)) porCampana.set(k, []); porCampana.get(k).push(l); } });
  const campanas = [...porCampana.entries()].sort((x, y) => y[1].length - x[1].length);
  const sinCampana = L.some(l => !leadCampana(l));
  const filtros = `<div class="ld-filters">
      <label class="ld-search"><span aria-hidden="true">⌕</span><input id="leadQ" type="search" placeholder="Buscar por nombre, teléfono o ciudad" value="${esc(CC.q)}" autocomplete="off" enterkeyhint="search"></label>
      <div class="ld-selects">
        <select class="ld-sel ${CC.ciudad?'on':''}" data-leadfiltro="ciudad" aria-label="Ciudad">${opt("", "Todas las ciudades", CC.ciudad)}${ciudades.map(([k, t]) => opt(k, t, CC.ciudad)).join("")}</select>
        <select class="ld-sel ${CC.origen?'on':''}" data-leadfiltro="origen" aria-label="Origen">${opt("", "Todo origen", CC.origen)}${Object.entries(LEAD_ORIGEN_T).map(([k, t]) => opt(k, t, CC.origen)).join("")}</select>
        ${campanas.length ? `<select class="ld-sel ${CC.campana?'on':''}" data-leadfiltro="campana" aria-label="Campaña de Meta">${opt("", "Todas las campañas", CC.campana)}${campanas.map(([k]) => opt(k, k, CC.campana)).join("")}${sinCampana ? opt(LEAD_SIN_CAMPANA, "Sin campaña", CC.campana) : ""}</select>` : ""}
        <select class="ld-sel ${CC.fecha?'on':''}" data-leadfiltro="fecha" aria-label="Días">${opt("", "Cualquier fecha", CC.fecha)}${LEAD_FECHAS.map(([k, t]) => opt(k, t, CC.fecha)).join("")}</select>
        ${CC.fecha === "rango" ? `<span class="ld-rango"><input type="date" data-leadrango="desde" value="${esc(CC.desde)}" aria-label="Desde" max="${esc(CC.hasta || "")}"><span>→</span><input type="date" data-leadrango="hasta" value="${esc(CC.hasta)}" aria-label="Hasta" min="${esc(CC.desde || "")}"></span>` : ""}
        <select class="ld-sel" data-leadorden aria-label="Ordenar">${LEAD_ORDEN.map(([k, t]) => opt(k, "↕ " + t, state.leadOrden || "recientes")).join("")}</select>
        ${(CC.ciudad||CC.origen||CC.fecha||CC.campana) ? `<button class="ld-clear" data-leadlimpiar>Quitar filtros</button>` : ""}
      </div>
    </div>`;
  /* Rendimiento por campaña: cuántas llegaron, cuántas se cotizaron y ganaron.
     Tocar una la deja como filtro. */
  const camps = campanas.length ? `<div class="ld-camps" aria-label="Campañas de Meta">${campanas.map(([k, xs]) => {
      const cot = xs.filter(l => ["cotizado","ganado"].includes(l.status)).length, won = xs.filter(l => l.status === "ganado").length;
      return `<button class="ld-camp ${CC.campana===k?'on':''}" data-leadcamp="${esc(k)}" title="Filtrar por esta campaña"><b>${esc(k)}</b><span>${xs.length} solicitud${xs.length===1?"":"es"}${cot ? " · " + cot + " cotizada" + (cot===1?"":"s") : ""}${won ? " · " + won + " ganada" + (won===1?"":"s") : ""}</span></button>`;
    }).join("")}</div>` : "";

  const lista = leadsFiltrados();
  if(CC.q) requestAnimationFrame(leadAplicarBusqueda);
  const filas = lista.map(l => {
    const est = LEAD_ESTADOS[l.status] || LEAD_ESTADOS.nuevo;
    const wa = leadWaNumero(l.phone);
    return `<div class="ld-row ${l.status==='nuevo'?'is-new':''} ${String(state.leadOpen)===String(l.id)?'is-open':''}" role="row" tabindex="0" data-leadopen="${esc(l.id)}" data-q="${esc(leadTexto(l))}">
      <div class="ld-c ld-name" role="cell"><span class="ld-av ${leadEsChat(l) ? "is-chat" : ""}">${leadEsChat(l) ? "💬" : initials(l.full_name || "?")}</span><div><b>${esc(leadNombre(l))}</b><small>${esc(l.phone || l.email || (leadEsChat(l) ? "Responde en el chat de Meta" : "Sin contacto"))}</small></div></div>
      <div class="ld-c ld-etapa" role="cell">${leadEtapaSelect(l)}</div>
      <div class="ld-c ld-city" role="cell" data-med="${l.measures ? " · " + esc(l.measures) : ""}">${esc(l.city || "—")}</div>
      <div class="ld-c ld-med" role="cell">${esc(l.measures || "—")}</div>
      <div class="ld-c ld-idea" role="cell">${esc(l.idea || "")}</div>
      <div class="ld-c ld-when" role="cell"><b>${esc(postDate(l.lead_created_at))}</b><small title="${esc(leadCampana(l))}">${esc(leadCampana(l) || LEAD_ORIGEN_T[leadOrigen(l)])}</small></div>
      <div class="ld-c ld-acts" role="cell">${wa ? `<button class="ld-wa" data-leadwago="${esc(l.id)}" title="Escribir a ${esc(leadPrimerNombre(l.full_name) || "este cliente")} por WhatsApp">${WA_SVG}<span>WhatsApp</span></button>` : leadEsChat(l) ? `<a class="ld-wa is-chat" href="${LEAD_INBOX}" target="_blank" rel="noopener" title="Responder en la bandeja de Meta">💬<span>Messenger</span></a>`
         : `<button class="ld-wa is-add" data-leadedit="${esc(l.id)}" title="Agregar el teléfono">${WA_SVG}<span>＋ Teléfono</span></button>`}</div>
    </div>`;
  }).join("");

  const vacio = !L.length
    ? `<div class="ld-empty"><b>Todavía no llega ninguna solicitud.</b><span>${CC.conn ? "Cuando alguien llene el formulario de tu anuncio aparecerá aquí, sola." : "Conecta tu página de Facebook o importa el CSV de Meta."}</span></div>`
    : (!lista.length ? `<div class="ld-empty"><b>Nada con estos filtros.</b><span>Prueba otra etapa o quita los filtros.</span></div>` : "");

  return `<div class="grid ld">
    <div class="card s12 ld-card">
      <div class="ld-head">
        <div class="ld-title"><h2>Centro de clientes</h2><p>${esc(resumen)}</p></div>
        <div class="ld-tools">
          <button class="btn sm" data-leadnuevo>＋ Nuevo cliente</button>
          ${CC.conn ? `<button class="btn ghost sm" data-leadsync ${CC.busy?'disabled':''}>${CC.busy==="sync"?"Trayendo…":"↻ Traer ahora"}</button>` : `<button class="btn sm" data-leadconnect>Conectar Meta</button>`}
          <button class="btn ghost sm" data-leadtpl>✎ Mensaje</button>
          <details class="ld-more"><summary class="btn ghost sm" aria-label="Más opciones">⋯</summary><div class="ld-menu">
            <button data-leadcsv>⇪ Importar CSV de Meta</button>
            <button data-leadconnect>⚙ Conexión con Meta</button>
            <button data-avisosopen>🔔 Avisos al teléfono</button>
          </div></details>
        </div>
      </div>
      ${leadConexionHTML()}
      <nav class="ld-tabs" aria-label="Etapas">${tabs}</nav>
      ${filtros}
      ${camps}
      ${CC.connectOpen ? leadConectarHTML() : ""}
      ${CC.tplOpen ? leadPlantillaHTML() : ""}
      ${lista.length ? `<div class="ld-table" role="table" aria-label="Solicitudes">
        <div class="ld-row ld-th" role="row"><span role="columnheader">Nombre</span><span role="columnheader">Etapa</span><span role="columnheader">Ubicación</span><span role="columnheader">Medidas</span><span role="columnheader">Idea</span><span role="columnheader">Llegó</span><span role="columnheader"></span></div>
        ${filas}</div>
        <div class="ld-foot"><span id="ldCount">${lista.length} solicitud${lista.length===1?"":"es"}</span><span id="ldNone" class="muted" hidden>· ninguna coincide con la búsqueda</span></div>` : vacio}
    </div>
  </div>
  ${CC.nuevo ? vLeadPanel(a, null) : (state.leadOpen && leadById(state.leadOpen) ? vLeadPanel(a, leadById(state.leadOpen)) : "")}
  <input type="file" id="leadCsv" accept=".csv,.tsv,text/csv,text/plain" hidden>`;
}

function leadConexionHTML(){
  const c = CC.conn;
  if(!c) return `<p class="ld-conn"><span class="ld-dot off"></span>Meta sin conectar · los formularios llegarán solos cuando conectes tu página.</p>`;
  const mal = c.last_sync_ok === false;
  const cuando = c.last_sync_at ? "hace " + timeAgo(c.last_sync_at) : "aún sin sincronizar";
  return `<p class="ld-conn ${mal?'is-bad':''}"><span class="ld-dot"></span>Meta · <b>${esc(c.page_name || c.page_id)}</b> · ${esc(mal ? "Error: " + (c.last_sync_msg || "") : (c.last_sync_msg || "Conectada"))} · ${esc(cuando)}</p>`;
}

function leadConectarHTML(){
  if(CC.pick){
    return `<div class="ld-panel"><h3>¿Qué página conecto?</h3>
      ${CC.pick.map(p => `<button class="btn secondary sm" data-leadpage="${esc(p.id)}" style="margin:0 8px 8px 0">${esc(p.name)}</button>`).join("")}
      <div><button class="btn ghost sm" data-leadcancel>Cancelar</button></div></div>`;
  }
  const c = CC.conn;
  return `<div class="ld-panel">
    <h3>${c ? "Conexión con Meta" : "Conectar tu página de Facebook"}</h3>
    <ol class="lead-pasos">
      <li>En <b>developers.facebook.com</b> abre tu app (tipo <b>Negocios</b>).</li>
      <li>En el <b>Explorador de la API Graph</b> elige la app y pide <code>leads_retrieval</code>, <code>ads_management</code>, <code>pages_manage_ads</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_metadata</code> y <code>business_management</code>. Genera el token y, en la ventana de Facebook, marca tu página.</li>
      <li>Pega aquí el token, con el <b>ID</b> y la <b>clave secreta</b> de la app (Configuración → Básica): ANIMA lo cambia por uno que no vence.</li>
    </ol>
    <label class="lead-f">Token de acceso<textarea id="leadTok" rows="3" autocomplete="off" spellcheck="false" placeholder="EAAB…"></textarea></label>
    <div class="lead-f2">
      <label class="lead-f">ID de la app<input id="leadAppId" autocomplete="off" inputmode="numeric" placeholder="1234567890"></label>
      <label class="lead-f">Clave secreta de la app<input id="leadAppSecret" type="password" autocomplete="off" placeholder="••••••••"></label>
    </div>
    <p class="muted" style="font-size:12px;margin:6px 0 12px">El token viaja una vez a tu servidor de ANIMA y queda cifrado ahí. No se guarda en este dispositivo.</p>
    <button class="btn sm" data-leaddoconnect ${CC.busy?'disabled':''}>${CC.busy==="connect"?"Conectando…":(c?"Reconectar":"Conectar")}</button>
    <button class="btn ghost sm" data-leadcancel>Cancelar</button>
    ${c ? `<button class="btn ghost sm" data-leadwebhook>Datos del webhook</button><button class="btn ghost sm pd-del" data-leaddisconnect>Desconectar</button>` : ""}
    <div id="leadWebhookBox"></div>
  </div>`;
}

function leadPlantillaHTML(){
  return `<div class="ld-panel">
    <h3>Mensaje de confirmación</h3>
    <p class="muted" style="font-size:12.5px;margin-top:0">Es el que se abre en WhatsApp. Puedes escribir <code>{nombre}</code>, <code>{ciudad}</code>, <code>{medidas}</code>, <code>{idea}</code> y <code>{fotos}</code>; si la persona no dejó ese dato, la línea se omite.</p>
    <textarea id="leadTplText" rows="7" class="lead-msg">${esc(leadTpl())}</textarea>
    <div style="margin-top:10px"><button class="btn sm" data-leadtplsave>Guardar</button> <button class="btn ghost sm" data-leadtplreset>Volver al original</button> <button class="btn ghost sm" data-leadcancel>Cerrar</button></div>
  </div>`;
}

/* Formulario para editar (o crear a mano) nombre, contacto y datos del muro. */
const LEAD_CAMPOS = [
  ["full_name", "Nombre", "text", "Nombre y apellido", "name"],
  ["phone", "WhatsApp / teléfono", "tel", "+56 9 1234 5678", "tel"],
  ["email", "Correo", "email", "nombre@correo.cl", "email"],
  ["city", "Ubicación del muro", "text", "Ciudad, comuna", "off"],
  ["measures", "Medidas", "text", "Ej: 4 × 2,5 m", "off"],
  ["idea", "Idea del diseño", "textarea", "Qué quiere pintar", "off"],
  ["campaign_name", "Campaña / origen", "text", "Ej: Murales Oct 2026, Instagram, recomendado", "off"]
];
function leadFormHTML(l){
  const v = l || {};
  const camps = [...new Set(leadsList().map(leadCampana).filter(Boolean))];
  return `<div class="ld-dsec ld-form">
    ${LEAD_CAMPOS.map(([k, t, tipo, ph, ac]) => tipo === "textarea"
      ? `<label class="lead-f">${t}<textarea id="ldf_${k}" rows="3" placeholder="${esc(ph)}">${esc(v[k] || "")}</textarea></label>`
      : `<label class="lead-f">${t}<input id="ldf_${k}" type="${tipo}" value="${esc(v[k] || "")}" placeholder="${esc(ph)}" autocomplete="${ac}" ${k==="campaign_name"?'list="ldCampList"':""} ${tipo==="tel"?'inputmode="tel"':""}></label>`).join("")}
    <datalist id="ldCampList">${camps.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    ${l && l.client_id ? `<p class="muted" style="font-size:12px;margin:2px 0 10px">El nombre y el contacto también se actualizan en su Vínculo${l.project_id ? " y en el proyecto" : ""}.</p>` : ""}
    <div class="ld-form-acts"><button class="btn sm" data-leadsave="${esc(v.id || "")}" ${CC.busy==="save"?"disabled":""}>${CC.busy==="save" ? "Guardando…" : (l ? "Guardar cambios" : "Crear cliente")}</button>
    <button class="btn ghost sm" data-leadeditcancel>Cancelar</button></div>
  </div>`;
}

/* Lo que la solicitud ya tiene en el Taller: Vínculo, Proyecto y Cotización. */
function leadTallerHTML(a, l){
  const cli = leadVinculo(a, l), pr = leadProyecto(a, l), q = leadCotizacion(l);
  const fila = (ico, t, v, attr) => `<button class="ld-link" ${attr}><span class="ld-link-i" aria-hidden="true">${ico}</span><span class="ld-link-t"><small>${t}</small><b>${v}</b></span><span aria-hidden="true">›</span></button>`;
  return `<div class="ld-dsec"><span class="ld-lbl">En el Taller</span>
    <div class="ld-links">
      ${cli ? fila("◉", "Vínculo", esc(cli.c.name), `data-leadgovin="${cli.i}"`) : ""}
      ${pr ? fila("▣", "Proyecto · " + esc(flowOf(pr.p.st)), esc(pr.p.t) + (pr.p.budget ? " · " + esc(money(pr.p.budget)) : ""), `data-leadgoproj="${pr.i}"`) : ""}
      ${q ? fila("✎", "Cotización", esc(q.title || "Cotización") + (q.total != null ? " · " + esc(money(q.total)) : ""), `data-leadgoquote="${esc(q.id)}"`) : ""}
    </div>
    <div class="ld-taller-acts">
      <button class="btn sm" data-leadcotizar="${esc(l.id)}" ${CC.busy==="cotizar"?"disabled":""}>${CC.busy==="cotizar" ? "Preparando…" : (q ? "✎ Abrir cotización" : "✎ Cotizar")}</button>
      ${!pr ? `<button class="btn ghost sm" data-leadproyecto="${esc(l.id)}" ${CC.busy?"disabled":""}>▣ Crear proyecto</button>` : ""}
      ${!cli ? `<button class="btn ghost sm" data-leadvinculo="${esc(l.id)}" ${CC.busy?"disabled":""}>◉ Guardar en Vínculos</button>` : ""}
    </div>
    <small class="muted">${pr ? "Cuando el proyecto pase a «Aprobado», la solicitud queda como ganada." : "Cotizar crea el Vínculo y el proyecto en «Cotizando», con los datos del muro."}</small>
  </div>`;
}

/* Detalle en un panel lateral (hoja completa en el teléfono): la lista
   queda detrás, como en Meta. Con l = null es el alta manual. */
function vLeadPanel(a, l){
  const nuevo = !l;
  const editando = nuevo || CC.edit;
  const cab = `<header class="ld-dh">
      <span class="ld-av lg">${initials((l && l.full_name) || "+")}</span>
      <div class="ld-dh-t"><h3>${nuevo ? "Nuevo cliente" : esc(leadNombre(l))}</h3><small>${nuevo ? "Alguien que te escribió por otro lado: Instagram, WhatsApp, una recomendación…" : esc([l.phone, l.email].filter(Boolean).join(" · ") || "Sin contacto")}</small></div>
      ${!nuevo && !CC.edit ? `<button class="ld-x ld-ed" data-leadedit="${esc(l.id)}" aria-label="Editar datos" title="Editar nombre y contacto">✎</button>` : ""}
      <button class="ld-x" data-leadback aria-label="Cerrar">✕</button>
    </header>`;
  const marco = inner => `<div class="ld-scrim ${CC.anim?'entra':''}" data-leadback></div>
  <aside class="ld-drawer ${CC.anim?'entra':''}" tabindex="-1" role="dialog" aria-modal="true" aria-label="${nuevo ? "Nuevo cliente" : "Solicitud de " + esc(l.full_name || "cliente")}">${cab}${inner}</aside>`;
  if(editando) return marco(leadFormHTML(l));

  const wa = leadWaNumero(l.phone);
  const dato = (k, v) => v ? `<div class="ld-kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>` : "";
  const extra = (l.answers || []).filter(x => !LEAD_CLAVE_CONTACTO.test(leadClaveNorm(x.key)) && !LEAD_CLAVE_CONTACTO.test(leadClaveNorm(x.label)))
    .map(x => `<div class="ld-kv"><span>${esc(x.label || x.key)}</span><b>${esc(x.value || "—")}</b></div>`).join("");
  const hito = (t, f) => f ? `<li><b>${esc(t)}</b><span>${esc(postDate(f))}</span></li>` : "";
  const puedeConfirmar = l.status === "nuevo" || l.status === "revisado";
  return marco(`
    <div class="ld-quick">
      ${wa ? `<button class="ld-wa big" data-leadwa="${esc(l.id)}">${WA_SVG}<span>${puedeConfirmar ? "Confirmar por WhatsApp" : "Abrir WhatsApp"}</span></button>`
           : `<button class="ld-wa big is-add" data-leadedit="${esc(l.id)}">${WA_SVG}<span>Agregar WhatsApp</span></button>`}
      ${l.phone ? `<a class="btn ghost sm" href="tel:${esc(l.phone)}">☎ Llamar</a>` : ""}
      ${l.email ? `<a class="btn ghost sm" href="mailto:${esc(l.email)}">✉ Correo</a>` : ""}
    </div>
    <div class="ld-dsec"><span class="ld-lbl">Etapa</span>${leadEtapaSelect(l, "wide")}</div>
    ${leadTallerHTML(a, l)}
    <div class="ld-dsec"><span class="ld-lbl">El muro <button class="ld-mini" data-leadedit="${esc(l.id)}">✎ Editar</button></span>
      ${dato("Ubicación", l.city)}${dato("Medidas", l.measures)}${dato("Idea del diseño", l.idea)}${dato("Fotos", l.photos_via)}
      ${!(l.city||l.measures||l.idea||l.photos_via) ? `<p class="muted" style="margin:4px 0 0;font-size:13px">No dejó datos del muro.</p>` : ""}
    </div>
    <div class="ld-dsec"><span class="ld-lbl">Mensaje de WhatsApp</span>
      <textarea id="leadMsg" rows="7" class="lead-msg">${esc(!puedeConfirmar && l.message ? l.message : leadMensaje(l))}</textarea>
      <small class="muted">Se abre en WhatsApp para que lo envíes tú. ${puedeConfirmar ? "Al confirmar, pasa a «Contactada» y queda en Vínculos." : ""}</small>
    </div>
    <div class="ld-dsec"><span class="ld-lbl">Notas internas</span>
      <textarea id="leadNotes" rows="3" class="lead-msg" data-leadnotes="${esc(l.id)}" placeholder="Solo las ves tú: presupuesto, fechas, lo que conversaron…">${esc(l.notes || "")}</textarea>
    </div>
    ${extra ? `<div class="ld-dsec"><span class="ld-lbl">Respuestas del formulario</span>${extra}</div>` : ""}
    <div class="ld-dsec"><span class="ld-lbl">Historial</span><ul class="ld-time">
      ${hito("Llegó", l.lead_created_at)}${hito("La leíste", l.reviewed_at)}${hito("Contactada", l.contacted_at)}${hito("Cotizada", l.quoted_at)}${hito("Ganada", l.won_at)}
    </ul>
      <p class="muted" style="font-size:12px;margin:8px 0 0">${esc([LEAD_ORIGEN_T[leadOrigen(l)], l.campaign_name, l.ad_name].filter(Boolean).join(" · "))}</p>
    </div>`);
}

/* ---------- acciones ---------- */
/* Abrir una solicitud nueva la da por leída (el contador baja al tiro). */
function CC_open(id){
  const l = leadById(id); if(!l) return;
  if(l.status === "nuevo"){
    leadPatch(id, { status:"revisado", reviewed_at:new Date().toISOString() }).catch(e => console.error(e));
  }
  CC.edit = false; CC.nuevo = false;
  CC.anim = true; state.leadOpen = id; leadsRefresh(true); CC.anim = false;
  requestAnimationFrame(() => { const d = document.querySelector(".ld-drawer"); if(d) d.focus && d.focus(); });
}
function CC_close(){
  const d = document.querySelector(".ld-drawer"), s = document.querySelector(".ld-scrim");
  const cerrar = () => { state.leadOpen = null; CC.edit = false; CC.nuevo = false; leadsRefresh(true); };
  if(!d || matchMedia("(prefers-reduced-motion: reduce)").matches){ cerrar(); return; }
  d.classList.add("sale"); if(s) s.classList.add("sale");
  setTimeout(cerrar, 180);
}

async function leadCambiarEtapa(id, st){
  const l = leadById(id); if(!l || !LEAD_ESTADOS[st]) return;
  const patch = { status: st }, sello = LEAD_SELLO[st];
  if(sello && !l[sello]) patch[sello] = new Date().toISOString();
  try{
    await leadPatch(id, patch);
    /* El Taller sigue a la etapa: cotizada abre su proyecto en «Cotizando»,
       ganada lo pasa a «Aprobado» si aún esperaba. */
    if(st === "cotizado" && !leadProyecto(me(), l)){ await leadAProyecto(l); toast("✓ Cotizada · proyecto creado en el Taller"); }
    if(st === "ganado"){
      const pr = leadProyecto(me(), l) || (await leadAProyecto(l), leadProyecto(me(), l));
      if(pr && flowOf(pr.p.st) === "Cotizando"){ await setProjectStatus(pr.i, "Aprobado"); toast("✓ Ganada · el proyecto pasó a «Aprobado»"); }
    }
    leadsRefresh(true);
  }
  catch(err){ toast("No se pudo guardar: " + (err.message || err)); }
}

/* WhatsApp desde la fila: si la solicitud aún espera respuesta abre el
   mensaje de confirmación y la marca como contactada; si ya se conversó,
   solo abre el chat. */
async function leadWhatsappRapido(id){
  const l = leadById(id); if(!l) return;
  const num = leadWaNumero(l.phone);
  if(!num){ toast("Esta solicitud no trae un teléfono válido."); return; }
  if(l.status === "nuevo" || l.status === "revisado"){ leadConfirmar(id, leadMensaje(l)); return; }
  window.open("https://wa.me/" + num, "_blank", "noopener");
}

/* Confirmar: abre WhatsApp (en el mismo toque, para que el navegador no lo
   bloquee), marca la solicitud como contactada y deja a la persona en Vínculos. */
async function leadConfirmar(id, msgDado){
  const l = leadById(id); if(!l) return;
  const msg = msgDado || (document.getElementById("leadMsg") || {}).value || leadMensaje(l);
  const num = leadWaNumero(l.phone);
  if(!num){ toast("Esta solicitud no trae un teléfono válido."); return; }
  window.open("https://wa.me/" + num + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
  try{
    const client_id = await leadAVinculo(l);
    // Confirmar no retrocede una solicitud que ya iba más adelante (cotizada, ganada).
    const patch = { message:msg, client_id: client_id || l.client_id || null };
    if(l.status === "nuevo" || l.status === "revisado"){ patch.status = "contactado"; if(!l.contacted_at) patch.contacted_at = new Date().toISOString(); }
    await leadPatch(id, patch);
    toast("✓ " + (l.full_name || "Solicitud") + (patch.status ? " quedó como contactada" : ": WhatsApp abierto"));
    leadsRefresh(true);
  }catch(e){ console.error(e); toast("Se abrió WhatsApp, pero no se pudo guardar el estado: " + (e.message || e)); }
}

/* La persona pasa a Vínculos (si ya estaba, por teléfono o correo, se reusa). */
async function leadAVinculo(l){
  const a = me();
  if(l.client_id) return l.client_id;
  const tel = leadWaNumero(l.phone), mail = String(l.email || "").toLowerCase();
  const ya = (a.clients || []).find(c => (tel && leadWaNumero(c.phone) === tel) || (mail && String(c.email || "").toLowerCase() === mail));
  if(ya) return ya._id;
  const notas = ["Solicitud desde anuncio de Meta", l.city && "Muro: " + l.city, l.measures && "Medidas: " + l.measures, l.idea && "Idea: " + l.idea].filter(Boolean).join("\n");
  const row = await Cloud.insertRow("clients", { alma_id:a.almaId, name:l.full_name || "Cliente sin nombre", phone:l.phone || null, email:l.email || null, notes:notas, kind:"cliente" });
  (a.clients || (a.clients = [])).unshift({ _id:row.id, name:row.name, email:row.email, phone:row.phone, notes:row.notes, kind:"Cliente", role:"", created:row.created_at });
  return row.id;
}

/* ---------- conexión con el Taller ---------- */
function leadVinculo(a, l){
  const L = a.clients || [];
  let i = l.client_id ? L.findIndex(c => c._id === l.client_id) : -1;
  if(i < 0){ const tel = leadWaNumero(l.phone); if(tel) i = L.findIndex(c => leadWaNumero(c.phone) === tel); }
  return i >= 0 ? { c: L[i], i } : null;
}
function leadProyecto(a, l){
  if(!l.project_id) return null;
  const i = (a.projects || []).findIndex(p => p._id === l.project_id);
  return i >= 0 ? { p: a.projects[i], i } : null;
}
function leadCotizacion(l){
  const Q = state.cloudQuotes || [];
  return (l.quote_id && Q.find(q => q.id === l.quote_id)) || (l.project_id && Q.find(q => q.project_id === l.project_id)) || null;
}
/* Desde Vínculos y Proyectos: la solicitud que los originó. */
function leadDeVinculo(c){ return c && leadsList().find(l => (c._id && l.client_id === c._id) || (c.phone && leadWaNumero(l.phone) && leadWaNumero(l.phone) === leadWaNumero(c.phone))) || null; }
function leadDeProyecto(p){ return p && p._id && leadsList().find(l => l.project_id === p._id) || null; }

/* Botón de WhatsApp reutilizable (Vínculos, Proyectos). */
function waBoton(phone, nombre, cls){
  const n = leadWaNumero(phone); if(!n) return "";
  return `<a class="ld-wa ${cls||""}" href="https://wa.me/${n}" target="_blank" rel="noopener" title="Escribir a ${esc(leadPrimerNombre(nombre) || "este contacto")} por WhatsApp">${WA_SVG}<span>WhatsApp</span></a>`;
}
/* Línea «Llegó por…» con enlace a la solicitud, para las fichas del Taller. */
function leadOrigenHTML(l){
  if(!l) return "";
  const est = LEAD_ESTADOS[l.status] || LEAD_ESTADOS.nuevo;
  return `<button class="ld-origen" data-leadgo="${esc(l.id)}"><span class="ld-origen-i" aria-hidden="true">✦</span><span><small>Llegó por el Centro de clientes · ${esc(postDate(l.lead_created_at))}</small><b>${esc(leadCampana(l) || LEAD_ORIGEN_T[leadOrigen(l)])}</b></span><span class="lb ${est.cls}">${esc(est.t)}</span></button>`;
}
function leadIrA(id){
  state.leadOpen = null; CC.edit = CC.nuevo = false;
  go("centro"); setTimeout(() => CC_open(id), 0);
}

/* Crea la Unidad de Trabajo de la solicitud (en «Cotizando») y la enlaza. */
async function leadAProyecto(l){
  const a = me();
  const ya = leadProyecto(a, l); if(ya) return ya.p._id;
  const client_id = await leadAVinculo(l);
  const cli = (a.clients || []).find(c => c._id === client_id);
  const nombre = (cli && cli.name) || l.full_name || "Cliente";
  const desc = [l.measures && "Medidas: " + l.measures, l.idea && "Idea: " + l.idea, l.city && "Ubicación: " + l.city,
                leadCampana(l) && "Origen: " + leadCampana(l)].filter(Boolean).join("\n");
  const hoy = new Date().toISOString().slice(0, 10);
  const v = { t: nombre + (leadCiudad(l) ? " · " + leadCiudad(l) : ""), client: nombre, st: "Cotizando", pct: 0, paid: 0, desc,
              city: leadCiudad(l) || null, context: "Personal", owner: "Mi Taller", responsible: a.name || "" };
  let row;
  try{ row = await Cloud.insertRow("projects", { ...EDITORS.proyecto.toRow(v), client_id, history: [{ st: "Cotizando", at: hoy }], alma_id: a.almaId }); }
  catch(e){ row = await insertRecordRow(EDITORS.proyecto, v, a.almaId); }
  (a.projects || (a.projects = [])).unshift({ _id: row.id, t: v.t, st: "Cotizando", pct: 0, client: nombre, client_id, desc, city: v.city,
    context: "Personal", owner: "Mi Taller", responsible: v.responsible, created: row.created_at, paid: 0, abonos: [], checklist: [], hist: [{ st: "Cotizando", at: hoy }] });
  const patch = { project_id: row.id, client_id };
  if(LEAD_ESTADOS[l.status].i < LEAD_ESTADOS.cotizado.i){ patch.status = "cotizado"; if(!l.quoted_at) patch.quoted_at = new Date().toISOString(); }
  await leadPatch(l.id, patch);
  try{ save(); }catch(e){}
  return row.id;
}

/* Cotizar: Vínculo + proyecto listos y el Cotizador abierto con todo puesto. */
async function leadCotizar(id){
  const l = leadById(id); if(!l) return;
  const q = leadCotizacion(l);
  CC.busy = "cotizar"; leadsRefresh(true);
  try{
    const project_id = await leadAProyecto(l);
    const a = me(), cli = (a.clients || []).find(c => c._id === l.client_id);
    state.leadOpen = null; CC.busy = "";
    go("cotizador");
    if(q){ qLoad(q.id); quoteDraft.lead_id = l.id; return; }
    quoteDraft = blankQuote();
    Object.assign(quoteDraft, {
      client: (cli && cli.name) || l.full_name || "", client_id: l.client_id || null, project_id, lead_id: l.id,
      title: "Cotización · " + ((cli && cli.name) || l.full_name || "cliente"),
      notes: [l.city && "Ubicación: " + l.city, l.measures && "Medidas: " + l.measures, l.idea && "Idea: " + l.idea].filter(Boolean).join("\n")
    });
    state.cotMode = "editor"; state.cotTab = "contenido";
    renderAll();
  }catch(e){ CC.busy = ""; toast("No se pudo preparar la cotización: " + (e.message || e)); leadsRefresh(true); }
}

/* Lo llama el Cotizador al guardar: la solicitud de ese cliente queda
   cotizada y enlazada a la cotización y al proyecto. */
async function leadTrasCotizar(d, total){
  if(!d || !d.id) return;
  /* Mientras el proyecto está en «Cotizando», su valor total es el de la cotización. */
  const a = me(), pi = d.project_id ? (a.projects || []).findIndex(p => p._id === d.project_id) : -1;
  if(pi >= 0 && total > 0 && flowOf(a.projects[pi].st) === "Cotizando" && +a.projects[pi].budget !== total){
    a.projects[pi].budget = total; await patchProject(a.projects[pi], { budget: total });
  }
  if(!Array.isArray(CC.leads)) return;
  const l = (d.lead_id && leadById(d.lead_id)) || (d.project_id && leadsList().find(x => x.project_id === d.project_id))
         || (d.client_id && leadsList().find(x => x.client_id === d.client_id && x.status !== "descartado"));
  if(!l) return;
  const patch = {};
  if(l.quote_id !== d.id) patch.quote_id = d.id;
  if(d.project_id && !l.project_id) patch.project_id = d.project_id;
  if(d.client_id && !l.client_id) patch.client_id = d.client_id;
  if(LEAD_ESTADOS[l.status].i < LEAD_ESTADOS.cotizado.i){ patch.status = "cotizado"; if(!l.quoted_at) patch.quoted_at = new Date().toISOString(); }
  if(!Object.keys(patch).length) return;
  try{ await leadPatch(l.id, patch); try{ renderNav(); }catch(e){} }catch(e){ console.error("ANIMA · lead tras cotizar", e); }
}
/* Lo llama setProjectStatus: si el proyecto se aprueba, la solicitud se gana. */
async function leadTrasProyecto(p){
  const l = leadDeProyecto(p); if(!l) return;
  if(flowOf(p.st) === "Cotizando" || l.status === "ganado" || l.status === "descartado") return;
  try{ await leadPatch(l.id, { status: "ganado", won_at: l.won_at || new Date().toISOString() }); try{ renderNav(); }catch(e){} }
  catch(e){ console.error("ANIMA · lead tras proyecto", e); }
}

/* Guardar la edición (o el alta manual). Nombre y contacto se copian al
   Vínculo y al proyecto enlazados, para que no queden dos versiones. */
async function leadGuardar(id){
  const a = me(), g = k => ((document.getElementById("ldf_" + k) || {}).value || "").trim();
  const f = {}; LEAD_CAMPOS.forEach(([k]) => f[k] = g(k) || null);
  if(!f.full_name && !f.phone && !f.email){ toast("Escribe al menos un nombre o un contacto."); return; }
  if(f.phone && leadWaNumero(f.phone).length < 10){ toast("Ese teléfono no parece válido para WhatsApp (ej: +56 9 1234 5678)."); return; }
  CC.busy = "save"; leadsRefresh(true);
  try{
    if(!id){
      const nid = crypto.randomUUID(); CC.propios.add(nid);
      const row = { id: nid, alma_id: a.almaId, source: "manual", status: "revisado", reviewed_at: new Date().toISOString(), ...f };
      const { data, error } = await Cloud.client.from("client_leads").insert(row).select().single();
      if(error) throw error;
      if(!leadById(nid)) (CC.leads || (CC.leads = [])).unshift(data);
      CC.nuevo = false; state.leadOpen = nid;
      toast("✓ " + (f.full_name || "Cliente") + " quedó en el Centro de clientes");
    } else {
      const l = leadById(id); if(!l) return;
      const antes = l.full_name;
      await leadPatch(id, f);
      const cli = leadVinculo(a, l);
      if(cli && l.client_id){
        const cp = { name: f.full_name || cli.c.name, phone: f.phone, email: f.email };
        await Cloud.updateRow("clients", cli.c._id, cp);
        Object.assign(cli.c, cp);
      }
      const pr = leadProyecto(a, l);
      if(pr && f.full_name && f.full_name !== antes && pr.p.client === antes){
        pr.p.client = f.full_name; await patchProject(pr.p, { client: f.full_name });
      }
      try{ save(); }catch(e){}
      toast("✓ Datos guardados" + (cli && l.client_id ? " · también en Vínculos" : ""));
    }
    CC.edit = false;
  }catch(e){ toast("No se pudo guardar: " + (e.message || e)); }
  CC.busy = ""; leadsRefresh(true);
}

async function leadSync(){
  CC.busy = "sync"; renderView();
  try{ const r = await leadFn({ action:"sync" }); toast(r.ok ? (r.msg || "Al día") : ("Meta: " + (r.msg || "no respondió"))); }
  catch(e){ toast("No se pudo traer: " + (e.message || e)); }
  CC.busy = ""; await loadLeads();
}

async function leadConectar(pageId){
  const tok = pageId ? CC.draft && CC.draft.token : ((document.getElementById("leadTok") || {}).value || "").trim();
  const app_id = pageId ? CC.draft && CC.draft.app_id : ((document.getElementById("leadAppId") || {}).value || "").trim();
  const app_secret = pageId ? CC.draft && CC.draft.app_secret : ((document.getElementById("leadAppSecret") || {}).value || "").trim();
  if(!tok){ toast("Pega el token de acceso."); return; }
  CC.busy = "connect"; renderView();
  try{
    const r = await leadFn({ action:"connect", token:tok, app_id, app_secret, page_id:pageId || undefined });
    if(r.elegir){ CC.pick = r.elegir; CC.draft = { token:tok, app_id, app_secret }; }
    else if(r.ok){
      CC.pick = null; CC.draft = null; CC.connectOpen = false;
      const s = r.sync || {};
      toast("✓ Conectada: " + r.page.name + (s.ok ? " · " + (s.msg || "") : "") + (r.vence === "nunca" ? " · el token no vence" : ""));
    }
    else toast(r.msg || "No se pudo conectar.");
  }catch(e){ toast("Meta: " + (e.message || e)); }
  CC.busy = ""; await loadLeads();
}

async function leadDesconectar(){
  if(!confirm("¿Desconectar la página? Las solicitudes que ya llegaron se quedan.")) return;
  try{ await leadFn({ action:"disconnect" }); CC.connectOpen = false; toast("Página desconectada."); }
  catch(e){ toast("No se pudo desconectar: " + (e.message || e)); }
  await loadLeads();
}

async function leadWebhookInfo(){
  const box = document.getElementById("leadWebhookBox"); if(!box) return;
  try{
    const r = await leadFn({ action:"webhook_info" });
    box.innerHTML = `<div class="lead-webhook">
      <p style="margin:0 0 6px"><b>Para que lleguen al instante</b> (opcional): en tu app de Meta → <i>Webhooks</i> → objeto <b>Page</b> → campo <code>leadgen</code>.</p>
      <p style="margin:0">URL de devolución de llamada<br><code>${esc(r.callback_url)}</code></p>
      <p style="margin:6px 0 0">Token de verificación<br><code>${esc(r.verify_token)}</code></p>
      <p class="muted" style="margin:6px 0 0;font-size:12px">${r.firma_lista ? "La firma de Meta ya se puede comprobar." : "Falta la clave secreta de la app: reconecta con ella para abrir el webhook."} Sin webhook igual llegan cada 5 minutos.</p></div>`;
  }catch(e){ box.innerHTML = `<p class="muted">${esc(e.message || e)}</p>`; }
}

/* ---------- plan B: CSV de Meta ---------- */
function leadParseDelim(txt, sep){
  const rows = []; let row = [], cur = "", q = false;
  for(let i = 0; i < txt.length; i++){
    const ch = txt[i];
    if(q){ if(ch === '"'){ if(txt[i+1] === '"'){ cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if(ch === '"'){ q = true; continue; }
    if(ch === sep){ row.push(cur); cur = ""; continue; }
    if(ch === "\n" || ch === "\r"){ if(ch === "\r" && txt[i+1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; continue; }
    cur += ch;
  }
  if(cur || row.length){ row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}
const LEAD_CSV_META = new Set(["id","created_time","ad_id","ad_name","adset_id","adset_name","campaign_id","campaign_name","form_id","form_name","is_organic","platform","lead_status","inbox_url","full_name","first_name","last_name","phone_number","email"]);
async function leadImportarCsv(file){
  const a = me();
  try{
    const buf = await file.arrayBuffer(), b = new Uint8Array(buf);
    let txt = (b[0] === 0xFF && b[1] === 0xFE) ? new TextDecoder("utf-16le").decode(buf)
            : (b[0] === 0xFE && b[1] === 0xFF) ? new TextDecoder("utf-16be").decode(buf)
            : new TextDecoder("utf-8").decode(buf);
    txt = txt.replace(/^\uFEFF/, "");
    const first = txt.split(/\r?\n/)[0] || "";
    const cuenta = s => first.split(s).length;
    const sep = cuenta("\t") > cuenta(",") ? "\t" : (cuenta(";") > cuenta(",") ? ";" : ",");
    const rows = leadParseDelim(txt, sep);
    if(rows.length < 2){ toast("El archivo no trae solicitudes."); return; }
    const head = rows[0].map(h => String(h).trim());
    const col = n => head.indexOf(n);
    const sinPref = v => String(v || "").trim().replace(/^[a-z]{1,3}:/, "");
    const filas = rows.slice(1).map(r => {
      const g = n => { const i = col(n); return i < 0 ? "" : String(r[i] || "").trim(); };
      const answers = head.map((h, i) => ({ key:h, label:h.replace(/_/g, " "), value:String(r[i] || "").trim() }))
        .filter(x => x.value && !LEAD_CSV_META.has(x.key));
      const f = {
        alma_id:a.almaId, source:"csv", external_id:sinPref(g("id")) || null,
        form_id:sinPref(g("form_id")) || null, form_name:g("form_name") || null,
        ad_id:sinPref(g("ad_id")) || null, ad_name:g("ad_name") || null, campaign_name:g("campaign_name") || null,
        platform:g("platform") || null,
        full_name:g("full_name") || [g("first_name"), g("last_name")].filter(Boolean).join(" ") || null,
        phone:sinPref(g("phone_number")) || null, email:g("email") || null,
        answers, lead_created_at:g("created_time") ? new Date(g("created_time").replace(/([+-]\d{2})(\d{2})$/, "$1:$2")).toISOString() : new Date().toISOString()
      };
      for(const x of answers){
        const t = deburr(x.key + " " + x.label);
        if(/foto/.test(t)) f.photos_via = x.value;
        else if(/ciudad|comuna|ubicacion|donde esta|direccion|city/.test(t)) f.city = f.city ? f.city + " · " + x.value : x.value;
        else if(/medida|dimension|metro|alto|ancho|m2|tamano/.test(t)) f.measures = x.value;
        else if(/idea|diseno|tematica|referencia/.test(t)) f.idea = x.value;
      }
      return f;
    }).filter(f => f.full_name || f.phone || f.email);
    if(!filas.length){ toast("No encontré solicitudes con nombre o teléfono en el archivo."); return; }
    const { data, error } = await Cloud.client.from("client_leads")
      .upsert(filas, { onConflict:"alma_id,external_id", ignoreDuplicates:true }).select("id");
    if(error) throw error;
    const n = (data || []).length;
    toast(n ? `✓ ${n} solicitud${n===1?"":"es"} importada${n===1?"":"s"}` : "Todas esas solicitudes ya estaban.");
  }catch(e){ console.error(e); toast("No se pudo importar: " + (e.message || e)); }
  await loadLeads();
}

/* Contador en el menú (lo pinta navItem en anima.js). */
function leadsBadge(){ const n = leadsPendientes(); return n ? `<span class="nav-badge" title="${n} solicitud${n===1?"":"es"} nueva${n===1?"":"s"}">${n > 9 ? "9+" : n}</span>` : ""; }

document.addEventListener("click", e => {
  const t = e.target;
  if(t.closest("[data-leadstage]")) return;                 // el selector de etapa no abre la ficha
  if(t.closest("[data-leadreload]")){ CC.leads = undefined; renderView(); return; }
  const lt = t.closest("[data-leadtab]"); if(lt){ state.leadTab = lt.dataset.leadtab; renderView(); return; }
  const lwg = t.closest("[data-leadwago]"); if(lwg){ leadWhatsappRapido(lwg.dataset.leadwago); return; }
  const lw = t.closest("[data-leadwa]"); if(lw){ leadConfirmar(lw.dataset.leadwa); return; }
  const le = t.closest("[data-leadedit]"); if(le){
    if(String(state.leadOpen) !== String(le.dataset.leadedit)){ CC_open(le.dataset.leadedit); }
    CC.edit = true; leadsRefresh(true);
    requestAnimationFrame(() => { const i = document.getElementById(leadById(le.dataset.leadedit) && !leadById(le.dataset.leadedit).phone ? "ldf_phone" : "ldf_full_name"); if(i) i.focus(); });
    return; }
  const lo = t.closest("[data-leadopen]"); if(lo){ CC_open(lo.dataset.leadopen); return; }
  if(t.closest("[data-leadback]")){ CC_close(); return; }
  if(t.closest("[data-leadlimpiar]")){ CC.ciudad = CC.origen = CC.fecha = CC.campana = CC.desde = CC.hasta = ""; renderView(); return; }
  const lc = t.closest("[data-leadcamp]"); if(lc){ CC.campana = CC.campana === lc.dataset.leadcamp ? "" : lc.dataset.leadcamp; renderView(); return; }
  if(t.closest("[data-leadnuevo]")){ state.leadOpen = null; CC.edit = false; CC.nuevo = true; CC.anim = true; leadsRefresh(true); CC.anim = false;
    setTimeout(() => { const i = document.getElementById("ldf_full_name"); if(i) i.focus(); }, 60); return; }
  if(t.closest("[data-leadeditcancel]")){ if(CC.nuevo){ CC_close(); return; } CC.edit = false; leadsRefresh(true); return; }
  const ls = t.closest("[data-leadsave]"); if(ls){ leadGuardar(ls.dataset.leadsave); return; }
  const lq = t.closest("[data-leadcotizar]"); if(lq){ leadCotizar(lq.dataset.leadcotizar); return; }
  const lpr = t.closest("[data-leadproyecto]"); if(lpr){ const l = leadById(lpr.dataset.leadproyecto); if(!l) return;
    CC.busy = "proyecto"; leadsRefresh(true);
    leadAProyecto(l).then(() => toast("✓ Proyecto creado en «Cotizando»")).catch(err => toast("No se pudo crear el proyecto: " + (err.message || err)))
      .finally(() => { CC.busy = ""; leadsRefresh(true); }); return; }
  const lvi = t.closest("[data-leadvinculo]"); if(lvi){ const l = leadById(lvi.dataset.leadvinculo); if(!l) return;
    leadAVinculo(l).then(cid => leadPatch(l.id, { client_id: cid })).then(() => { toast("✓ Guardado en Vínculos"); leadsRefresh(true); })
      .catch(err => toast("No se pudo guardar el vínculo: " + (err.message || err))); return; }
  const gv = t.closest("[data-leadgovin]"); if(gv){ state.leadOpen = null; go("clientes"); openDetail("vin", +gv.dataset.leadgovin); return; }
  const gp = t.closest("[data-leadgoproj]"); if(gp){ state.leadOpen = null; go("proyectos"); openDetail("proj", +gp.dataset.leadgoproj); return; }
  const gq = t.closest("[data-leadgoquote]"); if(gq){ state.leadOpen = null; go("cotizador"); qLoad(gq.dataset.leadgoquote); return; }
  const lg = t.closest("[data-leadgo]"); if(lg){ leadIrA(lg.dataset.leadgo); return; }
  const mm = t.closest(".ld-menu button"); if(mm){ const d = mm.closest("details"); if(d) d.open = false; }
  if(t.closest("[data-leadsync]")){ leadSync(); return; }
  if(t.closest("[data-leadconnect]")){ CC.connectOpen = !CC.connectOpen; CC.tplOpen = false; CC.pick = null; renderView(); return; }
  if(t.closest("[data-leaddoconnect]")){ leadConectar(); return; }
  const lp = t.closest("[data-leadpage]"); if(lp){ leadConectar(lp.dataset.leadpage); return; }
  if(t.closest("[data-leadcancel]")){ CC.connectOpen = false; CC.tplOpen = false; CC.pick = null; CC.draft = null; renderView(); return; }
  if(t.closest("[data-leaddisconnect]")){ leadDesconectar(); return; }
  if(t.closest("[data-leadwebhook]")){ leadWebhookInfo(); return; }
  if(t.closest("[data-leadtpl]")){ CC.tplOpen = !CC.tplOpen; CC.connectOpen = false; renderView(); return; }
  if(t.closest("[data-leadtplsave]")){ leadTplSet((document.getElementById("leadTplText") || {}).value || ""); CC.tplOpen = false; toast("✓ Mensaje guardado"); renderView(); return; }
  if(t.closest("[data-leadtplreset]")){ leadTplSet(""); const ta = document.getElementById("leadTplText"); if(ta) ta.value = LEAD_TPL_DEFAULT; return; }
  if(t.closest("[data-leadcsv]")){ const f = document.getElementById("leadCsv"); if(f) f.click(); return; }
  /* Un clic fuera del menú «⋯» lo cierra. */
  document.querySelectorAll(".ld-more[open]").forEach(d => { if(!d.contains(t)) d.open = false; });
});
document.addEventListener("change", e => {
  const el = e.target; if(!el || !el.closest) return;
  const st = el.closest("[data-leadstage]"); if(st){ leadCambiarEtapa(st.dataset.leadstage, st.value); return; }
  const fi = el.closest("[data-leadfiltro]"); if(fi){ CC[fi.dataset.leadfiltro] = fi.value; renderView(); return; }
  const fr = el.closest("[data-leadrango]"); if(fr){ CC[fr.dataset.leadrango] = fr.value; renderView(); return; }
  if(el.closest("[data-leadorden]")){ state.leadOrden = el.value; save(); renderView(); return; }
  const nt = el.closest("[data-leadnotes]"); if(nt){
    leadPatch(nt.dataset.leadnotes, { notes: nt.value.trim() || null }).then(() => toast("✓ Nota guardada")).catch(err => toast("No se pudo guardar la nota: " + (err.message || err)));
    return; }
  if(el.id === "leadCsv" && el.files && el.files[0]){ leadImportarCsv(el.files[0]); el.value = ""; }
});
document.addEventListener("input", e => { if(e.target && e.target.id === "leadQ"){ CC.q = e.target.value; leadAplicarBusqueda(); } });
document.addEventListener("keydown", e => {
  if(state.view !== "centro") return;
  if(e.key === "Escape" && CC.edit && !CC.nuevo){ CC.edit = false; leadsRefresh(true); return; }
  if(e.key === "Escape" && (state.leadOpen || CC.nuevo)){ CC_close(); return; }
  if(e.key === "Enter" && e.target.matches && e.target.matches(".ld-row[data-leadopen]")) CC_open(e.target.dataset.leadopen);
});
/* Si llegó algo nuevo mientras escribías, la lista se redibuja al soltar el campo. */
document.addEventListener("focusout", () => {
  if(!CC.pendiente) return;
  setTimeout(() => { const f = document.activeElement; if(!(f && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName))){ CC.pendiente = false; leadsRefresh(true); } }, 0);
});
