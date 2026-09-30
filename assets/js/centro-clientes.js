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

const CC = { leads: undefined, conn: undefined, loading: false, busy: "", pick: null, draft: null, connectOpen: false, tplOpen: false };

const LEAD_ESTADOS = {
  nuevo:      { t: "Nuevo",      cls: "lb-nuevo" },
  revisado:   { t: "Por responder", cls: "lb-rev" },
  contactado: { t: "Contactado", cls: "lb-ok" },
  descartado: { t: "Descartado", cls: "lb-off" }
};

const LEAD_TPL_DEFAULT =
  "Hola {nombre} 👋 Soy SARK, de PEW1 Murales. Ya revisé tu solicitud:\n" +
  "📍 {ciudad}\n" +
  "📐 {medidas}\n" +
  "💡 {idea}\n" +
  "Para prepararte una cotización detallada, ¿me mandas por aquí unas fotos de la superficie? 🎨";

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
}
function leadsRefresh(){
  try{ renderNav(); }catch(e){}
  if(state.view === "centro") renderView();
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
        const quien = row.full_name || "alguien";
        toast("✦ Nueva solicitud de " + quien);
        leadAvisoDispositivo(quien, row);
        leadsRefresh();
      })
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"client_leads", filter:"alma_id=eq."+a.almaId }, p => {
        const row = p.new; if(!row || !Array.isArray(CC.leads)) return;
        const i = CC.leads.findIndex(x => x.id === row.id); if(i < 0) return;
        CC.leads[i] = { ...CC.leads[i], ...row };
        leadsRefresh();
      })
      .subscribe();
  }catch(e){ window.__leadsSub = null; }
}
function leadAvisoDispositivo(quien, row){
  try{
    if(!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
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

/* ---------- vistas ---------- */
function vCentro(a){
  if(!a.live || !Cloud.enabled){
    return `<div class="grid"><div class="card s12"><p class="muted">El Centro de clientes necesita tu sesión en la nube de ANIMA.</p></div></div>`;
  }
  if(CC.almaId && CC.almaId !== a.almaId){ CC.leads = undefined; CC.conn = undefined; state.leadOpen = null; }
  if(CC.leads === undefined){ setTimeout(loadLeads, 0); return `<div class="grid"><div class="card s12"><p class="muted">Cargando solicitudes…</p></div></div>`; }
  if(CC.leads === null){
    return `<div class="grid"><div class="card s12"><p class="muted">No se pudieron cargar las solicitudes.</p><button class="btn sm" data-leadreload>Reintentar</button></div></div>`;
  }
  if(state.leadOpen && leadById(state.leadOpen)) return vLeadDetalle(a, leadById(state.leadOpen));
  state.leadOpen = null;

  const L = leadsList();
  const vista = state.leadView || "responder";
  const grupos = {
    responder:   L.filter(l => l.status === "nuevo" || l.status === "revisado"),
    contactados: L.filter(l => l.status === "contactado"),
    descartados: L.filter(l => l.status === "descartado"),
    todos:       L
  };
  const seg = (k, t) => `<button class="seg-b ${vista===k?'on':''}" data-leadview="${k}">${t} <span class="seg-n">${grupos[k].length}</span></button>`;
  const lista = grupos[vista] || grupos.responder;

  const cards = lista.map(l => {
    const est = LEAD_ESTADOS[l.status] || LEAD_ESTADOS.nuevo;
    const dato = [l.city, l.measures].filter(Boolean).join(" · ");
    return `<button class="vin-card lead-card ${l.status==='nuevo'?'is-new':''}" data-leadopen="${esc(l.id)}">
      <span class="avatar sm vin-av" style="background:linear-gradient(145deg,${a.color},${shade(a.color,-22)})">${initials(l.full_name || "?")}</span>
      <div class="vin-main">
        <div class="vin-top"><b>${esc(l.full_name || "Sin nombre")}</b><span class="vin-badge ${est.cls}">${est.t}</span></div>
        <small class="muted">${esc(dato || l.phone || "Sin datos del muro")}</small>
        ${l.idea ? `<small class="lead-idea">«${esc(l.idea)}»</small>` : ""}
        <small class="vin-stat">${esc(postDate(l.lead_created_at))}${l.ad_name ? " · " + esc(l.ad_name) : ""}${l.source==="csv" ? " · CSV" : ""}</small>
      </div></button>`;
  }).join("");

  const vacio = !L.length
    ? `<div class="card s12"><p class="muted" style="margin:0">Todavía no llega ninguna solicitud. ${CC.conn ? "Cuando alguien llene el formulario de tu anuncio aparecerá aquí sola." : "Conecta tu página de Facebook o importa el CSV de Meta."}</p></div>`
    : (!lista.length ? `<div class="card s12"><p class="muted" style="margin:0">Nada en este filtro.</p></div>` : "");

  return `<div class="grid">
    <div class="card s12 vin-head">
      <div class="section-title"><h2>Centro de clientes</h2><div class="spacer"></div>
        <div class="seg lead-seg">${seg("responder","Por responder")}${seg("contactados","Contactados")}${seg("descartados","Descartados")}${seg("todos","Todos")}</div>
      </div>
      ${leadConexionHTML()}
    </div>
    ${CC.connectOpen ? leadConectarHTML() : ""}
    ${CC.tplOpen ? leadPlantillaHTML() : ""}
    ${vacio}
    ${lista.length ? `<div class="vin-grid s12">${cards}</div>` : ""}
  </div>
  <input type="file" id="leadCsv" accept=".csv,.tsv,text/csv,text/plain" hidden>`;
}

function leadConexionHTML(){
  const c = CC.conn, busy = CC.busy;
  const acciones = `<div class="lead-acts">
      ${c ? `<button class="btn sm" data-leadsync ${busy?'disabled':''}>${busy==="sync"?"Trayendo…":"↻ Traer ahora"}</button>` : `<button class="btn sm" data-leadconnect>Conectar Meta</button>`}
      <button class="btn ghost sm" data-leadtpl>✎ Mensaje de confirmación</button>
      <button class="btn ghost sm" data-leadcsv>⇪ Importar CSV</button>
      ${("Notification" in window) && Notification.permission === "default" ? `<button class="btn ghost sm" data-leadnotif>🔔 Avisarme aquí</button>` : ""}
      ${c ? `<button class="btn ghost sm" data-leadconnect>⚙ Conexión</button>` : ""}
    </div>`;
  if(!c) return `<p class="muted lead-conn">Conecta tu página de Facebook y cada formulario de tus anuncios llegará aquí solo, cada 5 minutos o al instante.</p>${acciones}`;
  const mal = c.last_sync_ok === false;
  const cuando = c.last_sync_at ? "hace " + timeAgo(c.last_sync_at) : "aún sin sincronizar";
  return `<p class="lead-conn ${mal?'is-bad':''}"><span class="lead-dot"></span>
      Meta conectada · <b>${esc(c.page_name || c.page_id)}</b> · ${esc(mal ? "Error: " + (c.last_sync_msg || "") : (c.last_sync_msg || "Conectada"))} · ${esc(cuando)}</p>${acciones}`;
}

function leadConectarHTML(){
  if(CC.pick){
    return `<div class="card s12 lead-panel"><div class="section-title"><h2 style="font-size:15px">¿Qué página conecto?</h2></div>
      ${CC.pick.map(p => `<button class="btn secondary sm" data-leadpage="${esc(p.id)}" style="margin:0 8px 8px 0">${esc(p.name)}</button>`).join("")}
      <div><button class="btn ghost sm" data-leadcancel>Cancelar</button></div></div>`;
  }
  const c = CC.conn;
  return `<div class="card s12 lead-panel">
    <div class="section-title"><h2 style="font-size:15px">${c ? "Conexión con Meta" : "Conectar tu página de Facebook"}</h2></div>
    <ol class="lead-pasos">
      <li>Entra a <b>developers.facebook.com</b> → <i>Mis apps</i> → crea una app de tipo <b>Negocios</b> (una sola vez).</li>
      <li>Abre el <b>Explorador de la API Graph</b>, elige tu app y pide los permisos <code>leads_retrieval</code>, <code>ads_management</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code> y <code>pages_manage_metadata</code>. Genera el token.</li>
      <li>Pega aquí el token. Con el <b>ID</b> y la <b>clave secreta</b> de la app (en Configuración → Básica), ANIMA lo cambia por uno que no vence.</li>
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
  return `<div class="card s12 lead-panel">
    <div class="section-title"><h2 style="font-size:15px">Mensaje de confirmación</h2></div>
    <p class="muted" style="font-size:12.5px;margin-top:0">Se usa al tocar «Confirmar y abrir WhatsApp». Puedes escribir <code>{nombre}</code>, <code>{ciudad}</code>, <code>{medidas}</code>, <code>{idea}</code> y <code>{fotos}</code>; si la persona no dejó ese dato, la línea se omite.</p>
    <textarea id="leadTplText" rows="7" class="lead-msg">${esc(leadTpl())}</textarea>
    <div style="margin-top:10px"><button class="btn sm" data-leadtplsave>Guardar</button> <button class="btn ghost sm" data-leadtplreset>Volver al original</button> <button class="btn ghost sm" data-leadcancel>Cerrar</button></div>
  </div>`;
}

function vLeadDetalle(a, l){
  const est = LEAD_ESTADOS[l.status] || LEAD_ESTADOS.nuevo;
  const wa = leadWaNumero(l.phone);
  const fila = (k, v) => v ? `<div class="pd-block"><span class="pd-k">${esc(k)}</span><b style="font-size:14.5px;font-weight:600">${esc(v)}</b></div>` : "";
  const extra = (l.answers || []).filter(x => !["full_name","first_name","last_name","phone_number","email"].includes(x.key))
    .map(x => `<div class="pd-block"><span class="pd-k">${esc(x.label || x.key)}</span><p style="margin:3px 0 0;font-size:14px">${esc(x.value || "—")}</p></div>`).join("");
  const vinculo = l.client_id && (a.clients || []).find(c => c._id === l.client_id);
  return `<div class="grid">
    <div class="card s12 pd-head">
      <button class="btn ghost sm" data-leadback>← Centro de clientes</button>
      <span class="avatar sm vin-av" style="background:linear-gradient(145deg,${a.color},${shade(a.color,-22)})">${initials(l.full_name || "?")}</span>
      <h2 style="font-size:22px;letter-spacing:-.03em;margin:0;flex:1;min-width:140px">${esc(l.full_name || "Sin nombre")}</h2>
      <span class="vin-badge ${est.cls}">${est.t}</span>
      <div class="pd-acts">
        ${l.status === "descartado"
          ? `<button class="btn ghost sm" data-leadstatus="${esc(l.id)}:revisado">Recuperar</button>`
          : `<button class="btn ghost sm pd-del" data-leadstatus="${esc(l.id)}:descartado">✕<span> Descartar</span></button>`}
      </div>
    </div>
    <div class="card s5 proj-info">
      <div class="pd-block"><span class="pd-k">Contacto</span><b style="font-size:14px">
        ${l.phone ? `<a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>` : "Sin teléfono"}${l.email ? ` · <a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : ""}</b></div>
      ${fila("Ubicación del muro", l.city)}
      ${fila("Medidas", l.measures)}
      ${fila("Idea del diseño", l.idea)}
      ${fila("Fotos", l.photos_via)}
      <div class="pd-grid3" style="margin-top:6px">
        <div><span class="pd-k">Llegó</span><b>${esc(postDate(l.lead_created_at))}</b></div>
        <div><span class="pd-k">Origen</span><b>${esc(l.platform === "ig" ? "Instagram" : l.platform === "fb" ? "Facebook" : (l.source === "csv" ? "CSV" : "Meta"))}</b></div>
        <div><span class="pd-k">Vínculo</span><b>${vinculo ? esc(vinculo.name) : "—"}</b></div>
      </div>
      ${l.ad_name || l.campaign_name ? `<p class="muted" style="font-size:12px;margin:10px 0 0">${esc([l.campaign_name, l.ad_name].filter(Boolean).join(" · "))}</p>` : ""}
    </div>
    <div class="card s7">
      <div class="section-title"><h2 style="font-size:15px">Confirmar por WhatsApp</h2></div>
      <textarea id="leadMsg" rows="8" class="lead-msg">${esc(l.status === "contactado" && l.message ? l.message : leadMensaje(l))}</textarea>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        ${wa ? `<button class="btn" data-leadwa="${esc(l.id)}">✓ Confirmar y abrir WhatsApp</button>` : `<span class="muted" style="font-size:13px">No dejó un teléfono válido para WhatsApp.</span>`}
        ${l.status === "contactado" ? `<span class="muted" style="font-size:12.5px;align-self:center">Contactado ${esc(postDate(l.contacted_at))}</span>` : ""}
      </div>
      ${extra ? `<div class="section-title" style="margin-top:18px"><h2 style="font-size:15px">Respuestas del formulario</h2></div>${extra}` : ""}
    </div>
  </div>`;
}

/* ---------- acciones ---------- */
/* Abrir una solicitud nueva la da por leída (el contador baja al tiro). */
function CC_open(id){
  const l = leadById(id); if(!l) return;
  if(l.status === "nuevo"){
    leadPatch(id, { status:"revisado", reviewed_at:new Date().toISOString() }).catch(e => console.error(e));
  }
  state.leadOpen = id; leadsRefresh(); try{ scrollTopNow(0); }catch(e){}
}

/* Confirmar: abre WhatsApp (en el mismo toque, para que el navegador no lo
   bloquee), marca la solicitud como contactada y deja a la persona en Vínculos. */
async function leadConfirmar(id){
  const l = leadById(id); if(!l) return;
  const msg = (document.getElementById("leadMsg") || {}).value || leadMensaje(l);
  const num = leadWaNumero(l.phone);
  if(!num){ toast("Esta solicitud no trae un teléfono válido."); return; }
  window.open("https://wa.me/" + num + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
  try{
    const client_id = await leadAVinculo(l);
    await leadPatch(id, { status:"contactado", contacted_at:new Date().toISOString(), message:msg, client_id: client_id || l.client_id || null });
    toast("✓ " + (l.full_name || "Solicitud") + " quedó como contactado");
    renderView();
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
  if(t.closest("[data-leadreload]")){ CC.leads = undefined; renderView(); return; }
  const lv = t.closest("[data-leadview]"); if(lv){ state.leadView = lv.dataset.leadview; renderView(); return; }
  const lo = t.closest("[data-leadopen]"); if(lo){ CC_open(lo.dataset.leadopen); return; }
  if(t.closest("[data-leadback]")){ state.leadOpen = null; renderView(); return; }
  const lw = t.closest("[data-leadwa]"); if(lw){ leadConfirmar(lw.dataset.leadwa); return; }
  const ls = t.closest("[data-leadstatus]"); if(ls){
    const [id, st] = ls.dataset.leadstatus.split(":");
    leadPatch(id, { status:st }).then(() => { if(st === "descartado") state.leadOpen = null; leadsRefresh(); }).catch(err => toast("No se pudo guardar: " + (err.message || err)));
    return; }
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
  if(t.closest("[data-leadnotif]")){ try{ Notification.requestPermission().then(() => renderView()); }catch(err){} return; }
});
document.addEventListener("change", e => {
  if(e.target && e.target.id === "leadCsv" && e.target.files && e.target.files[0]){ leadImportarCsv(e.target.files[0]); e.target.value = ""; }
});
