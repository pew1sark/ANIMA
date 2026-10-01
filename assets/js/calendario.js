/* ===========================================================
   ANIMA STUDIO — Calendario (Taller → Calendario, antes «Agenda»)
   -----------------------------------------------------------
   Un mes a la vista con todo lo que tiene fecha en ANIMA:
     · citas (agenda)            · entregas e inicios de proyectos
     · recordatorios (⏰)         · tareas con fecha
     · eventos del iPhone / Google importados (migración 0139)

   SINCRONIZADO EN LOS DOS SENTIDOS (Edge Function `calendario`)
   - ANIMA → iPhone/Google: un enlace privado de suscripción (webcal).
     Lo que se agrega en ANIMA aparece solo en el Calendario del
     teléfono y en Google Calendar.
   - iPhone/Google → ANIMA: se pega la dirección iCal privada del
     calendario y sus eventos se ven aquí (se releen cada 30 min).

   Como el resto del Taller, los datos de la nube viven en `CAL`,
   no en `state`. Se carga ANTES que anima.js.
   =========================================================== */

const CAL = { mes: "", dia: "", vista: "mes", ocultos: new Set(), fuentes: undefined, ev: [], rem: [], feed: null,
              open: false, busy: "", cargando: false };

const CAL_TIPOS = [
  ["cita", "Citas", "#2b2a2e"], ["entrega", "Entregas", "#c2410c"], ["inicio", "Inicios", "#2e7d52"],
  ["recordatorio", "Recordatorios", "#b8862f"], ["tarea", "Tareas", "#2f6db5"], ["externo", "iPhone / Google", "#7c5cbf"]
];
const CAL_COLOR = Object.fromEntries(CAL_TIPOS.map(([k, , c]) => [k, c]));
const CAL_SWATCH = ["#7c5cbf", "#0e7490", "#be185d", "#4d7c0f", "#b45309", "#475569"];
const MESES_CAL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function calYmd(d){ return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function calHoy(){ return calYmd(new Date()); }
function calMesDe(ymd){ return ymd.slice(0, 7); }
function calMover(ym, n){ const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function calNombreMes(ym){ const [y, m] = ym.split("-").map(Number); return MESES_CAL[m - 1] + " " + y; }
function calDiaLargo(ymd){ const [y, m, d] = ymd.split("-").map(Number); const s = new Date(y, m - 1, d).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" }); return s.charAt(0).toUpperCase() + s.slice(1); }
const calHHMM = iso => new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/* ---------- datos ---------- */
async function loadCal(){
  const a = me(); if(!a || !a.live || !Cloud.client || CAL.cargando) return;
  CAL.cargando = true;
  try{
    const desde = new Date(Date.now() - 90 * 86400000).toISOString();
    const [f, e, r] = await Promise.all([
      Cloud.client.from("cal_sources").select("*").eq("alma_id", a.almaId).order("created_at"),
      Cloud.client.from("cal_events").select("id,source_id,start_at,end_at,all_day,title,location").eq("alma_id", a.almaId).gte("start_at", desde).order("start_at").limit(5000),
      Cloud.client.from("project_reminders").select("*").eq("alma_id", a.almaId).gte("at", desde).order("at")
    ]);
    CAL.fuentes = f.data || []; CAL.ev = e.data || []; CAL.rem = r.data || [];
  }catch(err){ console.error("ANIMA · calendario", err); CAL.fuentes = CAL.fuentes || []; }
  CAL.cargando = false;
  if(state.view === "agenda") renderView();
  if(CAL.open) calPintarPanel();
}
async function calFn(body){
  const s = await Cloud.session(); if(!s) throw new Error("Tu sesión expiró. Vuelve a entrar.");
  const r = await fetch(SB_URL + "/functions/v1/calendario", { method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + s.access_token, "apikey": SB_KEY },
    body: JSON.stringify({ ...body, alma_id: me().almaId }) });
  const j = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(j.msg || ("Error " + r.status));
  return j;
}

/* Todo lo que tiene fecha, en un solo formato. */
function calItems(a){
  const out = [];
  const push = (x) => { if(!CAL.ocultos.has(x.tipo)) out.push(x); };
  (a.agenda || []).forEach((c, i) => { if(c.date) push({ tipo: "cita", dia: String(c.date).slice(0, 10), hora: c.h || "", titulo: c.t || "Cita", sub: c.notes || "", accion: `data-edit="cita:${i}"` }); });
  (a.projects || []).forEach((p, i) => {
    if(projectArchived(p)) return;
    const st = flowOf(p.st);
    if(p.due && st !== "Cerrado") push({ tipo: "entrega", dia: String(p.due).slice(0, 10), titulo: "Entrega · " + p.t, sub: p.client || "", accion: `data-calproj="${i}"`, atrasada: projectLate(p) });
    if(p.start) push({ tipo: "inicio", dia: String(p.start).slice(0, 10), titulo: "Inicio · " + p.t, sub: p.client || "", accion: `data-calproj="${i}"` });
  });
  for(const r of CAL.rem){
    const i = (a.projects || []).findIndex(p => p._id === r.project_id);
    push({ tipo: "recordatorio", dia: calYmd(new Date(r.at)), hora: calHHMM(r.at), titulo: r.text, sub: i >= 0 ? a.projects[i].t : "", accion: i >= 0 ? `data-calproj="${i}"` : "", hecho: !!r.sent_at });
  }
  (a.tasks || []).forEach(t => { if(t.due && !["Finalizada", "Archivada"].includes(t.st)) push({ tipo: "tarea", dia: String(t.due).slice(0, 10), titulo: t.t, sub: t.project || "", accion: `data-go="tareas"` }); });
  const fuente = id => (CAL.fuentes || []).find(f => f.id === id) || {};
  for(const e of CAL.ev){
    const f = fuente(e.source_id);
    // Un evento de varios días se ve en cada uno de sus días.
    const ini = e.all_day ? e.start_at.slice(0, 10) : calYmd(new Date(e.start_at));
    const fin = e.end_at ? (e.all_day ? (() => { const d = new Date(e.end_at); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })() : calYmd(new Date(new Date(e.end_at).getTime() - 1))) : ini;
    for(let d = ini, n = 0; d <= fin && n < 31; n++){
      push({ tipo: "externo", dia: d, hora: e.all_day || d !== ini ? "" : calHHMM(e.start_at), titulo: e.title || "(sin título)", sub: [f.name, e.location].filter(Boolean).join(" · "), color: f.color });
      const [y, m, dd] = d.split("-").map(Number); d = calYmd(new Date(y, m - 1, dd + 1));
    }
  }
  return out.sort((x, y) => x.dia.localeCompare(y.dia) || (x.hora ? 1 : 0) - (y.hora ? 1 : 0) || String(x.hora).localeCompare(String(y.hora)));
}

/* ---------- vista ---------- */
function vCalTaller(a){
  if(a.live && CAL.fuentes === undefined && !CAL.cargando) setTimeout(loadCal, 0);
  if(!CAL.mes) CAL.mes = calMesDe(calHoy());
  if(!CAL.dia) CAL.dia = calHoy();
  const items = calItems(a);
  const porDia = {}; for(const x of items) (porDia[x.dia] || (porDia[x.dia] = [])).push(x);
  const hoy = calHoy();
  const todos = (() => { const s = CAL.ocultos; CAL.ocultos = new Set(); const t = calItems(a); CAL.ocultos = s; return t; })();
  const cuenta = k => todos.filter(x => x.tipo === k && calMesDe(x.dia) === CAL.mes).length;
  const leyenda = `<div class="cal-ley">${CAL_TIPOS.filter(([k]) => k !== "externo" || (CAL.fuentes || []).length).map(([k, t, c]) =>
    `<button class="cal-chip ${CAL.ocultos.has(k) ? "off" : ""}" data-caltipo="${k}" aria-pressed="${!CAL.ocultos.has(k)}"><i style="background:${c}"></i>${t}<span>${cuenta(k)}</span></button>`).join("")}</div>`;
  const sync = (CAL.fuentes || []).length || CAL.feed ? "" : `<button class="cal-sync-cta" data-calsync>⇄ Conecta tu iPhone o Google Calendar</button>`;
  const head = `<div class="cal-head">
      <div class="cal-nav"><button class="ld-x" data-calmes="-1" aria-label="Mes anterior">‹</button><h2>${esc(calNombreMes(CAL.mes))}</h2><button class="ld-x" data-calmes="1" aria-label="Mes siguiente">›</button>
        ${CAL.mes !== calMesDe(hoy) || CAL.dia !== hoy ? `<button class="btn ghost sm" data-calhoy>Hoy</button>` : ""}</div>
      <div class="cal-tools">
        <div class="seg"><button class="seg-b ${CAL.vista === "mes" ? "on" : ""}" data-calvista="mes">Mes</button><button class="seg-b ${CAL.vista === "lista" ? "on" : ""}" data-calvista="lista">Lista</button></div>
        <button class="btn ghost sm" data-calsync title="Sincronizar con iPhone y Google">⇄ <span class="cal-lbl">Sincronizar</span></button>
        <button class="btn sm" data-calcita>＋ Cita</button>
      </div>
    </div>${leyenda}${sync}`;
  const pill = x => `<span class="cal-pill ${x.atrasada ? "late" : ""} ${x.hecho ? "done" : ""}" style="--c:${x.color || CAL_COLOR[x.tipo]}">${x.hora ? `<b>${esc(String(x.hora).slice(0, 5))}</b> ` : ""}${esc(x.titulo)}</span>`;
  let cuerpo;
  if(CAL.vista === "mes"){
    const [y, m] = CAL.mes.split("-").map(Number);
    const primero = new Date(y, m - 1, 1), lunes = (primero.getDay() + 6) % 7;
    const celdas = [];
    for(let i = 0; i < 42; i++){
      const d = new Date(y, m - 1, 1 - lunes + i), ymd = calYmd(d), xs = porDia[ymd] || [];
      if(i >= 35 && d.getMonth() !== m - 1) break;
      celdas.push(`<button class="cal-d ${d.getMonth() !== m - 1 ? "fuera" : ""} ${ymd === hoy ? "hoy" : ""} ${ymd === CAL.dia ? "sel" : ""}" data-caldia="${ymd}" aria-label="${esc(calDiaLargo(ymd))}: ${xs.length} evento${xs.length === 1 ? "" : "s"}">
        <span class="cal-n">${d.getDate()}</span>
        <span class="cal-pills">${xs.slice(0, 3).map(pill).join("")}${xs.length > 3 ? `<span class="cal-mas">+${xs.length - 3}</span>` : ""}</span>
        <span class="cal-dots">${xs.slice(0, 4).map(x => `<i style="background:${x.color || CAL_COLOR[x.tipo]}"></i>`).join("")}</span>
      </button>`);
    }
    cuerpo = `<div class="cal-grid"><div class="cal-sem">${["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map(d => `<span>${d}</span>`).join("")}</div><div class="cal-dias">${celdas.join("")}</div></div>`;
  } else {
    const desde = hoy, dias = Object.keys(porDia).filter(d => d >= desde).sort().slice(0, 40);
    cuerpo = dias.length ? `<div class="cal-lista">${dias.map(d => `<div class="cal-ld"><b class="cal-ld-h ${d === hoy ? "hoy" : ""}">${esc(d === hoy ? "Hoy · " + calDiaLargo(d) : calDiaLargo(d))}</b>${porDia[d].map(calFila).join("")}</div>`).join("")}</div>`
      : `<p class="muted" style="margin:16px 0 0">Nada agendado de aquí en adelante.</p>`;
  }
  const delDia = porDia[CAL.dia] || [];
  const panelDia = CAL.vista === "mes" ? `<div class="card s4 cal-dia">
      <div class="cal-dia-h"><b>${esc(CAL.dia === hoy ? "Hoy" : calDiaLargo(CAL.dia))}</b>${CAL.dia === hoy ? `<small>${esc(calDiaLargo(CAL.dia))}</small>` : ""}</div>
      ${delDia.length ? delDia.map(calFila).join("") : `<p class="muted" style="font-size:13px;margin:6px 0 12px">Día libre.</p>`}
      <button class="btn ghost sm" data-calcita style="margin-top:8px">＋ Cita este día</button>
    </div>` : "";
  return `<div class="grid cal"><div class="card ${CAL.vista === "mes" ? "s8" : "s12"} cal-card">${head}${cuerpo}</div>${panelDia}</div>
    <button class="fab" data-calcita title="Nueva cita">＋<span>Nueva cita</span></button>`;
}
function calFila(x){
  const t = { cita: "Cita", entrega: x.atrasada ? "Entrega atrasada" : "Entrega", inicio: "Inicio", recordatorio: x.hecho ? "Recordatorio enviado" : "Recordatorio", tarea: "Tarea", externo: "Calendario" }[x.tipo];
  return `<div class="cal-fila" ${x.accion || ""} ${x.accion ? 'role="button" tabindex="0"' : ""} style="--c:${x.color || CAL_COLOR[x.tipo]}">
    <span class="cal-h">${esc(x.hora ? String(x.hora).slice(0, 5) : "Todo el día")}</span>
    <span class="cal-t"><b>${esc(x.titulo)}</b><small>${esc([t, x.sub].filter(Boolean).join(" · "))}</small></span></div>`;
}

/* ---------- panel de sincronización ---------- */
function calAbrirPanel(){ CAL.open = true; calPintarPanel(); if(!CAL.feed) calFn({ action: "feed" }).then(r => { CAL.feed = r; calPintarPanel(); }).catch(e => { CAL.feed = { error: e.message }; calPintarPanel(); }); }
function calCerrarPanel(){ CAL.open = false; const r = document.getElementById("calRoot"); if(r) r.innerHTML = ""; }
function calPintarPanel(){
  let r = document.getElementById("calRoot");
  if(!r){ r = document.createElement("div"); r.id = "calRoot"; document.body.appendChild(r); }
  if(!CAL.open){ r.innerHTML = ""; return; }
  const f = CAL.feed;
  const exportar = !f ? `<p class="muted" style="font-size:13px">Preparando tu enlace…</p>`
    : f.error ? `<p class="av-msg">${esc(f.error)}</p>`
    : `<div class="cal-bts">
        <a class="btn sm" href="${esc(f.webcal)}">Agregar al Calendario del iPhone</a>
        <a class="btn ghost sm" href="${esc(f.google)}" target="_blank" rel="noopener">Agregar a Google Calendar</a>
        <button class="btn ghost sm" data-calcopiar>Copiar enlace</button>
      </div>
      <p class="muted cal-p">Incluye citas, entregas (con aviso el día antes a las 9:00), inicios, recordatorios ⏰ y tareas. Todo lo que agregues en ANIMA aparece solo.
        ${f.leido ? `<br><b>Tu calendario lo leyó ${esc("hace " + timeAgo(f.leido))}.</b>` : ""}</p>
      <details class="cal-help"><summary>¿Cada cuánto se actualiza?</summary>
        <p><b>iPhone:</b> según Ajustes → Calendario → Cuentas → Obtener datos (lo normal: cada 15 min a 1 hora). Al suscribirte, desactiva «Eliminar alertas» si quieres que suenen los avisos de ANIMA.<br>
        <b>Google Calendar:</b> Google relee los calendarios suscritos a su ritmo, entre unas horas y un día. Es una limitación de Google, no de ANIMA.</p></details>
      <details class="cal-help"><summary>El enlace es privado</summary>
        <p>Quien tenga este enlace puede ver tus citas y entregas. Si lo compartiste por error, genera uno nuevo: el anterior deja de funcionar y tendrás que volver a suscribirte.</p>
        <button class="btn ghost sm pd-del" data-calregen>Generar un enlace nuevo</button></details>`;
  const fuentes = (CAL.fuentes || []).map(s => `<li><i style="background:${esc(s.color || CAL_COLOR.externo)}"></i>
      <span><b>${esc(s.name)}</b><small class="${s.last_ok === false ? "cal-err" : ""}">${s.last_ok === false ? "Error: " + esc(s.last_msg || "") : s.last_sync_at ? esc((s.last_msg || "") + " · hace " + timeAgo(s.last_sync_at)) : "Sin leer todavía"}</small></span>
      <button class="ld-x" data-calfsync="${esc(s.id)}" title="Leer ahora" aria-label="Leer ahora">↻</button><button class="ld-x" data-calfdel="${esc(s.id)}" title="Quitar" aria-label="Quitar">✕</button></li>`).join("");
  r.innerHTML = `<div class="ld-scrim" data-calclose></div>
  <aside class="ld-drawer cal-drawer" role="dialog" aria-modal="true" aria-label="Sincronizar calendario" tabindex="-1">
    <header class="ld-dh"><span class="ld-av lg">⇄</span><div class="ld-dh-t"><h3>Sincronizar calendario</h3><small>iPhone, Google Calendar y tu correo.</small></div>
      <button class="ld-x" data-calclose aria-label="Cerrar">✕</button></header>
    <div class="ld-dsec"><span class="ld-lbl">1 · De ANIMA a tu calendario</span>${exportar}</div>
    <div class="ld-dsec"><span class="ld-lbl">2 · De tu calendario a ANIMA</span>
      <p class="muted cal-p" style="margin-top:0">Pega la dirección iCal privada de tu calendario y sus eventos se verán aquí, en violeta.</p>
      ${fuentes ? `<ul class="cal-fuentes">${fuentes}</ul>` : ""}
      <label class="lead-f">Nombre<input id="calFNombre" placeholder="Ej: iPhone personal, Gmail" autocomplete="off"></label>
      <label class="lead-f">Dirección iCal<input id="calFUrl" placeholder="https://… o webcal://…" autocomplete="off" spellcheck="false" inputmode="url"></label>
      <div class="cal-sw">${CAL_SWATCH.map((c, i) => `<button class="pc-sw ${i === 0 ? "on" : ""}" data-calcolor="${c}" style="--sw:${c}" aria-label="Color"></button>`).join("")}</div>
      <button class="btn sm" data-calfadd ${CAL.busy ? "disabled" : ""}>${CAL.busy === "add" ? "Leyendo el calendario…" : "Agregar calendario"}</button>
      <details class="cal-help"><summary>¿Dónde está la dirección en Google (Gmail)?</summary>
        <ol><li>En el computador, abre <b>calendar.google.com</b> → ⚙ <b>Configuración</b>.</li><li>A la izquierda, elige tu calendario (bajo «Configuración de mis calendarios»).</li><li>Baja a <b>Integrar el calendario</b> y copia la <b>Dirección secreta en formato iCal</b>.</li></ol></details>
      <details class="cal-help"><summary>¿Y en el iPhone (iCloud)?</summary>
        <ol><li>Abre la app <b>Calendario</b> → <b>Calendarios</b> (abajo).</li><li>Toca la ⓘ junto al calendario y activa <b>Calendario público</b>.</li><li>Toca <b>Compartir enlace</b> → <b>Copiar</b> y pégalo aquí.</li></ol>
        <p class="muted">El enlace de iCloud es público para quien lo tenga: no lo compartas.</p></details>
    </div>
  </aside>`;
}
async function calAgregarFuente(){
  const nombre = ((document.getElementById("calFNombre") || {}).value || "").trim() || "Mi calendario";
  const url = ((document.getElementById("calFUrl") || {}).value || "").trim();
  const color = (document.querySelector(".cal-sw .pc-sw.on") || {}).dataset?.calcolor || CAL_SWATCH[0];
  if(!/^(https?|webcals?):\/\//i.test(url)){ toast("Pega la dirección completa (empieza con https:// o webcal://)."); return; }
  CAL.busy = "add"; calPintarPanel();
  try{
    const { data, error } = await Cloud.client.from("cal_sources").insert({ alma_id: me().almaId, name: nombre, url, color }).select().single();
    if(error) throw error;
    const r = await calFn({ action: "sync", source_id: data.id });
    const x = (r.res || [])[0] || {};
    toast(x.ok ? `✓ ${nombre}: ${x.n} evento${x.n === 1 ? "" : "s"} importado${x.n === 1 ? "" : "s"}` : "No se pudo leer: " + (x.msg || "error"));
  }catch(e){ toast("No se pudo agregar: " + (e.message || e)); }
  CAL.busy = ""; await loadCal();
}

/* ---------- eventos ---------- */
document.addEventListener("click", e => {
  const t = e.target;
  if(t.closest("[data-calclose]")){ calCerrarPanel(); return; }
  if(t.closest("[data-calsync]")){ calAbrirPanel(); return; }
  if(t.closest("[data-calcopiar]")){ const u = CAL.feed && CAL.feed.https; if(u){ (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast("✓ Enlace copiado"), () => prompt("Copia el enlace:", u)); } return; }
  if(t.closest("[data-calregen]")){
    if(!confirm("¿Generar un enlace nuevo? El actual deja de funcionar y tendrás que volver a suscribirte en el iPhone y en Google.")) return;
    calFn({ action: "regenerar" }).then(r => { CAL.feed = r; toast("✓ Enlace nuevo listo"); calPintarPanel(); }).catch(err => toast(err.message)); return; }
  const sw = t.closest("[data-calcolor]"); if(sw){ document.querySelectorAll(".cal-sw .pc-sw").forEach(b => b.classList.toggle("on", b === sw)); return; }
  if(t.closest("[data-calfadd]")){ calAgregarFuente(); return; }
  const fs = t.closest("[data-calfsync]"); if(fs){ calFn({ action: "sync", source_id: fs.dataset.calfsync }).then(r => { const x = (r.res || [])[0] || {}; toast(x.ok ? "✓ " + x.n + " eventos" : "No se pudo leer: " + x.msg); loadCal(); }).catch(err => toast(err.message)); return; }
  const fd = t.closest("[data-calfdel]"); if(fd){
    if(!confirm("¿Quitar este calendario de ANIMA? (En tu iPhone o Google no se borra nada.)")) return;
    Cloud.client.from("cal_sources").delete().eq("id", fd.dataset.calfdel).then(({ error }) => { if(error) toast(error.message); loadCal(); }); return; }
  if(state.view !== "agenda") return;
  const mv = t.closest("[data-calmes]"); if(mv){ CAL.mes = calMover(CAL.mes, +mv.dataset.calmes); CAL.dia = CAL.mes === calMesDe(calHoy()) ? calHoy() : CAL.mes + "-01"; renderView(); return; }
  if(t.closest("[data-calhoy]")){ CAL.mes = calMesDe(calHoy()); CAL.dia = calHoy(); renderView(); return; }
  const vi = t.closest("[data-calvista]"); if(vi){ CAL.vista = vi.dataset.calvista; renderView(); return; }
  const tp = t.closest("[data-caltipo]"); if(tp){ const k = tp.dataset.caltipo; CAL.ocultos.has(k) ? CAL.ocultos.delete(k) : CAL.ocultos.add(k); renderView(); return; }
  const dd = t.closest("[data-caldia]"); if(dd){ CAL.dia = dd.dataset.caldia; if(calMesDe(CAL.dia) !== CAL.mes) CAL.mes = calMesDe(CAL.dia); renderView(); return; }
  const pr = t.closest("[data-calproj]"); if(pr){ go("proyectos"); openDetail("proj", +pr.dataset.calproj); return; }
  if(t.closest("[data-calcita]")){
    openRecord("cita");
    const f = document.getElementById("rec_date"); if(f && CAL.dia) f.value = CAL.dia;
    return; }
});
document.addEventListener("keydown", e => {
  if(e.key === "Escape" && CAL.open){ calCerrarPanel(); return; }
  if(e.key === "Enter" && state.view === "agenda" && e.target.matches && e.target.matches(".cal-fila[role=button]")) e.target.click();
});
