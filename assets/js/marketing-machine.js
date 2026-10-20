/* ===========================================================
   ANIMA STUDIO — Marketing Machine (Taller)
   -----------------------------------------------------------
   El ciclo diario de los anuncios, en cinco etapas:
     1 Investigar  → qué ángulos, ganchos y competidores probar hoy
     2 Producir    → hacer las piezas (video, imagen, carrusel)
     3 Subir       → publicarlas en Meta y anotar cuál es cuál
     4 Calificar   → mirar los números y poner veredicto
     5 Escalar     → subir presupuesto o duplicar lo que ganó

   DE DÓNDE SALE CADA COSA
   - Tablero y ritual: tablas mm_ideas y mm_daily (migración 0146),
     RLS por Alma. Viven en `MM`, en memoria.
   - Números de los anuncios: los de anuncios.js (`AD`, tablas meta_ads_*).
     «Calificar» no pide nada nuevo a Meta: usa lo ya sincronizado.
   Se carga DESPUÉS de anuncios.js (usa sus funciones ad*).
   =========================================================== */

const MM = { ideas: undefined, daily: {}, loading: false, almaId: null, nueva: false, open: null, filtro: "", busy: false };

const MM_ETAPAS = [
  { k: "investigar", t: "Investigar", ico: "🔎", d: "Busca 3 ángulos o ganchos nuevos: anuncios de la competencia, preguntas de clientes, lo que ya funcionó." },
  { k: "producir",   t: "Producir",   ico: "🎬", d: "Haz las piezas de hoy: un video, una imagen o un carrusel por idea." },
  { k: "subir",      t: "Subir",      ico: "⬆", d: "Publica en Meta, enlaza cada pieza con su anuncio y anota la hipótesis." },
  { k: "calificar",  t: "Calificar",  ico: "⚖", d: "Mira cada anuncio con 3 días o más y ponle veredicto: ganador, probando o apagar." },
  { k: "escalar",    t: "Escalar",    ico: "🚀", d: "Sube un 20 % el presupuesto de lo que gana, o duplícalo a otra región." }
];
const MM_FORMATOS = ["Video", "Imagen", "Carrusel", "Testimonio", "Otro"];
const MM_REGIONES = ["Todo Chile", "Santiago", "Concepción", "Otra"];
const MM_VEREDICTO = { ganador: ["Ganador", "mm-v-g"], probando: ["Probando", "mm-v-p"], apagar: ["Apagar", "mm-v-a"] };

/* ---------- datos ---------- */
function mmHoy(){ return typeof adDia === "function" ? adDia(0) : new Date().toISOString().slice(0, 10); }
function mmOk(){ const a = me(); return Cloud.enabled && Cloud.client && a && a.live && a.almaId; }

async function mmCargar(){
  const a = me();
  if(MM.loading) return;
  if(!mmOk()){ MM.ideas = []; return; }
  MM.loading = true;
  try{
    const desde = adDia(-90);
    const [i, d] = await Promise.all([
      Cloud.client.from("mm_ideas").select("*").eq("alma_id", a.almaId).order("stage_at", { ascending: false }),
      Cloud.client.from("mm_daily").select("*").eq("alma_id", a.almaId).gte("day", desde)
    ]);
    if(i.error) throw i.error;
    if(d.error) throw d.error;
    MM.ideas = i.data || [];
    MM.daily = Object.fromEntries((d.data || []).map(r => [r.day, r]));
    MM.almaId = a.almaId; MM.error = "";
  }catch(e){ console.error("ANIMA · marketing machine", e); MM.ideas = MM.ideas || []; MM.error = e.message || String(e); }
  MM.loading = false;
  mmRefresh();
}
function mmRefresh(){
  if(state.view === "anuncios" && typeof adRefresh === "function"){ adRefresh(); return; }   // Anuncios muestra el enlace con las ideas
  if(state.view !== "marketing") return;
  const f = document.activeElement;
  if(f && f.closest && f.closest("#view") && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) return;
  renderView();
}

async function mmGuardarIdea(id, cambios){
  const i = MM.ideas.find(x => x.id === id); if(!i) return;
  const antes = { ...i };
  Object.assign(i, cambios, { updated_at: new Date().toISOString() });
  renderView();
  const { error } = await Cloud.client.from("mm_ideas").update({ ...cambios, updated_at: i.updated_at }).eq("id", id);
  if(error){ Object.assign(i, antes); toast("No se pudo guardar: " + error.message); renderView(); }
}
async function mmCrearIdea(campos){
  const a = me();
  const { data, error } = await Cloud.client.from("mm_ideas").insert({ alma_id: a.almaId, ...campos }).select().single();
  if(error){ toast("No se pudo crear: " + error.message); return; }
  MM.ideas.unshift(data); MM.nueva = false; renderView();
}
async function mmMarcarDia(etapa, valor){
  const a = me(), day = mmHoy();
  const fila = MM.daily[day] || { alma_id: a.almaId, day, done: {} };
  const done = { ...(fila.done || {}), [etapa]: valor };
  MM.daily[day] = { ...fila, done };
  renderView();
  const { error } = await Cloud.client.from("mm_daily").upsert({ alma_id: a.almaId, day, done, updated_at: new Date().toISOString() });
  if(error) toast("No se pudo guardar el día: " + error.message);
}

/* ---------- metas y veredicto automático ---------- */
/* Costo por formulario objetivo, en la moneda de la cuenta; se guarda en este dispositivo. */
function mmMeta(){
  try{ const v = Number(localStorage.getItem("anima_mm_cpl")); if(v > 0) return v; }catch(e){}
  return 1;
}
/* Con ≥ 3 días y gasto suficiente se puede calificar; antes es «probando». */
function mmVeredictoAuto(t){
  const meta = mmMeta();
  if(!t.spend || t.dias.size < 3 || t.spend < meta * 1.5) return { v: "probando", why: "Aún no hay datos suficientes (pide 3 días y gasto mínimo)." };
  if(!t.leads) return t.spend >= meta * 3 ? { v: "apagar", why: "Gastó 3× la meta sin un solo formulario." } : { v: "probando", why: "Sin formularios todavía." };
  if(t.cpl <= meta) return { v: "ganador", why: "Costo por formulario dentro de la meta." };
  if(t.cpl > meta * 2) return { v: "apagar", why: "Costo por formulario sobre el doble de la meta." };
  return { v: "probando", why: "Cerca de la meta, vale esperar unos días más." };
}
function mmAnuncios(){
  if(!AD || !AD.con || !AD.objs) return [];
  const p = { desde: adDia(-6), hasta: adDia(0) };
  return AD.objs.filter(o => o.level === "ad").map(o => {
    const t = adSuma(adFilas(p.desde, p.hasta, o.object_id));
    const idea = (MM.ideas || []).find(i => i.ad_id === o.object_id);
    const vida = adVida(o);
    return { o, t, idea, vida, auto: mmVeredictoAuto(t), activo: vida === "marcha" };
  }).filter(x => x.activo || adVigente(x.o) || x.t.spend).sort((a, b) => (b.activo - a.activo) || (b.t.spend - a.t.spend));
}
/* Región de un anuncio según el nombre de su campaña o conjunto. */
function mmRegionDe(o){
  const n = [o.name, (adObj(o.adset_id) || {}).name, (adObj(o.campaign_id) || {}).name].join(" ").toUpperCase();
  const sa = /SANTIAGO/.test(n), co = /CONCEPCI/.test(n);
  return sa && co ? "Otra" : sa ? "Santiago" : co ? "Concepción" : "";
}
/* Un anuncio de Meta pasa al tablero (en «Calificar») para seguirlo cada día. */
async function mmSeguirAnuncio(adId){
  const o = adObj(adId); if(!o || (MM.ideas || []).some(i => i.ad_id === adId)) return;
  const a = me();
  const c = o.creative || {};
  const { data, error } = await Cloud.client.from("mm_ideas").insert({ alma_id: a.almaId, title: o.name || "Anuncio de Meta", stage: "calificar",
    ad_id: adId, region: mmRegionDe(o) || null, format: c.video_id ? "Video" : (c.image_url || c.thumbnail_url ? "Imagen" : null),
    angle: c.title || null, source: "Meta" }).select().single();
  if(error){ toast("No se pudo agregar: " + error.message); return; }
  MM.ideas.unshift(data);
}
async function mmTraerActivos(){
  const faltan = mmAnuncios().filter(x => x.activo && !x.idea);
  if(!faltan.length) return;
  MM.busy = true; renderView();
  for(const x of faltan) await mmSeguirAnuncio(x.o.object_id);
  MM.busy = false; renderView(); toast("✓ " + faltan.length + " anuncio" + (faltan.length === 1 ? "" : "s") + " en el tablero.");
}
function mmVerAnuncio(id){ go("anuncios"); setTimeout(() => adAbrir(id), 0); }
/* Números de 7 días de un anuncio enlazado a una idea. */
function mmNumeros(adId){
  const o = adObj(adId); if(!o) return null;
  const t = adSuma(adFilas(adDia(-6), adDia(0), adId));
  return { vida: adVida(o), t };
}

function mmRacha(){
  let n = 0, d = mmHoy();
  const hecho = day => { const f = MM.daily[day]; return f && MM_ETAPAS.every(e => f.done && f.done[e.k]); };
  if(!hecho(d)) d = adSumar(d, -1);          // hoy aún puede completarse
  while(hecho(d)){ n++; d = adSumar(d, -1); }
  return n;
}

/* ---------- vista ---------- */
function vMarketing(a){
  if(!a.live || !Cloud.enabled) return `<div class="grid"><div class="card s12"><p class="muted">Marketing Machine necesita tu sesión en la nube de ANIMA.</p></div></div>`;
  if(MM.almaId && MM.almaId !== a.almaId){ MM.ideas = undefined; MM.daily = {}; MM.open = null; }
  if(MM.ideas === undefined){ setTimeout(mmCargar, 0); return `<div class="grid"><div class="card s12 ld-cargando"><span class="ld-spin"></span>Cargando Marketing Machine…</div></div>`; }
  /* Los números de Calificar salen del panel de Anuncios: se cargan una vez. */
  if(typeof AD !== "undefined" && AD.con === undefined && !AD.loading && typeof loadAds === "function") setTimeout(loadAds, 0);

  const hoy = mmHoy(), fila = MM.daily[hoy] || { done: {} };
  const ideas = MM.ideas.filter(i => i.stage !== "archivo" && (!MM.filtro || i.region === MM.filtro));
  const porEtapa = k => ideas.filter(i => i.stage === k);
  const anuncios = mmAnuncios();
  const hechas = MM_ETAPAS.filter(e => fila.done && fila.done[e.k]).length;
  const hoyIni = new Date(); hoyIni.setHours(0, 0, 0, 0);
  const nuevasHoy = MM.ideas.filter(i => new Date(i.created_at) >= hoyIni).length;
  const porCalificar = anuncios.filter(x => x.activo && x.t.dias.size >= 3 && !(x.idea && x.idea.verdict)).length;
  const ganadores = anuncios.filter(x => x.auto.v === "ganador" && x.activo).length;
  const auto = {
    investigar: nuevasHoy ? nuevasHoy + " idea" + (nuevasHoy === 1 ? "" : "s") + " nueva" + (nuevasHoy === 1 ? "" : "s") + " hoy" : "Ninguna idea nueva hoy",
    producir: porEtapa("producir").length + " por producir",
    subir: porEtapa("subir").length + " listas para subir",
    calificar: AD && AD.con ? porCalificar + " anuncio" + (porCalificar === 1 ? "" : "s") + " por calificar" : "Conecta Meta en Anuncios",
    escalar: AD && AD.con ? ganadores + " ganador" + (ganadores === 1 ? "" : "es") + " para escalar" : "—"
  };

  const sinSeg = anuncios.filter(x => x.activo && !x.idea).length;
  const enMarcha = anuncios.filter(x => x.activo).length;
  const sinSegHTML = AD && AD.con && sinSeg ? `<div class="card s12 mm-card mm-aviso"><span><b>${sinSeg} anuncio${sinSeg === 1 ? "" : "s"} en marcha ${sinSeg === 1 ? "no está" : "no están"} en el tablero.</b> Súmalos para calificarlos cada día.</span>
      <button class="btn sm" data-mmtraertodos ${MM.busy ? "disabled" : ""}>${MM.busy ? "Agregando…" : "Agregar al tablero"}</button></div>` : "";
  const ritual = `<div class="card s12 mm-card">
      <div class="ad-h"><h3>Ritual de hoy</h3><small class="muted">${hechas} de 5 hechas${mmRacha() ? " · racha de " + mmRacha() + " día" + (mmRacha() === 1 ? "" : "s") : ""}</small></div>
      <div class="mm-ritual">${MM_ETAPAS.map((e, n) => { const ok = !!(fila.done && fila.done[e.k]);
        return `<button type="button" class="mm-paso ${ok ? "on" : ""}" data-mmdia="${e.k}" aria-pressed="${ok}">
          <span class="mm-n">${ok ? "✓" : n + 1}</span><b>${e.t}</b><small>${esc(auto[e.k])}</small></button>`; }).join("")}</div>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">${esc(MM_ETAPAS[Math.min(hechas, 4)].d)}</p>
    </div>`;

  const form = MM.nueva ? `<div class="card s12 mm-card mm-form">
      <div class="ad-h"><h3>Nueva idea</h3></div>
      <label class="lead-f">Título<input id="mmTitulo" autocomplete="off" placeholder="Ej.: Mural antes/después en 30 s"></label>
      <label class="lead-f">Ángulo o gancho<input id="mmAngulo" autocomplete="off" placeholder="La primera frase o imagen que detiene el dedo"></label>
      <div class="lead-f2">
        <label class="lead-f">Formato<select id="mmFormato" class="ld-sel on">${MM_FORMATOS.map(f => `<option>${f}</option>`).join("")}</select></label>
        <label class="lead-f">Región<select id="mmRegion" class="ld-sel on">${MM_REGIONES.map(f => `<option>${f}</option>`).join("")}</select></label>
      </div>
      <label class="lead-f">Hipótesis<input id="mmHip" autocomplete="off" placeholder="Creo que baja el costo por formulario porque…"></label>
      <label class="lead-f">De dónde salió<input id="mmFuente" autocomplete="off" placeholder="Competencia, pregunta de un cliente, anuncio ganador…"></label>
      <button class="btn sm" data-mmcrear>Agregar a Investigar</button> <button class="btn ghost sm" data-mmcancelar>Cancelar</button>
    </div>` : "";

  const idx = k => MM_ETAPAS.findIndex(e => e.k === k);
  const tarjeta = i => {
    const abierta = MM.open === i.id, v = i.verdict && MM_VEREDICTO[i.verdict];
    const k = idx(i.stage);
    const dias = Math.max(0, Math.floor((Date.now() - new Date(i.stage_at)) / 86400000));
    const adSel = (typeof AD !== "undefined" && AD.objs ? AD.objs.filter(o => o.level === "ad" && (adVigente(o) || o.object_id === i.ad_id)) : []);
    const num = i.ad_id && AD && AD.con ? mmNumeros(i.ad_id) : null;
    return `<div class="mm-it ${abierta ? "open" : ""}">
      <button type="button" class="mm-it-h" data-mmabrir="${esc(i.id)}"><b>${esc(i.title)}</b>
        <small>${esc([i.format, i.region].filter(Boolean).join(" · "))}${dias ? " · hace " + dias + " d" : ""}</small>
        ${num ? `<small class="mm-live">${esc(AD_VIDA[num.vida][0])} · ${adMoney(num.t.spend)} · ${adNum(num.t.leads)} form.${isFinite(num.t.cpl) ? " · " + adMoney(num.t.cpl) : ""}</small>` : ""}
        ${v ? `<span class="mm-v ${v[1]}">${v[0]}</span>` : ""}</button>
      ${abierta ? `<div class="mm-it-b">
        <label class="lead-f">Título<input data-mmf="title" value="${esc(i.title)}"></label>
        <label class="lead-f">Ángulo o gancho<input data-mmf="angle" value="${esc(i.angle || "")}"></label>
        <label class="lead-f">Hipótesis<textarea data-mmf="hypothesis" rows="2">${esc(i.hypothesis || "")}</textarea></label>
        <label class="lead-f">Lo aprendido<textarea data-mmf="result" rows="2" placeholder="Qué pasó y qué haremos distinto">${esc(i.result || "")}</textarea></label>
        <div class="lead-f2">
          <label class="lead-f">Anuncio en Meta<select data-mmf="ad_id" class="ld-sel on"><option value="">Sin enlazar</option>${adSel.map(o => `<option value="${esc(o.object_id)}" ${o.object_id === i.ad_id ? "selected" : ""}>${esc(o.name || o.object_id)}</option>`).join("")}</select></label>
          <label class="lead-f">Veredicto<select data-mmf="verdict" class="ld-sel on"><option value="">Sin veredicto</option>${Object.entries(MM_VEREDICTO).map(([k2, x]) => `<option value="${k2}" ${k2 === i.verdict ? "selected" : ""}>${x[0]}</option>`).join("")}</select></label>
        </div>
        <div class="mm-acts">
          ${i.ad_id && AD && AD.con ? `<button class="btn ghost sm" data-mmver="${esc(i.ad_id)}">Ver en Anuncios</button>` : ""}
          ${k > 0 ? `<button class="btn ghost sm" data-mmmover="${esc(i.id)}" data-dir="-1">‹ ${MM_ETAPAS[k - 1].t}</button>` : ""}
          ${k < 4 ? `<button class="btn sm" data-mmmover="${esc(i.id)}" data-dir="1">${MM_ETAPAS[k + 1].t} ›</button>` : ""}
          <button class="btn ghost sm" data-mmarchivar="${esc(i.id)}">Archivar</button>
          <button class="btn ghost sm pd-del" data-mmborrar="${esc(i.id)}">Borrar</button>
        </div>
      </div>` : ""}</div>`;
  };
  const tablero = `<div class="mm-board">${MM_ETAPAS.map(e => { const l = porEtapa(e.k);
    return `<section class="mm-col"><header><span>${e.ico} ${e.t}</span><b>${l.length}</b></header>
      ${l.length ? l.map(tarjeta).join("") : `<p class="mm-vacio">Vacío</p>`}</section>`; }).join("")}</div>`;

  const meta = mmMeta();
  const califica = AD && AD.con ? `<div class="card s12 mm-card">
      <div class="ad-h"><h3>Calificar · últimos 7 días</h3><small class="muted">Meta: ${esc(adMoney(meta))} por formulario <button class="ad-fx" data-mmmeta>cambiar</button></small></div>
      ${anuncios.length ? `<div class="mm-tabla">${anuncios.slice(0, 15).map(x => {
        const v = MM_VEREDICTO[x.auto.v];
        return `<div class="mm-tr" title="${esc(x.auto.why)}">
          <span class="mm-nom"><b>${esc(x.o.name || x.o.object_id)}</b><small>${esc(AD_VIDA[x.vida][0])} · ${x.t.dias.size} día${x.t.dias.size === 1 ? "" : "s"}${x.idea ? " · " + esc(x.idea.title) : ""}</small></span>
          <span class="mm-num"><b>${adMoney(x.t.spend)}</b><small>gasto</small></span>
          <span class="mm-num"><b>${adNum(x.t.leads)}</b><small>formularios</small></span>
          <span class="mm-num"><b>${isFinite(x.t.cpl) ? adMoney(x.t.cpl) : "—"}</b><small>costo/form.</small></span>
          <span class="mm-num"><b>${adPct(x.t.ctr, 2)}</b><small>CTR</small></span>
          <span class="mm-v ${v[1]}">${v[0]}</span>
          <button class="btn ghost sm" data-mmver="${esc(x.o.object_id)}">Ver</button>
          ${x.idea ? `<button class="btn ghost sm" data-mmaplicar="${esc(x.idea.id)}" data-v="${x.auto.v}">Guardar veredicto</button>` : `<button class="btn ghost sm" data-mmtraer="${esc(x.o.object_id)}">Seguir en el tablero</button>`}
        </div>`; }).join("")}</div>` : `<p class="muted" style="font-size:13px;margin:6px 0 0">Sin anuncios con gasto en los últimos 7 días.</p>`}
    </div>` : `<div class="card s12 mm-card"><div class="ad-h"><h3>Calificar</h3></div><p class="muted" style="font-size:13px;margin:0">Conecta tu cuenta de Meta en <button class="btn ghost sm" data-view="anuncios">Anuncios</button> para calificar con números reales.</p></div>`;

  const gan = anuncios.filter(x => x.auto.v === "ganador" && x.activo);
  const escalar = `<div class="card s12 mm-card"><div class="ad-h"><h3>Escalar</h3><small class="muted">Reglas simples y seguras</small></div>
      ${gan.length ? `<ul class="ad-alertas">${gan.slice(0, 6).map(x => `<li class="ad-al ad-al-bajo"><span class="ad-al-i" aria-hidden="true">▲</span><div><b>${esc(x.o.name || x.o.object_id)}</b>
          <small>Cuesta ${adMoney(x.t.cpl)} por formulario (meta ${adMoney(meta)}). Sube el presupuesto del conjunto un 20 % cada 2–3 días, o duplícalo a otra región con el mismo creativo.</small></div><span class="ad-al-t">Ganador</span></li>`).join("")}</ul>`
        : `<p class="muted" style="font-size:13px;margin:6px 0 0">Aún no hay ganadores claros. Producen y suben más variantes de lo que mejor funciona: un anuncio gana cuando cuesta menos que tu meta con 3 días o más de datos.</p>`}
      <p class="muted" style="font-size:12px;margin:10px 0 0">Nunca subas más de un 20–30 % de golpe: Meta reinicia el aprendizaje. Apaga lo que gastó 3× la meta sin formularios.</p>
    </div>`;

  const regiones = `<select class="ld-sel ${MM.filtro ? "on" : ""}" data-mmfiltro aria-label="Región"><option value="">Todas las regiones</option>${MM_REGIONES.map(r => `<option ${r === MM.filtro ? "selected" : ""}>${r}</option>`).join("")}</select>`;
  return `<div class="grid mm">
    <div class="card s12 mm-card"><div class="ld-head"><div class="ld-title"><h2>Marketing Machine</h2><p>Investigar · producir · subir · calificar · escalar — cada día.</p></div>
      <div class="ld-selects">${regiones}<button class="btn sm" data-mmnueva>+ Nueva idea</button></div></div>
      ${MM.error ? `<p class="muted" style="font-size:12.5px;margin:8px 0 0">⚠ ${esc(MM.error)}</p>` : ""}
    </div>
    ${ritual}${sinSegHTML}${form}
    <div class="card s12 mm-card"><div class="ad-h"><h3>Tablero</h3><small class="muted">${ideas.length} en el ciclo</small></div>${tablero}</div>
    ${califica}${escalar}
  </div>`;
}

/* ---------- eventos ---------- */
document.addEventListener("click", e => {
  if(state.view !== "marketing") return;
  const t = e.target;
  const dia = t.closest("[data-mmdia]"); if(dia){ const k = dia.dataset.mmdia, f = MM.daily[mmHoy()]; mmMarcarDia(k, !(f && f.done && f.done[k])); return; }
  if(t.closest("[data-mmnueva]")){ MM.nueva = !MM.nueva; renderView(); return; }
  if(t.closest("[data-mmcancelar]")){ MM.nueva = false; renderView(); return; }
  if(t.closest("[data-mmcrear]")){
    const v = id => ((document.getElementById(id) || {}).value || "").trim();
    if(!v("mmTitulo")){ toast("Ponle un título a la idea."); return; }
    mmCrearIdea({ title: v("mmTitulo"), angle: v("mmAngulo"), format: v("mmFormato"), region: v("mmRegion"), hypothesis: v("mmHip"), source: v("mmFuente") });
    return;
  }
  const ab = t.closest("[data-mmabrir]"); if(ab){ MM.open = MM.open === ab.dataset.mmabrir ? null : ab.dataset.mmabrir; renderView(); return; }
  const mv = t.closest("[data-mmmover]"); if(mv){
    const i = MM.ideas.find(x => x.id === mv.dataset.mmmover); if(!i) return;
    const k = MM_ETAPAS.findIndex(x => x.k === i.stage) + Number(mv.dataset.dir);
    if(k >= 0 && k <= 4) mmGuardarIdea(i.id, { stage: MM_ETAPAS[k].k, stage_at: new Date().toISOString() });
    return;
  }
  const ar = t.closest("[data-mmarchivar]"); if(ar){ MM.open = null; mmGuardarIdea(ar.dataset.mmarchivar, { stage: "archivo", stage_at: new Date().toISOString() }); return; }
  const bo = t.closest("[data-mmborrar]"); if(bo){
    if(!confirm("¿Borrar esta idea para siempre?")) return;
    const id = bo.dataset.mmborrar;
    Cloud.client.from("mm_ideas").delete().eq("id", id).then(({ error }) => {
      if(error){ toast("No se pudo borrar: " + error.message); return; }
      MM.ideas = MM.ideas.filter(x => x.id !== id); MM.open = null; renderView();
    });
    return;
  }
  if(t.closest("[data-mmtraertodos]")){ mmTraerActivos(); return; }
  const vr = t.closest("[data-mmver]"); if(vr){ mmVerAnuncio(vr.dataset.mmver); return; }
  const ap = t.closest("[data-mmaplicar]"); if(ap){ mmGuardarIdea(ap.dataset.mmaplicar, { verdict: ap.dataset.v }); toast("✓ Veredicto guardado."); return; }
  const tr = t.closest("[data-mmtraer]"); if(tr){
    mmSeguirAnuncio(tr.dataset.mmtraer).then(() => renderView());
    return;
  }
  if(t.closest("[data-mmmeta]")){
    const v = prompt("Costo por formulario objetivo (en " + adCur() + "):", String(mmMeta()));
    const n = Number(String(v || "").replace(",", "."));
    if(n > 0){ try{ localStorage.setItem("anima_mm_cpl", String(n)); }catch(err){} renderView(); }
    return;
  }
});
document.addEventListener("change", e => {
  if(state.view !== "marketing") return;
  const el = e.target;
  if(el.matches("[data-mmfiltro]")){ MM.filtro = el.value; renderView(); return; }
  if(el.matches("[data-mmf]") && MM.open){
    const campo = el.dataset.mmf;
    mmGuardarIdea(MM.open, { [campo]: campo === "title" ? (el.value.trim() || "Sin título") : (el.value.trim() || null) });
  }
});
