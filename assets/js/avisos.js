/* ===========================================================
   ANIMA STUDIO — Avisos al teléfono
   -----------------------------------------------------------
   Notificaciones push (Web Push) que llegan aunque ANIMA esté
   cerrado (migración 0138, Edge Function `push`):
   - al instante, cuando un potencial cliente responde a un anuncio;
   - un resumen diario de proyectos a la hora elegida;
   - recordatorios que se agendan dentro de cada proyecto.

   El botón de la campana (barra superior) abre el panel. Cada
   dispositivo se activa por separado: el permiso es del navegador.
   En iPhone solo funciona con ANIMA instalada en la pantalla de
   inicio (iOS 16.4+): el panel lo explica en vez de fallar callado.

   Como el resto del Taller, nada de esto va a `state`.
   Se carga ANTES que anima.js: aquí solo se declaran funciones.
   =========================================================== */

const AV = { sub: undefined, prefs: null, devs: [], rem: undefined, open: false, busy: "", remForm: null };

const avSoportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const avEsIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const avInstalada = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function avDispositivo(){
  const u = navigator.userAgent;
  const so = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Mac/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : "Equipo";
  const nav = /Edg\//.test(u) ? "Edge" : /CriOS|Chrome\//.test(u) ? "Chrome" : /FxiOS|Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "Navegador";
  return so + " · " + nav + (avInstalada() ? " (app)" : "");
}
function avLlave(b64){
  const t = (b64 + "===".slice((b64.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t); return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function avFn(body){
  const s = await Cloud.session();
  if(!s && body.action !== "vapid") throw new Error("Tu sesión expiró. Vuelve a entrar.");
  const r = await fetch(SB_URL + "/functions/v1/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SB_KEY, ...(s ? { "Authorization": "Bearer " + s.access_token } : {}) },
    body: JSON.stringify({ ...body, alma_id: me().almaId })
  });
  const j = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(j.msg || ("Error " + r.status));
  return j;
}

/* ¿Este dispositivo está suscrito? */
async function avEstado(){
  if(!avSoportado()){ AV.sub = null; return; }
  try{
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    AV.sub = sub ? sub.endpoint : null;
  }catch(e){ AV.sub = null; }
}
async function avCargar(){
  const a = me(); if(!a || !a.live || !Cloud.client) return;
  await avEstado();
  try{
    const [p, d] = await Promise.all([
      Cloud.client.from("notif_prefs").select("*").eq("alma_id", a.almaId).maybeSingle(),
      Cloud.client.from("push_subscriptions").select("id,endpoint,device,created_at,last_ok_at,fail_count").eq("alma_id", a.almaId).order("created_at")
    ]);
    AV.prefs = p.data || { leads: true, resumen: true, hora: 9 };
    AV.devs = d.data || [];
  }catch(e){ console.error("ANIMA · avisos", e); }
  avPintarBoton(); if(AV.open) avPintarPanel();
}
async function avCargarRecordatorios(){
  const a = me(); if(!a || !a.live || !Cloud.client){ AV.rem = []; return; }
  const desde = new Date(Date.now() - 86400000).toISOString();
  const { data, error } = await Cloud.client.from("project_reminders").select("*").eq("alma_id", a.almaId).gte("at", desde).order("at");
  AV.rem = error ? [] : (data || []);
  if(state.view === "proyectos" && state.projOpen != null) renderView();
  if(AV.open) avPintarPanel();
}

/* ---------- activar / desactivar en este dispositivo ---------- */
async function avActivar(){
  if(!avSoportado()){ toast("Este navegador no recibe avisos."); return; }
  if(avEsIOS() && !avInstalada()){ avPintarPanel(); return; }
  AV.busy = "on"; avPintarPanel();
  try{
    const perm = await Notification.requestPermission();
    if(perm !== "granted") throw new Error(perm === "denied" ? "Bloqueaste los avisos para ANIMA. Actívalos en los ajustes del navegador." : "No se dio permiso.");
    const reg = await navigator.serviceWorker.ready;
    const { key } = await avFn({ action: "vapid" });
    let sub = await reg.pushManager.getSubscription();
    if(sub){
      // Una suscripción hecha con otra llave no sirve: se rehace.
      const k = sub.options && sub.options.applicationServerKey;
      const misma = k && btoa(String.fromCharCode(...new Uint8Array(k))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") === key;
      if(!misma){ await sub.unsubscribe(); sub = null; }
    }
    if(!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: avLlave(key) });
    await avFn({ action: "subscribe", sub: sub.toJSON(), device: avDispositivo() });
    AV.sub = sub.endpoint;
    toast("✓ Avisos activados en este dispositivo");
  }catch(e){ toast(e.message || String(e)); }
  AV.busy = ""; await avCargar();
}
async function avDesactivar(){
  AV.busy = "off"; avPintarPanel();
  try{
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if(sub){ await avFn({ action: "unsubscribe", endpoint: sub.endpoint }); await sub.unsubscribe(); }
    AV.sub = null; toast("Avisos desactivados en este dispositivo.");
  }catch(e){ toast(e.message || String(e)); }
  AV.busy = ""; await avCargar();
}
async function avGuardarPrefs(patch){
  const a = me();
  AV.prefs = { ...(AV.prefs || {}), ...patch };
  const { error } = await Cloud.client.from("notif_prefs").upsert({ alma_id: a.almaId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "alma_id" });
  toast(error ? "No se pudo guardar: " + error.message : "✓ Guardado");
  avPintarPanel();
}

/* ---------- botón de la barra superior ---------- */
function avPintarBoton(){
  const b = document.getElementById("avisosBtn"); if(!b) return;
  const a = typeof me === "function" ? me() : null;
  b.hidden = !(a && a.live);
  const on = !!AV.sub;
  b.innerHTML = `${ANIMA_ICON("campana", "🔔")}<span class="tb-lbl">${on ? "Avisos" : "Activar avisos"}</span>${on ? "" : `<i class="av-dot" aria-hidden="true"></i>`}`;
  b.classList.toggle("on", on);
  b.title = on ? "Avisos activados en este dispositivo" : "Recibe en el teléfono los clientes nuevos y los recordatorios";
}

/* ---------- panel ---------- */
function avAbrir(){ AV.open = true; avPintarPanel(); avCargar(); if(AV.rem === undefined) avCargarRecordatorios(); }
function avCerrar(){ AV.open = false; const r = document.getElementById("avisosRoot"); if(r) r.innerHTML = ""; }
function avPintarPanel(){
  let r = document.getElementById("avisosRoot");
  if(!r){ r = document.createElement("div"); r.id = "avisosRoot"; document.body.appendChild(r); }
  if(!AV.open){ r.innerHTML = ""; return; }
  const p = AV.prefs || { leads: true, resumen: true, hora: 9 };
  const on = !!AV.sub;
  let estado;
  if(!avSoportado() && !(avEsIOS() && !avInstalada())){
    estado = `<p class="av-msg">Este navegador no puede recibir avisos. Prueba con Chrome, Edge, Firefox o Safari al día.</p>`;
  } else if(avEsIOS() && !avInstalada()){
    estado = `<div class="av-msg av-ios"><b>En iPhone, primero instala ANIMA</b>
      <ol><li>Abre <b>www.animatsc.com/studio.html</b> en Safari.</li><li>Toca <b>Compartir</b> <span aria-hidden="true">⬆︎</span> → <b>Agregar a pantalla de inicio</b>.</li><li>Abre ANIMA desde ese ícono y vuelve aquí a <b>Activar</b>.</li></ol>
      <small>Apple solo permite avisos a las apps instaladas (iOS 16.4 o más nuevo).</small></div>`;
  } else if(typeof Notification !== "undefined" && Notification.permission === "denied"){
    estado = `<p class="av-msg">Los avisos están bloqueados para ANIMA en este navegador. Ábrelos en los ajustes del sitio (el candado junto a la dirección) y vuelve a intentar.</p>`;
  } else {
    estado = `<div class="av-estado ${on ? "on" : ""}"><span class="av-led" aria-hidden="true"></span>
        <div><b>${on ? "Activados en este dispositivo" : "Desactivados en este dispositivo"}</b><small>${esc(avDispositivo())}</small></div>
        ${on ? `<button class="btn ghost sm" data-avoff ${AV.busy ? "disabled" : ""}>${AV.busy === "off" ? "…" : "Desactivar"}</button>`
             : `<button class="btn sm" data-avon ${AV.busy ? "disabled" : ""}>${AV.busy === "on" ? "Activando…" : "Activar"}</button>`}</div>`;
  }
  const horas = Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${+p.hora === h ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("");
  const sw = (k, t, d) => `<label class="av-sw"><span><b>${t}</b><small>${d}</small></span><input type="checkbox" data-avpref="${k}" ${p[k] ? "checked" : ""}><i aria-hidden="true"></i></label>`;
  const proxRem = (AV.rem || []).filter(x => !x.sent_at && new Date(x.at) > new Date()).slice(0, 8);
  const proyecto = id => (me().projects || []).find(x => x._id === id);
  r.innerHTML = `<div class="ld-scrim" data-avclose></div>
  <aside class="ld-drawer av-drawer" role="dialog" aria-modal="true" aria-label="Avisos al teléfono" tabindex="-1">
    <header class="ld-dh"><span class="ld-av lg av-ico">${ANIMA_ICON("campana", "🔔")}</span>
      <div class="ld-dh-t"><h3>Avisos al teléfono</h3><small>Llegan aunque ANIMA esté cerrada.</small></div>
      <button class="ld-x" data-avclose aria-label="Cerrar">✕</button></header>
    <div class="ld-dsec">${estado}</div>
    <div class="ld-dsec"><span class="ld-lbl">Qué avisar</span>
      ${sw("leads", "Cliente potencial nuevo", "Al instante, cuando alguien llena el formulario de un anuncio de Meta.")}
      ${sw("resumen", "Resumen del día", "Entregas de hoy y mañana, atrasos, cotizaciones sin respuesta, saldos por cobrar y clientes sin contestar.")}
      ${p.resumen ? `<label class="av-hora">Llega a las <select data-avhora>${horas}</select> <small>(hora de Chile)</small></label>` : ""}
      <p class="muted av-nota">Los recordatorios de cada proyecto se agendan dentro del proyecto (⏰ Recordatorios) y siempre se envían.</p>
    </div>
    ${AV.devs.length ? `<div class="ld-dsec"><span class="ld-lbl">Probar</span>
      <button class="btn ghost sm" data-avtest>Enviar un aviso de prueba</button> <button class="btn ghost sm" data-avresumen>Ver el resumen de hoy</button></div>` : ""}
    <div class="ld-dsec"><span class="ld-lbl">Dispositivos que reciben avisos</span>
      ${AV.devs.length ? `<ul class="av-devs">${AV.devs.map(d => `<li><span><b>${esc(d.device || "Dispositivo")}${d.endpoint === AV.sub ? " · este" : ""}</b><small>${d.last_ok_at ? "último aviso " + esc(postDate(d.last_ok_at)) : "desde " + esc(postDate(d.created_at))}${d.fail_count ? " · " + d.fail_count + " fallo" + (d.fail_count === 1 ? "" : "s") : ""}</small></span><button class="ld-x" data-avquitar="${esc(d.id)}" aria-label="Quitar">✕</button></li>`).join("")}</ul>`
        : `<p class="muted" style="font-size:13px;margin:0">Ninguno todavía. Activa los avisos en tu teléfono (y en el computador, si quieres).</p>`}
    </div>
    <div class="ld-dsec"><span class="ld-lbl">Próximos recordatorios</span>
      ${proxRem.length ? `<ul class="av-rems">${proxRem.map(x => { const pr = x.project_id && proyecto(x.project_id);
        return `<li><span class="av-when">${esc(avCuando(x.at))}</span><span class="av-what"><b>${esc(x.text)}</b>${pr ? `<small>${esc(pr.t)}</small>` : ""}</span><button class="ld-x" data-avremdel="${esc(x.id)}" aria-label="Borrar recordatorio">✕</button></li>`; }).join("")}</ul>`
        : `<p class="muted" style="font-size:13px;margin:0">${AV.rem === undefined ? "Cargando…" : "Nada agendado. Agrégalos desde la ficha de cada proyecto."}</p>`}
    </div>
  </aside>`;
}
function avCuando(iso){
  const d = new Date(iso), hoy = new Date(); const m = new Date(); m.setDate(m.getDate() + 1);
  const hh = d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if(d.toDateString() === hoy.toDateString()) return "Hoy " + hh;
  if(d.toDateString() === m.toDateString()) return "Mañana " + hh;
  return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" }).replace(".", "") + " " + hh;
}

/* ---------- recordatorios dentro de un proyecto ---------- */
function avRecordatoriosHTML(p){
  const a = me(); if(!a.live || !p._id) return "";
  if(AV.rem === undefined){ setTimeout(avCargarRecordatorios, 0); }
  const lista = (AV.rem || []).filter(x => x.project_id === p._id && !x.sent_at);
  const f = AV.remForm && AV.remForm.pid === p._id ? AV.remForm : null;
  const sugerido = flowOf(p.st) === "Cotizando" ? "Hacer seguimiento a la cotización" : p.due ? "Revisar avance antes de la entrega" : "Revisar el proyecto";
  return `<div class="pd-sec">⏰ Recordatorios</div>
    <div class="av-prem">
      ${lista.length ? `<ul class="av-rems">${lista.map(x => `<li><span class="av-when">${esc(avCuando(x.at))}</span><span class="av-what"><b>${esc(x.text)}</b></span><button class="ld-x" data-avremdel="${esc(x.id)}" aria-label="Borrar recordatorio">✕</button></li>`).join("")}</ul>` : ""}
      <input class="av-txt" data-avremtxt="${esc(p._id)}" placeholder="${esc(sugerido)}" value="${esc(f ? f.text : "")}" maxlength="140">
      <div class="av-quick">
        <button class="per-b" data-avremq="${esc(p._id)}" data-cuando="manana">Mañana 9:00</button>
        <button class="per-b" data-avremq="${esc(p._id)}" data-cuando="3d">En 3 días</button>
        <button class="per-b" data-avremq="${esc(p._id)}" data-cuando="7d">En 1 semana</button>
        ${p.due ? `<button class="per-b" data-avremq="${esc(p._id)}" data-cuando="entrega">Día antes de la entrega</button>` : ""}
        <button class="per-b ${f && f.otra ? "on" : ""}" data-avremotra="${esc(p._id)}">Otra fecha…</button>
      </div>
      ${f && f.otra ? `<div class="av-otra"><input type="datetime-local" data-avremdt="${esc(p._id)}" value="${esc(f.dt || "")}"><button class="btn sm" data-avremsave="${esc(p._id)}">Agendar</button></div>` : ""}
      ${!AV.sub ? `<button class="av-hint" data-avisosopen>Activa los avisos en este teléfono para recibirlos →</button>` : ""}
    </div>`;
}
function avCuandoISO(cuando, p){
  const d = new Date(); d.setSeconds(0, 0);
  if(cuando === "manana"){ d.setDate(d.getDate() + 1); d.setHours(9, 0); }
  else if(cuando === "3d"){ d.setDate(d.getDate() + 3); d.setHours(9, 0); }
  else if(cuando === "7d"){ d.setDate(d.getDate() + 7); d.setHours(9, 0); }
  else if(cuando === "entrega" && p && p.due){ const [y, m, dd] = String(p.due).slice(0, 10).split("-").map(Number); d.setFullYear(y, m - 1, dd - 1); d.setHours(9, 0); }
  return d.toISOString();
}
async function avAgendar(pid, atISO){
  const a = me(), p = (a.projects || []).find(x => x._id === pid); if(!p) return;
  const inp = document.querySelector(`[data-avremtxt="${CSS.escape(pid)}"]`);
  const texto = ((inp && inp.value) || "").trim() || (inp && inp.placeholder) || "Revisar el proyecto";
  if(new Date(atISO) <= new Date()){ toast("Elige una fecha que aún no pasó."); return; }
  const { data, error } = await Cloud.client.from("project_reminders").insert({ alma_id: a.almaId, project_id: pid, at: atISO, text: texto }).select().single();
  if(error){ toast("No se pudo agendar: " + error.message); return; }
  (AV.rem || (AV.rem = [])).push(data); AV.rem.sort((x, y) => new Date(x.at) - new Date(y.at));
  AV.remForm = null;
  toast("⏰ Te avisaremos " + avCuando(atISO).toLowerCase() + (AV.sub ? "" : " · activa los avisos en tu teléfono"));
  renderView();
}
async function avBorrarRecordatorio(id){
  const { error } = await Cloud.client.from("project_reminders").delete().eq("id", id);
  if(error){ toast("No se pudo borrar: " + error.message); return; }
  AV.rem = (AV.rem || []).filter(x => x.id !== id);
  renderView(); if(AV.open) avPintarPanel();
}

/* ---------- abrir desde una notificación ---------- */
/* La notificación trae ?ir=centro&lead=… o ?ir=proyectos&proyecto=… */
function avIrA(url){
  let q; try{ q = new URL(url, location.href).searchParams; }catch(e){ return; }
  const ir = q.get("ir"); if(!ir) return;
  if(ir === "centro" && q.get("lead") && typeof leadIrA === "function"){
    const id = q.get("lead"); go("centro");
    let n = 0; const esperar = () => { if(typeof leadById === "function" && leadById(id)) CC_open(id); else if(n++ < 40) setTimeout(esperar, 250); };
    esperar();
  } else if(ir === "proyectos" && q.get("proyecto")){
    const i = (me().projects || []).findIndex(x => x._id === q.get("proyecto"));
    go("proyectos"); if(i >= 0) openDetail("proj", i);
  } else if(["centro", "proyectos", "anuncios", "agenda", "tareas"].includes(ir)) go(ir);
}
function avDeepLink(){
  if(!/[?&]ir=/.test(location.search)) return;
  const url = location.href;
  try{ history.replaceState(history.state, "", location.pathname + location.hash); }catch(e){}
  avIrA(url);
}
if("serviceWorker" in navigator){
  navigator.serviceWorker.addEventListener("message", e => { if(e.data && e.data.type === "anima-ir") avIrA(e.data.url); });
}

/* ---------- eventos ---------- */
document.addEventListener("click", e => {
  const t = e.target;
  if(t.closest("#avisosBtn") || t.closest("[data-avisosopen]")){ avAbrir(); return; }
  if(t.closest("[data-avclose]")){ avCerrar(); return; }
  if(t.closest("[data-avon]")){ avActivar(); return; }
  if(t.closest("[data-avoff]")){ avDesactivar(); return; }
  if(t.closest("[data-avtest]")){ avFn({ action: "test" }).then(r => toast(r.ok ? "✓ Aviso enviado a " + r.enviados + " dispositivo" + (r.enviados === 1 ? "" : "s") : r.msg)).catch(err => toast(err.message)); return; }
  if(t.closest("[data-avresumen]")){ avFn({ action: "resumen" }).then(r => toast("✓ Resumen enviado" + (r.items && r.items.length ? "" : " (nada pendiente hoy)"))).catch(err => toast(err.message)); return; }
  const q = t.closest("[data-avquitar]"); if(q){
    Cloud.client.from("push_subscriptions").delete().eq("id", q.dataset.avquitar).then(({ error }) => { if(error) toast(error.message); avCargar(); });
    return; }
  const rd = t.closest("[data-avremdel]"); if(rd){ avBorrarRecordatorio(rd.dataset.avremdel); return; }
  const rq = t.closest("[data-avremq]"); if(rq){ const p = (me().projects || []).find(x => x._id === rq.dataset.avremq); avAgendar(rq.dataset.avremq, avCuandoISO(rq.dataset.cuando, p)); return; }
  const ro = t.closest("[data-avremotra]"); if(ro){
    const pid = ro.dataset.avremotra, inp = document.querySelector(`[data-avremtxt="${CSS.escape(pid)}"]`);
    const d = new Date(Date.now() + 86400000); d.setHours(9, 0, 0, 0);
    const local = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    AV.remForm = AV.remForm && AV.remForm.pid === pid && AV.remForm.otra ? null : { pid, otra: true, dt: local, text: inp ? inp.value : "" };
    renderView(); return; }
  const rs = t.closest("[data-avremsave]"); if(rs){
    const dt = document.querySelector(`[data-avremdt="${CSS.escape(rs.dataset.avremsave)}"]`);
    if(!dt || !dt.value){ toast("Elige fecha y hora."); return; }
    avAgendar(rs.dataset.avremsave, new Date(dt.value).toISOString()); return; }
});
document.addEventListener("change", e => {
  const el = e.target;
  if(el.matches && el.matches("[data-avpref]")){ avGuardarPrefs({ [el.dataset.avpref]: el.checked }); return; }
  if(el.matches && el.matches("[data-avhora]")){ avGuardarPrefs({ hora: +el.value }); return; }
});
document.addEventListener("input", e => {
  const el = e.target;
  if(el.matches && el.matches("[data-avremtxt]") && AV.remForm && AV.remForm.pid === el.dataset.avremtxt) AV.remForm.text = el.value;
  if(el.matches && el.matches("[data-avremdt]") && AV.remForm) AV.remForm.dt = el.value;
});
document.addEventListener("keydown", e => { if(e.key === "Escape" && AV.open) avCerrar(); });
