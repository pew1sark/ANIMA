/* ===========================================================
   ANIMA STUDIO · Paneles (Núcleo y Resumen del Taller) + mapa de Chile

   - vAlmaResumen  el Núcleo: el pulso del mes, la plata y lo que viene.
   - vTaller       el Resumen del Taller: todo el negocio por tramo,
                   con el mapa de proyectos y clientes potenciales.
   - El mapa usa Leaflet (se carga solo la primera vez que se abre) sobre
     teselas de OpenStreetMap. Las ubicaciones se escriben a mano en
     cada proyecto («Stgo Centro», «Colina RM»): primero se buscan en una
     tabla de lugares de Chile que viene aquí; lo que no está se pregunta
     una sola vez a OpenStreetMap y queda guardado en geo_lugares (0144).

   Se carga ANTES que anima.js: aquí solo se declaran funciones.
   =========================================================== */

/* Colores por etapa: los del método de visualización, validados en orden
   (ver la nota en docs). Siempre van con su nombre al lado. */
const DSH_ETAPA = { "Cotizando":"#2a78d6", "Aprobado":"#1baf7a", "En producción":"#eda100", "Revisión":"#e87ba4", "Entregado":"#4a3aa7", "Cerrado":"#eb6834" };
/* En el mapa se ven los tres grupos que importan: solo tres colores, que se
   distinguen bien entre sí aunque estén todos juntos. */
const DSH_GRUPOS = [["realizado","Realizados","#2a78d6"], ["curso","En curso","#eb6834"], ["cotizando","Cotizando","#1baf7a"]];
const DSH_GRUPO_COLOR = Object.fromEntries(DSH_GRUPOS.map(g => [g[0], g[2]]));
const DSH_LEAD_COLOR = "#52514e";
function dshGrupo(p){ const s = flowOf(p.st); return (s === "Entregado" || s === "Cerrado") ? "realizado" : s === "Cotizando" ? "cotizando" : "curso"; }

/* ---------- números ---------- */
function dshOculto(){ return typeof ANIMA_DISCREET !== "undefined" && ANIMA_DISCREET; }
function dshCorto(n){
  if(dshOculto()) return "•••";
  const c = animaCur(), v = Math.abs(+n || 0), s = n < 0 ? "−" : "";
  if(v >= 1e6) return s + c.sym + (v / 1e6).toLocaleString(c.loc, { maximumFractionDigits: v >= 1e7 ? 0 : 1 }) + " M";
  if(v >= 1e3) return s + c.sym + Math.round(v / 1e3).toLocaleString(c.loc) + " mil";
  return s + c.sym + Math.round(v).toLocaleString(c.loc);
}
function dshPct(a, b){ return b ? Math.round(a / b * 100) : 0; }
function dshMesKey(d){ return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function dshMeses(n, hasta){
  const [y, m] = (hasta || dshMesKey(new Date())).split("-").map(Number), out = [];
  for(let i = n - 1; i >= 0; i--) out.push(dshMesKey(new Date(y, m - 1 - i, 1)));
  return out;
}
function dshMesNombre(k, largo){ const [y, m] = k.split("-"); return MON_ABBR[+m - 1] + (largo ? " " + y : ""); }
function dshPorMes(incL, expL){
  const map = {};
  (incL || []).forEach(x => { const k = finMonthKey(x); if(k) (map[k] = map[k] || { i:0, e:0 }).i += +x.a || 0; });
  (expL || []).forEach(x => { const k = finMonthKey(x); if(k) (map[k] = map[k] || { i:0, e:0 }).e += +x.a || 0; });
  return map;
}
/* Meses que se dibujan: los 12 últimos, o los del tramo elegido (máx. 24). */
function dshMesesDe(D, H){
  if(!D && !H) return dshMeses(12);
  const fin = H ? H.slice(0, 7) : dshMesKey(new Date()), ini = D ? D.slice(0, 7) : null;
  const all = dshMeses(24, fin);
  const xs = ini ? all.filter(k => k >= ini) : all.slice(-12);
  return xs.length ? xs : [fin];
}
function dshDias(iso){
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]), h = new Date(); h.setHours(0, 0, 0, 0);
  return Math.round((d - h) / 864e5);
}
function dshCuando(n){ return n == null ? "" : n === 0 ? "hoy" : n === 1 ? "mañana" : n === -1 ? "ayer" : n > 0 ? "en " + n + " días" : "hace " + (-n) + " días"; }

/* ---------- piezas ---------- */
/* Línea de tendencia sin ejes: solo la forma. */
function dshSpark(vals, color){
  const v = (vals || []).map(x => +x || 0); if(v.length < 2 || v.every(x => x === 0)) return "";
  const max = Math.max(...v), min = Math.min(0, ...v), r = max - min || 1, w = 100, h = 28;
  const pts = v.map((x, i) => [i / (v.length - 1) * w, h - 2 - (x - min) / r * (h - 4)]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return `<svg class="dsh-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d} L${w} ${h} L0 ${h} Z" fill="${color}" opacity=".10"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="2.6" fill="${color}"/></svg>`;
}
/* Tarjeta de cifra. delta = { v: % , bueno: true si subir es bueno } */
function dshKpi(o){
  const d = o.delta && isFinite(o.delta.v) ? o.delta : null;
  const sube = d && d.v > 0, baja = d && d.v < 0, bien = d && (d.bueno ? sube : baja), mal = d && (d.bueno ? baja : sube);
  const deltaHTML = d && d.v !== 0 ? `<span class="dsh-delta ${bien ? "up" : mal ? "down" : ""}">${sube ? "▲" : "▼"} ${Math.abs(d.v)}%<span> ${esc(d.txt || "")}</span></span>` : (d ? `<span class="dsh-delta"><span>= ${esc(d.txt || "")}</span></span>` : "");
  return `<div class="card dsh-kpi ${o.cls || "s3"} ${o.go ? "card-link" : ""} ${o.spark ? "has-spark" : ""}" ${o.go ? `data-go="${o.go}"` : ""}>
    <div class="dsh-kpi-top"><span class="dsh-kpi-ico" aria-hidden="true">${o.ico || "◆"}</span><span class="dsh-kpi-lbl">${esc(o.lbl)}</span></div>
    <b class="dsh-kpi-val ${o.tone || ""}">${o.val}</b>
    <div class="dsh-kpi-foot">${deltaHTML}<small>${o.sub || ""}</small></div>
    ${o.spark || ""}
  </div>`;
}
/* Barras por mes: ingresos y egresos lado a lado, con la ganancia al pasar el dedo. */
function dshBarrasMes(incL, expL, meses){
  const map = dshPorMes(incL, expL), rows = meses.map(k => ({ k, i: (map[k] || {}).i || 0, e: (map[k] || {}).e || 0 }));
  if(!rows.some(r => r.i || r.e)) return `<div class="dsh-empty">Aún no hay movimientos en Raíz${meses.length < 12 ? " en este tramo" : ""}. Registra un abono o un egreso y aquí verás cómo va cada mes.</div>`;
  const max = Math.max(1, ...rows.map(r => Math.max(r.i, r.e)));
  const tope = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))), n = max / p; return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; })();
  const hoy = dshMesKey(new Date());
  const tot = rows.reduce((t, r) => ({ i: t.i + r.i, e: t.e + r.e }), { i:0, e:0 });
  /* Lo que no tiene fecha cuenta en los totales pero no cae en ningún mes:
     se dice, para que la tarjeta y el gráfico no parezcan contradecirse. */
  const sinI = (incL || []).filter(x => !finMonthKey(x)), sinE = (expL || []).filter(x => !finMonthKey(x));
  const sinTxt = [sinI.length ? `${sinI.length} abono${sinI.length === 1 ? "" : "s"} (${dshCorto(sum(sinI))})` : "", sinE.length ? `${sinE.length} egreso${sinE.length === 1 ? "" : "s"} (${dshCorto(sum(sinE))})` : ""].filter(Boolean).join(" y ");
  return `<div class="dsh-legend"><span><i style="background:#2a78d6"></i>Abonos y pagos <b>${dshCorto(tot.i)}</b></span><span><i style="background:#eb6834"></i>Egresos <b>${dshCorto(tot.e)}</b></span><span class="dsh-legend-g">Ganancia <b>${dshCorto(tot.i - tot.e)}</b></span></div>
  ${sinTxt ? `<p class="dsh-nota">${sinTxt} sin fecha no aparece${sinI.length + sinE.length === 1 ? "" : "n"} en el gráfico. <button class="dsh-link" data-go="finanzas">Ponles fecha en Raíz →</button></p>` : ""}
  <div class="dsh-bars" role="img" aria-label="Abonos y egresos por mes">
    <div class="dsh-grid-y">${[1, .5, 0].map(f => `<span style="bottom:${f * 100}%"><em>${f ? dshCorto(tope * f) : ""}</em></span>`).join("")}</div>
    <div class="dsh-cols" style="--n:${rows.length}">${rows.map(r => {
      const g = r.i - r.e;
      const tip = `${dshMesNombre(r.k, true)}|Abonos y pagos: ${money(r.i)}|Egresos: ${money(r.e)}|Ganancia: ${money(g)}`;
      return `<div class="dsh-col ${r.k === hoy ? "is-now" : ""}" data-tip="${esc(tip)}" tabindex="0">
        <div class="dsh-col-b"><span class="b-i" style="height:${r.i / tope * 100}%"></span><span class="b-e" style="height:${r.e / tope * 100}%"></span></div>
        <small>${dshMesNombre(r.k)}</small></div>`; }).join("")}</div>
  </div>
  <details class="dsh-table"><summary>Ver como tabla</summary><table><thead><tr><th>Mes</th><th>Abonos y pagos</th><th>Egresos</th><th>Ganancia</th></tr></thead>
    <tbody>${rows.slice().reverse().map(r => `<tr><td>${dshMesNombre(r.k, true)}</td><td>${money(r.i)}</td><td>${money(r.e)}</td><td>${money(r.i - r.e)}</td></tr>`).join("")}</tbody></table></details>`;
}
/* Embudo de etapas: cuántos y cuánta plata hay en cada una. */
function dshEtapas(projects, onClick){
  const xs = FLOW.map(s => { const ps = projects.filter(p => flowOf(p.st) === s); return { s, n: ps.length, m: ps.reduce((t, p) => t + (+p.budget || 0), 0) }; });
  const total = xs.reduce((t, x) => t + x.n, 0);
  if(!total) return `<div class="dsh-empty">Aún no hay proyectos. Cuando crees uno, aquí verás en qué etapa está cada trabajo.</div>`;
  const maxM = Math.max(1, ...xs.map(x => x.m));
  return `<div class="dsh-stack" role="img" aria-label="Proyectos por etapa">${xs.filter(x => x.n).map(x => `<span style="flex:${x.n};background:${DSH_ETAPA[x.s]}" data-tip="${esc(x.s + "|" + x.n + " proyecto" + (x.n === 1 ? "" : "s") + "|" + money(x.m))}"></span>`).join("")}</div>
    <div class="dsh-etapas">${xs.map(x => `<div class="dsh-etapa ${x.n ? "" : "is-zero"}" ${onClick ? `data-go="proyectos"` : ""}>
      <span class="dsh-dot" style="background:${DSH_ETAPA[x.s]}"></span><span class="dsh-etapa-n">${esc(x.s)}</span>
      <span class="dsh-etapa-bar"><span style="width:${x.m / maxM * 100}%;background:${DSH_ETAPA[x.s]}"></span></span>
      <b>${x.n}</b><small>${dshCorto(x.m)}</small></div>`).join("")}</div>`;
}
/* Próximas entregas, con cuántos días faltan. */
function dshEntregas(a, lista, max){
  const all = (a.projects || []);
  const xs = lista.slice(0, max || 6);
  if(!xs.length) return `<div class="dsh-empty">Sin entregas en las próximas semanas. Pon fecha de entrega en tus proyectos para verlas aquí.</div>`;
  return `<div class="dsh-due">${xs.map(p => {
    const i = all.indexOf(p), n = dshDias(p.due), m = String(p.due).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return `<div class="dsh-due-row ${n != null && n < 0 ? "is-late" : n != null && n <= 3 ? "is-soon" : ""}" ${i >= 0 ? `data-projgo="${i}"` : ""} tabindex="0">
      <span class="dsh-due-d"><b>${m ? +m[3] : "—"}</b><small>${m ? MON_ABBR[+m[2] - 1] : ""}</small></span>
      <div class="grow"><b>${esc(p.t)}</b><small>${esc([p.client, projectLocation(p)].filter(Boolean).join(" · ") || "Sin cliente")}</small></div>
      <span class="dsh-due-w"><span class="dsh-dot" style="background:${DSH_ETAPA[flowOf(p.st)]}"></span>${esc(flowOf(p.st))}<small>${n != null && n < 0 ? "⚠ atrasada " + (-n) + " d" : esc(dshCuando(n))}</small></span>
    </div>`; }).join("")}</div>`;
}
/* Clientes que más han encargado (proyectos aprobados). */
function dshTopClientes(projects){
  const map = new Map();
  projects.filter(projectAprobado).forEach(p => { const k = String(p.client || "").trim(); if(!k) return;
    const x = map.get(k) || { n:0, m:0, pag:0 }; const f = projectMoney(p); x.n++; x.m += f.budget; x.pag += f.paid; map.set(k, x); });
  const xs = [...map.entries()].sort((x, y) => y[1].m - x[1].m).slice(0, 6);
  if(!xs.length) return `<div class="dsh-empty">Cuando apruebes proyectos con su cliente, aquí verás quién te encarga más.</div>`;
  const max = Math.max(1, ...xs.map(x => x[1].m));
  return `<div class="dsh-rank">${xs.map(([k, x], i) => `<div class="dsh-rank-row" data-dshcliente-go="${esc(k)}" title="Ver en el mapa">
      <span class="dsh-rank-i">${i + 1}</span><div class="grow"><b>${esc(k)}</b><span class="dsh-rank-bar"><span style="width:${x.m / max * 100}%"></span></span></div>
      <span class="dsh-rank-v"><b>${dshCorto(x.m)}</b><small>${x.n} proyecto${x.n === 1 ? "" : "s"}${x.m - x.pag > 0 ? " · debe " + dshCorto(x.m - x.pag) : ""}</small></span></div>`).join("")}</div>`;
}
/* Clientes potenciales (Centro de clientes): de cuántos llegan a cuántos ganas. */
function dshLeadsListos(){
  if(typeof CC === "undefined" || !Cloud.enabled || !me().live) return false;
  if(CC.leads === undefined && !CC.loading && !dshLeadsListos._pedido){
    dshLeadsListos._pedido = true;
    setTimeout(() => { Promise.resolve(loadLeads()).then(() => { if(dshEnPanel()) renderView(); }).catch(() => {}); }, 0);
  }
  return Array.isArray(CC.leads);
}
function dshEmbudoLeads(D, H){
  if(!dshLeadsListos()) return `<div class="dsh-empty">${typeof CC !== "undefined" && Cloud.enabled && me().live ? "Cargando solicitudes…" : "Conecta tu cuenta para ver tus clientes potenciales."}</div>`;
  const L = CC.leads.filter(l => (!D && !H) || inRange(String(l.lead_created_at || "").slice(0, 10), D, H));
  if(!L.length) return `<div class="dsh-empty">Sin solicitudes${D || H ? " en este tramo" : " todavía"}. Llegan solas desde tus anuncios de Meta.</div>`;
  const etapa = s => (LEAD_ESTADOS[s] || {}).i || 0, ix = k => LEAD_ESTADOS[k].i;
  const vivas = L.filter(l => l.status !== "descartado");
  const pasos = [
    ["Llegaron", L.length],
    ["Contactadas", vivas.filter(l => etapa(l.status) >= ix("contactado")).length],
    ["Cotizadas", vivas.filter(l => etapa(l.status) >= ix("cotizado")).length],
    ["Ganadas", vivas.filter(l => l.status === "ganado").length]
  ];
  const sinResp = L.filter(l => l.status === "nuevo" || l.status === "revisado").length;
  const semana = L.filter(l => Date.now() - new Date(l.lead_created_at) < 7 * 864e5).length;
  return `<div class="dsh-funnel">${pasos.map(([t, n], i) => `<div class="dsh-fun-row"><span class="dsh-fun-t">${t}</span>
      <span class="dsh-fun-bar"><span style="width:${Math.max(n ? 3 : 0, dshPct(n, pasos[0][1]))}%"></span></span>
      <b>${n}</b><small>${i ? dshPct(n, pasos[0][1]) + "%" : ""}</small></div>`).join("")}</div>
    <div class="dsh-mini-stats"><div><b>${semana}</b><span>esta semana</span></div><div class="${sinResp ? "is-warn" : ""}"><b>${sinResp}</b><span>sin responder</span></div><div><b>${dshPct(pasos[3][1], pasos[0][1])}%</b><span>conversión</span></div></div>`;
}

/* Tooltip compartido: cualquier [data-tip="Título|línea|línea"]. */
function dshTip(el){
  let t = document.getElementById("dshTip");
  if(!el){ if(t) t.hidden = true; return; }
  if(!t){ t = document.createElement("div"); t.id = "dshTip"; t.className = "dsh-tip"; t.setAttribute("role", "tooltip"); document.body.appendChild(t); }
  const [h, ...ls] = String(el.dataset.tip).split("|");
  t.innerHTML = `<b>${esc(h)}</b>${ls.map(l => `<span>${esc(l)}</span>`).join("")}`;
  t.hidden = false;
  const r = el.getBoundingClientRect(), w = t.offsetWidth, hh = t.offsetHeight;
  let x = r.left + r.width / 2 - w / 2, y = r.top - hh - 8;
  x = Math.max(8, Math.min(innerWidth - w - 8, x)); if(y < 8) y = r.bottom + 8;
  t.style.left = x + "px"; t.style.top = y + "px";
}
document.addEventListener("mouseover", e => { const el = e.target.closest && e.target.closest("[data-tip]"); dshTip(el || null); });
document.addEventListener("focusin", e => { const el = e.target.closest && e.target.closest("[data-tip]"); if(el) dshTip(el); });
document.addEventListener("scroll", () => dshTip(null), true);

/* ===========================================================
   MAPA DE CHILE
   =========================================================== */
const MAPA = { cargando: null, inst: null, capa: null, geo: new Map(), geoAlma: null, cola: [], trabajando: false, pedidas: 0,
               f: { capa: "proyectos", grupo: "", cliente: "", q: "" }, ajustado: "", marcas: new Map() };

/* Lugares de Chile que más aparecen (comunas de Santiago y ciudades de
   regiones). Lo demás se pregunta a OpenStreetMap. */
const DSH_LUGARES = {
  "santiago":[-33.4489,-70.6693],"providencia":[-33.4314,-70.6093],"las condes":[-33.4113,-70.567],"vitacura":[-33.38,-70.57],"lo barnechea":[-33.35,-70.5167],
  "nunoa":[-33.4569,-70.5975],"la reina":[-33.45,-70.5333],"penalolen":[-33.4833,-70.5333],"macul":[-33.4917,-70.5986],"la florida":[-33.5225,-70.5986],
  "puente alto":[-33.6117,-70.5758],"san joaquin":[-33.495,-70.6283],"san miguel":[-33.4975,-70.6517],"la cisterna":[-33.53,-70.6611],"el bosque":[-33.5617,-70.675],
  "la granja":[-33.5333,-70.625],"la pintana":[-33.5833,-70.6333],"san ramon":[-33.5333,-70.6417],"lo espejo":[-33.525,-70.6917],"pedro aguirre cerda":[-33.4917,-70.675],
  "estacion central":[-33.4592,-70.6994],"cerrillos":[-33.5,-70.7167],"maipu":[-33.51,-70.7572],"pudahuel":[-33.44,-70.76],"cerro navia":[-33.425,-70.735],
  "lo prado":[-33.4442,-70.7253],"quinta normal":[-33.4278,-70.6997],"renca":[-33.4044,-70.7278],"independencia":[-33.4167,-70.6667],"recoleta":[-33.4067,-70.6389],
  "conchali":[-33.3833,-70.675],"huechuraba":[-33.3667,-70.6333],"quilicura":[-33.3667,-70.7333],"colina":[-33.2,-70.6833],"chicureo":[-33.28,-70.65],"lampa":[-33.2833,-70.8833],
  "san bernardo":[-33.5925,-70.6997],"buin":[-33.7333,-70.7333],"paine":[-33.8167,-70.75],"calera de tango":[-33.6297,-70.7833],"talagante":[-33.665,-70.9278],
  "penaflor":[-33.6167,-70.8833],"padre hurtado":[-33.5667,-70.8],"el monte":[-33.6833,-71.0167],"isla de maipo":[-33.75,-70.9],"melipilla":[-33.6833,-71.2167],
  "curacavi":[-33.4,-71.1333],"pirque":[-33.6333,-70.55],"san jose de maipo":[-33.6333,-70.35],"tiltil":[-33.0833,-70.9333],
  "arica":[-18.4783,-70.3126],"iquique":[-20.2133,-70.1503],"alto hospicio":[-20.27,-70.1],"antofagasta":[-23.6509,-70.3975],"calama":[-22.456,-68.9293],
  "copiapo":[-27.3668,-70.3323],"la serena":[-29.9027,-71.2519],"coquimbo":[-29.9533,-71.3436],"ovalle":[-30.6015,-71.199],
  "valparaiso":[-33.0472,-71.6127],"vina del mar":[-33.0245,-71.5518],"quilpue":[-33.0472,-71.4425],"villa alemana":[-33.0422,-71.3733],"concon":[-32.923,-71.519],
  "quillota":[-32.8833,-71.25],"los andes":[-32.8333,-70.6],"san felipe":[-32.75,-70.7167],"san antonio":[-33.5933,-71.6217],"casablanca":[-33.3167,-71.4167],
  "algarrobo":[-33.3667,-71.6667],"rancagua":[-34.1708,-70.7444],"machali":[-34.1833,-70.65],"san fernando":[-34.5833,-70.9833],"santa cruz":[-34.6333,-71.3667],
  "pichilemu":[-34.3872,-72.0033],"curico":[-34.9828,-71.2394],"teno":[-34.8667,-71.1667],"talca":[-35.4264,-71.6554],"linares":[-35.85,-71.6],
  "constitucion":[-35.3333,-72.4167],"chillan":[-36.6066,-72.1034],"nuble":[-36.6066,-72.1034],"quillon":[-36.7381,-72.4689],"concepcion":[-36.827,-73.0503],
  "talcahuano":[-36.7249,-73.1168],"tome":[-36.6167,-72.95],"coliumo":[-36.5378,-72.9561],"hualpen":[-36.7833,-73.0833],"san pedro de la paz":[-36.8333,-73.1167],
  "chiguayante":[-36.9167,-73.0167],"coronel":[-37.0167,-73.15],"los angeles":[-37.4697,-72.3537],"temuco":[-38.7359,-72.5904],"villarrica":[-39.2833,-72.2333],
  "pucon":[-39.2726,-71.9775],"valdivia":[-39.8142,-73.2459],"osorno":[-40.5739,-73.1336],"puerto varas":[-41.3194,-72.9853],"puerto montt":[-41.4693,-72.9424],
  "castro":[-42.48,-73.7622],"ancud":[-41.8697,-73.8203],"coyhaique":[-45.5712,-72.0685],"punta arenas":[-53.1638,-70.9171],"puerto natales":[-51.7236,-72.4875]
};
const DSH_ALIAS = { "stgo":"santiago", "stgo centro":"santiago", "santiago centro":"santiago", "conce":"concepcion", "vina":"vina del mar", "pac":"pedro aguirre cerda" };
const DSH_RUIDO = /\b(rm|region|metropolitana|de chile|chile|comuna|ciudad|sector|provincia)\b/g;
function dshLugarClave(txt){
  return deburr(String(txt || "")).replace(/[,;/()·]/g, " ").replace(DSH_RUIDO, " ").replace(/\s+/g, " ").trim();
}
/* Texto escrito → coordenadas que ya se saben (o null si no hay cómo).
   Si lo único que se reconoce es «Santiago» pero hay más texto («Lomas San
   Sebastián, Santiago»), la respuesta lleva general:true para buscar antes
   el lugar exacto. */
function dshLugarLocal(clave){
  if(!clave) return null;
  if(DSH_ALIAS[clave]) clave = DSH_ALIAS[clave];
  if(DSH_LUGARES[clave]) return DSH_LUGARES[clave];
  const w = clave.split(" ");
  let general = null;
  for(let n = Math.min(4, w.length); n >= 1; n--){
    for(let i = 0; i + n <= w.length; i++){
      let k = w.slice(i, i + n).join(" "); k = DSH_ALIAS[k] || k;
      if(DSH_LUGARES[k]){ if(k === "santiago"){ general = general || DSH_LUGARES[k]; continue; } return DSH_LUGARES[k]; }
    }
  }
  if(general){ const g = general.slice(); g.general = true; return g; }
  return null;
}
/* Cómo se ve el lugar escrito: «Providencia, Santiago». */
const dshTitulo = t => t === t.toLowerCase() ? t.replace(/(^|\s)(\S)/g, (m, e, c) => e + c.toUpperCase()) : t;
function dshLugarTexto(comuna, city){ return [comuna, city].map(x => dshTitulo(String(x || "").trim())).filter(Boolean).filter((x, i, xs) => xs.findIndex(y => deburr(y) === deburr(x)) === i).join(", "); }
/* Un texto muy largo no es un lugar («Quiero un mural para mi empresa»). */
const DSH_NO_LUGAR = /\b(quiero|quisiera|necesito|hola|mural|murales|para|empresa|cotiza\w*|precio|gracias|casa|pared|muro)\b/;
function dshPareceLugar(t){ const s = String(t || "").trim(); return s.length > 1 && s.length <= 48 && s.split(/\s+/).length <= 5 && !/[?¿!¡@]/.test(s) && !DSH_NO_LUGAR.test(deburr(s)); }
/* [lat,lng] | null (no se encontró) | undefined (todavía se está buscando) */
function dshCoords(texto){
  if(!dshPareceLugar(texto)) return null;
  const clave = dshLugarClave(texto); if(!clave) return null;
  const loc = dshLugarLocal(clave); if(loc && !loc.general) return loc;
  if(MAPA.geo.has(clave)) return MAPA.geo.get(clave) || loc;
  if(!MAPA.cola.some(x => x.clave === clave)) MAPA.cola.push({ clave, texto });
  dshGeoTrabajar();
  return undefined;
}
async function dshGeoCargar(){
  const a = me(); if(MAPA.geoAlma === (a.almaId || "local")) return;
  MAPA.geoAlma = a.almaId || "local";
  if(!a.live || !Cloud.client) return;
  try{ const r = await Cloud.client.from("geo_lugares").select("q,lat,lng").eq("alma_id", a.almaId);
       if(!r.error) (r.data || []).forEach(x => MAPA.geo.set(x.q, x.lat == null ? null : [x.lat, x.lng])); }catch(e){}
}
/* Pregunta a OpenStreetMap de a una, con un segundo entre cada una (sus
   reglas de uso), y guarda la respuesta para no repetirla nunca. */
async function dshGeoTrabajar(){
  if(MAPA.trabajando) return; MAPA.trabajando = true;
  try{
    await dshGeoCargar();
    while(MAPA.cola.length && MAPA.pedidas < 40){
      const { clave, texto } = MAPA.cola.shift();
      if(MAPA.geo.has(clave)) continue;
      MAPA.pedidas++;
      let pos = null, label = null;
      try{
        const u = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=cl&accept-language=es&q=" + encodeURIComponent(texto + ", Chile");
        const r = await fetch(u, { headers: { "Accept": "application/json" } });
        if(r.ok){
          const xs = await r.json();
          const ok = (xs || []).find(x => ["place", "boundary"].includes(x.category) || /city|town|village|hamlet|suburb|neighbourhood|quarter|municipality|county|state|region|province|locality|borough/.test(x.addresstype || ""));
          if(ok){ pos = [+ok.lat, +ok.lon]; label = String(ok.display_name || "").slice(0, 200); }
        } else if(r.status === 429){ MAPA.cola.unshift({ clave, texto }); MAPA.pedidas = 99; break; }
      }catch(e){ MAPA.pedidas--; MAPA.cola.unshift({ clave, texto }); break; }
      MAPA.geo.set(clave, pos);
      const a = me();
      if(a.live && Cloud.client) Cloud.client.from("geo_lugares").upsert({ alma_id: a.almaId, q: clave, lat: pos ? pos[0] : null, lng: pos ? pos[1] : null, label }, { onConflict: "alma_id,q" }).then(() => {}, () => {});
      dshMapaPintar();
      await new Promise(r => setTimeout(r, 1100));
    }
  } finally { MAPA.trabajando = false; }
}

/* Lo que va al mapa con los filtros puestos. */
function dshMapaDatos(a){
  const f = MAPA.f, q = deburr(f.q || "").split(" ").filter(Boolean);
  const proys = (a.projects || []).map((p, i) => ({ p, i })).filter(({ p }) =>
    (!f.grupo || dshGrupo(p) === f.grupo) && (!f.cliente || String(p.client || "").trim() === f.cliente) &&
    (!q.length || q.every(w => projectSearchText(p).includes(w))));
  const lugares = new Map(), sin = [], buscando = [];
  const meter = (texto, pos, item) => {
    const k = dshLugarClave(texto) + "@" + pos[0].toFixed(3) + "," + pos[1].toFixed(3);
    if(!lugares.has(k)) lugares.set(k, { k, texto, pos, proys: [], leads: [] });
    (item.lead ? lugares.get(k).leads : lugares.get(k).proys).push(item);
  };
  if(f.capa !== "leads") proys.forEach(x => {
    const texto = dshLugarTexto(x.p.comuna, x.p.city);
    if(!texto){ sin.push(x); return; }
    const pos = dshCoords(texto);
    if(pos === undefined) buscando.push(x); else if(!pos) sin.push(x); else meter(texto, pos, x);
  });
  let leadsN = 0;
  if(f.capa !== "proyectos" && typeof CC !== "undefined" && Array.isArray(CC.leads)) CC.leads.filter(l => l.status !== "descartado" && l.city &&
      (!q.length || q.every(w => leadTexto(l).includes(w)))).forEach(l => {
    const pos = dshCoords(l.city); if(pos){ leadsN++; meter(l.city, pos, { lead: l }); }
  });
  return { proys, lugares: [...lugares.values()].sort((x, y) => (y.proys.length + y.leads.length) - (x.proys.length + x.leads.length)), sin, buscando, leadsN };
}
function dshMapaFiltrosHTML(a, compacto){
  const f = MAPA.f, ps = a.projects || [];
  const cnt = g => ps.filter(p => dshGrupo(p) === g).length;
  const clientes = [...new Set(ps.map(p => String(p.client || "").trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y, "es"));
  const hayLeads = typeof CC !== "undefined" && Array.isArray(CC.leads) && CC.leads.length;
  const chip = (v, t, col, n) => `<button class="dsh-chip ${f.grupo === v ? "on" : ""}" data-dshgrupo="${v}">${col ? `<i style="background:${col}"></i>` : ""}${t}${n != null ? `<span>${n}</span>` : ""}</button>`;
  const filtrado = f.cliente || f.q || f.capa !== "proyectos";
  return `<div class="dsh-chips">${chip("", "Todos", "", ps.length)}${DSH_GRUPOS.map(g => chip(g[0], g[1], g[2], cnt(g[0]))).join("")}${compacto && filtrado ? `<button class="ld-clear" data-dshlimpiar>Quitar filtros${f.cliente ? " (" + esc(f.cliente) + ")" : ""}</button>` : ""}</div>
    ${compacto ? "" : `<div class="dsh-map-sel">
      ${hayLeads ? `<div class="dsh-seg" role="group" aria-label="Qué mostrar">${[["proyectos", "Proyectos"], ["ambos", "Ambos"], ["leads", "Clientes potenciales"]].map(([k, t]) => `<button class="${f.capa === k ? "on" : ""}" data-dshcapa="${k}">${t}</button>`).join("")}</div>` : ""}
      <select class="ld-sel ${f.cliente ? "on" : ""}" data-dshcliente aria-label="Cliente"><option value="">Todos los clientes</option>${clientes.map(c => `<option value="${esc(c)}" ${c === f.cliente ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <label class="dsh-map-q"><span aria-hidden="true">⌕</span><input data-dshq type="search" placeholder="Buscar proyecto, comuna…" value="${esc(f.q)}" autocomplete="off"></label>
      ${(f.grupo || f.cliente || f.q || f.capa !== "proyectos") ? `<button class="ld-clear" data-dshlimpiar>Quitar filtros</button>` : ""}
    </div>`}`;
}
function dshMapaHTML(a, opts){
  const compacto = !!(opts && opts.compacto);
  return `<div class="card s12 dsh-map-card ${compacto ? "is-compact" : ""}">
    <div class="section-title"><h2>Mapa de proyectos</h2><span class="dsh-map-count" id="dshMapCount"></span><div class="spacer"></div>
      ${compacto ? `<button class="btn ghost sm" data-go="taller">Mapa completo →</button>` : ""}</div>
    <div id="dshMapF" class="dsh-map-f">${dshMapaFiltrosHTML(a, compacto)}</div>
    <div class="dsh-map-wrap">
      <div class="dsh-map-box"><div id="dshMap" class="dsh-map" aria-label="Mapa de Chile con tus proyectos"><div class="dsh-map-load"><span class="ld-spin"></span>Cargando mapa…</div></div>
        <div class="dsh-map-legend">${DSH_GRUPOS.map(g => `<span><i style="background:${g[2]}"></i>${g[1]}</span>`).join("")}${MAPA.f.capa !== "proyectos" ? `<span><i class="is-lead"></i>Clientes potenciales</span>` : ""}</div></div>
      ${compacto ? "" : `<aside class="dsh-map-side" id="dshMapSide"></aside>`}
    </div>
  </div>`;
}
function dshLeaflet(){
  if(window.L && window.L.map) return Promise.resolve(window.L);
  if(MAPA.cargando) return MAPA.cargando;
  MAPA.cargando = new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    css.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="; css.crossOrigin = ""; document.head.appendChild(css);
    const s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="; s.crossOrigin = "";
    s.onload = () => res(window.L); s.onerror = () => { MAPA.cargando = null; rej(new Error("No se pudo cargar el mapa")); };
    document.head.appendChild(s);
  });
  return MAPA.cargando;
}
function dshEnPanel(){ return state.view === "taller" || (state.view === "mialma" && (state.almaTab || "resumen") === "resumen"); }
/* Se llama después de cada dibujo de la pantalla. */
function dshMapaMontar(){
  const el = document.getElementById("dshMap"); if(!el) return;
  if(MAPA.inst && MAPA.inst.getContainer() === el) return;
  dshLeaflet().then(L => {
    if(!el.isConnected) return;
    if(MAPA.inst){ try{ MAPA.inst.remove(); }catch(e){} MAPA.inst = null; }
    el.innerHTML = "";
    const m = L.map(el, { zoomControl: true, zoomSnap: 0.25, scrollWheelZoom: false, attributionControl: true, minZoom: 3, maxBounds: [[-60, -100], [-10, -50]] });
    /* Teselas de OpenStreetMap (libres, sin clave); el gris lo pone el CSS. */
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(m);
    m.on("click focus", () => m.scrollWheelZoom.enable());
    m.on("mouseout", () => m.scrollWheelZoom.disable());
    MAPA.inst = m; MAPA.capa = L.layerGroup().addTo(m); MAPA.ajustado = "";
    m.fitBounds([[-41.8, -74.2], [-18.3, -68.9]]);
    dshMapaPintar(true);
    /* La tarjeta todavía se está acomodando (entra con animación): se mide
       de nuevo y se encuadra con el tamaño real. */
    setTimeout(() => { if(MAPA.inst !== m) return; m.invalidateSize(); dshMapaPintar(true); }, 350);
    dshGeoCargar().then(() => dshMapaPintar());
  }).catch(err => { el.innerHTML = `<div class="dsh-map-load">${esc(err.message || "No se pudo cargar el mapa")}. <button class="btn ghost sm" data-dshmapretry>Reintentar</button></div>`; });
}
/* Dibuja marcadores, lista y contadores sin rehacer la pantalla. */
function dshMapaPintar(ajustar){
  const a = me(), d = dshMapaDatos(a);
  const cnt = document.getElementById("dshMapCount");
  if(cnt){
    const n = d.lugares.reduce((t, l) => t + l.proys.length, 0);
    cnt.textContent = [MAPA.f.capa !== "leads" ? `${n} proyecto${n === 1 ? "" : "s"} en ${d.lugares.filter(l => l.proys.length).length} lugar${d.lugares.filter(l => l.proys.length).length === 1 ? "" : "es"}` : "",
                       d.leadsN ? `${d.leadsN} cliente${d.leadsN === 1 ? "" : "s"} potencial${d.leadsN === 1 ? "" : "es"}` : "",
                       d.buscando.length ? `ubicando ${d.buscando.length}…` : ""].filter(Boolean).join(" · ");
  }
  const side = document.getElementById("dshMapSide");
  if(side){
    const fila = l => {
      const g = {}; l.proys.forEach(x => { const k = dshGrupo(x.p); g[k] = (g[k] || 0) + 1; });
      const monto = l.proys.reduce((t, x) => t + (+x.p.budget || 0), 0);
      return `<button class="dsh-place" data-dshlugar="${esc(l.k)}"><span class="dsh-place-dots">${DSH_GRUPOS.filter(x => g[x[0]]).map(x => `<i style="background:${x[2]}" title="${esc(x[1])}"></i>`).join("")}${l.leads.length ? `<i class="is-lead" title="Clientes potenciales"></i>` : ""}</span>
        <span class="grow"><b>${esc(l.texto)}</b><small>${[l.proys.length ? l.proys.length + " proyecto" + (l.proys.length === 1 ? "" : "s") : "", l.leads.length ? l.leads.length + " potencial" + (l.leads.length === 1 ? "" : "es") : ""].filter(Boolean).join(" · ")}</small></span>
        ${monto ? `<span class="dsh-place-m">${dshCorto(monto)}</span>` : ""}</button>`;
    };
    side.innerHTML = `<div class="dsh-side-h">Lugares <span>${d.lugares.length}</span></div>
      <div class="dsh-places">${d.lugares.map(fila).join("") || `<p class="muted" style="font-size:13px;margin:6px 4px">${d.buscando.length ? "Ubicando tus proyectos en el mapa…" : "Nada con estos filtros."}</p>`}</div>
      ${d.sin.length ? `<details class="dsh-sin"><summary>${d.sin.length} sin ubicación</summary><p>Escribe la comuna y la ciudad en el proyecto para verlo en el mapa.</p>
        ${d.sin.slice(0, 12).map(x => `<button class="dsh-sin-row" data-projgo="${x.i}"><b>${esc(x.p.t)}</b><small>${esc(dshLugarTexto(x.p.comuna, x.p.city) || "Sin comuna ni ciudad")}</small></button>`).join("")}</details>` : ""}`;
  }
  if(!MAPA.inst || !window.L) return;
  const L = window.L, m = MAPA.inst; MAPA.capa.clearLayers(); MAPA.marcas = new Map();
  const todos = [];
  d.lugares.forEach(l => {
    const grupos = DSH_GRUPOS.map(g => [g, l.proys.filter(x => dshGrupo(x.p) === g[0])]).filter(x => x[1].length);
    const capas = grupos.map(([g, xs]) => ({ col: g[2], n: xs.length, t: g[1] }));
    if(l.leads.length) capas.push({ col: DSH_LEAD_COLOR, n: l.leads.length, t: "Clientes potenciales", lead: true });
    const popup = `<div class="dsh-pop"><b>${esc(l.texto)}</b>
      ${l.proys.map(x => `<button data-projgo="${x.i}"><span class="dsh-dot" style="background:${DSH_ETAPA[flowOf(x.p.st)]}"></span><span><b>${esc(x.p.t)}</b><small>${esc([flowOf(x.p.st), x.p.client, +x.p.budget ? money(+x.p.budget) : ""].filter(Boolean).join(" · "))}</small></span></button>`).join("")}
      ${l.leads.slice(0, 8).map(x => `<button data-dshlead="${esc(x.lead.id)}"><span class="dsh-dot is-lead"></span><span><b>${esc(typeof leadNombre === "function" ? leadNombre(x.lead) : x.lead.full_name || "Solicitud")}</b><small>Cliente potencial · ${esc((LEAD_ESTADOS[x.lead.status] || {}).t || "")}</small></span></button>`).join("")}
      ${l.leads.length > 8 ? `<small class="muted">y ${l.leads.length - 8} más</small>` : ""}</div>`;
    const marcas = capas.map((c, i) => {
      /* Varios grupos en el mismo lugar se separan apenas para verse todos. */
      const off = capas.length > 1 ? 0.012 * Math.pow(2, Math.max(0, 9 - m.getZoom()) / 2) : 0, ang = i / capas.length * Math.PI * 2;
      const pos = [l.pos[0] + off * Math.sin(ang), l.pos[1] + off * Math.cos(ang)];
      todos.push(pos);
      const mk = L.circleMarker(pos, c.lead
        ? { radius: 6 + Math.sqrt(c.n) * 2.4, color: DSH_LEAD_COLOR, weight: 2, fillColor: "#ffffff", fillOpacity: .9, dashArray: "3 2" }
        : { radius: 6 + Math.sqrt(c.n) * 3, color: "#ffffff", weight: 2, fillColor: c.col, fillOpacity: .92 });
      mk.bindTooltip(`<b>${esc(l.texto)}</b><br>${c.n} · ${esc(c.t)}`, { direction: "top", offset: [0, -6], className: "dsh-ltip" });
      mk.bindPopup(popup, { maxWidth: 300, className: "dsh-lpop" });
      mk.addTo(MAPA.capa);
      return mk;
    });
    MAPA.marcas.set(l.k, marcas);
  });
  const firma = JSON.stringify(MAPA.f) + "|" + d.lugares.length;
  if((ajustar || MAPA.ajustado !== firma) && todos.length){
    m.fitBounds(L.latLngBounds(todos).pad(0.15), { maxZoom: 11, animate: !ajustar });
  }
  MAPA.ajustado = firma;
}
function dshMapaRefrescarFiltros(){
  const box = document.getElementById("dshMapF"); if(!box) return;
  const compacto = !!document.querySelector(".dsh-map-card.is-compact");
  const foco = document.activeElement && document.activeElement.matches && document.activeElement.matches("[data-dshq]");
  if(!foco) box.innerHTML = dshMapaFiltrosHTML(me(), compacto);
  dshMapaPintar();
}
document.addEventListener("click", e => {
  const t = e.target; if(!t.closest) return;
  const g = t.closest("[data-dshgrupo]"); if(g){ MAPA.f.grupo = MAPA.f.grupo === g.dataset.dshgrupo ? "" : g.dataset.dshgrupo; dshMapaRefrescarFiltros(); return; }
  const c = t.closest("[data-dshcapa]"); if(c){ MAPA.f.capa = c.dataset.dshcapa; renderView(); return; }
  if(t.closest("[data-dshlimpiar]")){ MAPA.f = { capa: "proyectos", grupo: "", cliente: "", q: "" }; renderView(); return; }
  if(t.closest("[data-dshmapretry]")){ dshMapaMontar(); return; }
  const lg = t.closest("[data-dshlugar]"); if(lg){ const ms = MAPA.marcas.get(lg.dataset.dshlugar); if(ms && ms[0] && MAPA.inst){
      MAPA.inst.flyTo(ms[0].getLatLng(), Math.max(MAPA.inst.getZoom(), 11), { duration: .6 }); setTimeout(() => ms[0].openPopup(), 650);
      document.getElementById("dshMap").scrollIntoView({ block: "nearest", behavior: "smooth" }); } return; }
  const ld = t.closest("[data-dshlead]"); if(ld){ go("centro"); setTimeout(() => CC_open(ld.dataset.dshlead), 0); return; }
  const cg = t.closest("[data-dshcliente-go]"); if(cg){ MAPA.f.cliente = cg.dataset.dshclienteGo; MAPA.f.capa = "proyectos"; renderView();
    requestAnimationFrame(() => { const el = document.querySelector(".dsh-map-card"); if(el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }); return; }
});
document.addEventListener("change", e => { const s = e.target.closest && e.target.closest("[data-dshcliente]"); if(s){ MAPA.f.cliente = s.value; dshMapaRefrescarFiltros(); } });
document.addEventListener("input", e => { const s = e.target.closest && e.target.closest("[data-dshq]"); if(s){ MAPA.f.q = s.value; clearTimeout(dshMapaRefrescarFiltros._t); dshMapaRefrescarFiltros._t = setTimeout(dshMapaPintar, 160); } });

/* ===========================================================
   NÚCLEO (Mi Alma → Resumen)
   =========================================================== */
function vAlmaResumen(a){
  const cfg = getCfg(a);
  const TERM = ["Entregado", "Cerrado", "Terminado"];
  const projects = a.projects || [];
  const activos = projects.filter(p => !TERM.includes(p.st) && !projectArchived(p));
  const enProd = activos.filter(p => ["En producción", "Revisión"].includes(flowOf(p.st)));
  const inc = rootIncome(a), exp = a.finance.expense || [];
  const meses = dshMeses(7), porMes = dshPorMes(inc, exp);
  const mI = k => (porMes[k] || {}).i || 0, mE = k => (porMes[k] || {}).e || 0;
  const kAct = meses[6], kAnt = meses[5];
  /* El mes en curso se compara con el mismo tramo del mes anterior (del 1
     al día de hoy): contra el mes completo, cada inicio de mes «cae» 100%. */
  const diaHoy = new Date().getDate();
  const hastaHoy = x => { const m = String(x.on || "").match(/^\d{4}-\d{2}-(\d{2})/); return !m || +m[1] <= diaHoy; };
  const cobradoMes = mI(kAct), cobradoAnt = inc.filter(x => finMonthKey(x) === kAnt && hastaHoy(x)).reduce((t, x) => t + (+x.a || 0), 0);
  /* Por cobrar: todo lo aprobado que no se ha cerrado, entregado incluido (lo
     mismo que cuenta el Resumen del Taller). */
  const aprob = projects.filter(p => projectAprobado(p) && !projectClosed(p));
  const saldo = aprob.reduce((t, p) => t + projectMoney(p).balance, 0), conSaldo = aprob.filter(p => projectMoney(p).balance > 0).length;
  const cot = projects.filter(p => flowOf(p.st) === "Cotizando" && !projectArchived(p)), enCot = cot.reduce((t, p) => t + projectMoney(p).budget, 0);
  const ganAnio = (() => { const y = String(new Date().getFullYear()); return Object.entries(porMes).filter(([k]) => k.startsWith(y)).reduce((t, [, v]) => t + v.i - v.e, 0); })();
  const entregas = activos.filter(p => { const n = dshDias(p.due); return n != null && n <= 30; }).sort((x, y) => String(x.due).localeCompare(String(y.due)));
  const urgentes = entregas.filter(p => dshDias(p.due) <= 14).length;

  const createCTA = (!a.live && Cloud.enabled) ? `<div class="card s12" style="background:linear-gradient(145deg,rgba(208,170,99,.16),rgba(255,255,255,.7))">
      <span class="pill gold">Estás viendo una Alma de muestra</span>
      <p style="margin:8px 0 0">Entra a tu Alma o crea una nueva para construir tu trayectoria real y aparecer en la constelación.</p>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="enterAlmaBtn">Entrar</button><button class="btn secondary" id="createAlmaBtn">✦ Crear mi Alma</button></div></div>` : ``;
  const onboarding = (a.live && a.memories.length === 0 && projects.length === 0) ? `<div class="card s12" style="background:linear-gradient(145deg,rgba(208,170,99,.14),rgba(255,255,255,.7))">
      <span class="pill gold">Bienvenida, Alma nueva</span>
      <p style="margin:8px 0 0">Empieza por <b>Identidad</b>: pon tu foto y datos. Luego crea tu primer trabajo o memoria. Cada acción da Esencia.</p>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn sm" data-tab="identidad">✎ Completar identidad</button>
        <button class="btn secondary sm" data-add="proyecto">+ Primer trabajo</button></div></div>` : ``;

  const delta = (x, y) => y ? Math.round((x - y) / Math.abs(y) * 100) : (x ? 100 : 0);
  const kpis = cfg.cards.kpis !== false ? `
    ${dshKpi({ ico: "✦", lbl: "Cobrado en " + dshMesNombre(kAct).toLowerCase(), val: money(cobradoMes), tone: "ok", go: "finanzas",
      delta: (cobradoMes || cobradoAnt) ? { v: delta(cobradoMes, cobradoAnt), bueno: true, txt: "vs 1–" + diaHoy + " " + dshMesNombre(kAnt).toLowerCase() } : null, sub: (cobradoMes || cobradoAnt) ? "" : "sin abonos este mes ni el anterior a esta fecha", spark: dshSpark(meses.map(mI), "#2a78d6") })}
    ${dshKpi({ ico: "◔", lbl: "Por cobrar", val: money(saldo), tone: saldo > 0 ? "warn" : "", go: "proyectos", sub: conSaldo ? `en ${conSaldo} trabajo${conSaldo === 1 ? "" : "s"} con saldo` : "todo al día" })}
    ${dshKpi({ ico: "₵", lbl: "En cotización", val: money(enCot), go: "proyectos", sub: `${cot.length} propuesta${cot.length === 1 ? "" : "s"} esperando respuesta` })}
    ${dshKpi({ ico: "◷", lbl: "Trabajos activos", val: String(activos.length), go: "proyectos", sub: `${enProd.length} en producción · ${urgentes} entrega${urgentes === 1 ? "" : "s"} ≤ 14 días`, tone: urgentes ? "" : "" })}` : ``;

  const graf = cfg.cards.graficos !== false ? `<div class="card s8 dsh-card">
      <div class="section-title"><h2>Raíz · últimos 12 meses</h2><div class="spacer"></div><span class="dsh-badge">Ganancia ${new Date().getFullYear()}: <b>${dshCorto(ganAnio)}</b></span><button class="btn ghost sm" data-go="finanzas">Ver Raíz →</button></div>
      ${dshBarrasMes(inc, exp, dshMeses(12))}</div>` : ``;
  const etapas = `<div class="card s4 dsh-card"><div class="section-title"><h2>Flujo de trabajos</h2><div class="spacer"></div><button class="btn ghost sm" data-go="proyectos">Ver →</button></div>${dshEtapas(projects.filter(p => !projectArchived(p) || projectClosed(p)), true)}</div>`;

  /* Trabajos en curso: primero lo que vence, luego lo más avanzado. */
  const now = Date.now(), dueMs = p => { const t = p.due ? new Date(p.due).getTime() : NaN; return isNaN(t) ? Infinity : t; };
  const stRank = { "En producción":0, "Revisión":1, "Aprobado":2, "Cotizando":3 };
  const cur = activos.slice().sort((x, y) => (dueMs(x) - dueMs(y)) || ((stRank[flowOf(x.st)] ?? 4) - (stRank[flowOf(y.st)] ?? 4))).slice(0, 6);
  const trabajos = `<div class="card s7 dsh-card"><div class="section-title"><h2>Trabajos en curso</h2><div class="spacer"></div><button class="btn ghost sm" data-go="proyectos">Ver todos →</button></div>
      ${cur.map(p => { const i = projects.indexOf(p), f = projectMoney(p), pc = clampPct(p.pct), late = p.due && dueMs(p) < now - 864e5;
        return `<div class="dsh-job" data-projgo="${i}" tabindex="0">
          <span class="dsh-job-c" style="background:${DSH_ETAPA[flowOf(p.st)]}"></span>
          <div class="grow"><b>${esc(p.t)}</b><small>${esc([p.client || "Sin vínculo", projectLocation(p)].filter(Boolean).join(" · "))}</small></div>
          <div class="dsh-job-m">${f.budget ? `<b>${money(f.budget)}</b><small class="${f.balance > 0 ? "is-due" : "is-ok"}">${f.balance > 0 ? "saldo " + money(f.balance) : "pagado"}</small>` : `<small>${esc(flowOf(p.st))}</small>`}</div>
          <div class="dsh-job-p"><span class="dsh-ring" style="--p:${pc};--c:${DSH_ETAPA[flowOf(p.st)]}"><i>${pc}%</i></span><small class="${late ? "nc-late" : "muted"}">${p.due ? (late ? "⚠ " : "") + esc(tallerDate(p.due)) : esc(flowOf(p.st))}</small></div>
        </div>`; }).join("") || `<div class="dsh-empty">Sin trabajos activos. Crea el primero con ＋.</div>`}
      <div style="margin-top:12px"><button class="btn sm" data-add="proyecto">＋ Nuevo trabajo</button></div></div>`;
  const prox = `<div class="card s5 dsh-card"><div class="section-title"><h2>Próximas entregas</h2><div class="spacer"></div><span class="dsh-badge">30 días</span></div>${dshEntregas(a, entregas, 6)}</div>`;

  const mapa = cfg.cards.mapa !== false && projects.length ? dshMapaHTML(a, { compacto: true }) : "";

  const todayKey = isoDay(new Date());
  const agToday = (a.agenda || []).map((x, i) => ({ x, i })).filter(o => !o.x.date || o.x.date === todayKey);
  const pendTasks = (a.tasks || []).map((t, i) => ({ t, i })).filter(x => !["Finalizada", "Archivada"].includes(x.t.st || "Pendiente"));
  const prOrder = { "Urgente":0, "Alta":1, "Media":2, "Baja":3 };
  const topTasks = pendTasks.slice().sort((x, y) => (prOrder[x.t.pr] ?? 2) - (prOrder[y.t.pr] ?? 2)).slice(0, 4);
  const leads = (typeof vCentro === "function" && planAllows("centro")) ? `<div class="card s4 dsh-card"><div class="section-title"><h2>Clientes potenciales</h2><div class="spacer"></div><button class="btn ghost sm" data-go="centro">Ver →</button></div>${dshEmbudoLeads("", "")}</div>` : "";
  const hoy = cfg.cards.hoy !== false ? `<div class="card ${leads ? "s4" : "s6"} dsh-card"><div class="section-title"><h2>Hoy</h2><div class="spacer"></div><button class="btn sm" data-add="cita">+ Cita</button></div>
      ${agToday.map(({ x, i }) => `<div class="row"><b style="color:var(--gold);width:60px">${esc(x.h)}</b><div class="grow">${esc(x.t)}</div>${acts("cita", i)}</div>`).join("") || `<div class="dsh-empty">Sin agenda hoy.</div>`}</div>` : ``;
  const tareas = cfg.cards.hoy !== false ? `<div class="card ${leads ? "s4" : "s6"} dsh-card"><div class="section-title"><h2>Tareas pendientes</h2><div class="spacer"></div><span class="pill">${pendTasks.length}</span><button class="btn ghost sm" data-go="tareas">Ver →</button></div>
      ${topTasks.map(({ t, i }) => `<div class="tk-row"><button class="tk-check" data-tdone="${i}" title="Marcar finalizada"></button><span class="tk-prio ${taskPrioClass(t.pr)}" title="${esc(t.pr || "Media")}"></span><div class="grow"><b>${esc(t.t)}</b>${t.due ? `<br><small class="muted">⌛ ${esc(tallerDate(t.due))}</small>` : ""}</div></div>`).join("") || `<div class="dsh-empty">Nada pendiente. ✨</div>`}
      <div style="margin-top:12px"><button class="btn sm" data-add="tarea">＋ Nueva tarea</button></div></div>` : ``;
  const memoria = cfg.cards.memoria !== false ? `<div class="card s12 dsh-memo"><span class="dsh-kpi-ico" aria-hidden="true">✦</span>
      ${a.memories[0] ? `<div class="grow"><small>Última memoria</small><b>${esc(a.memories[0].t)}</b>${a.memories[0].d ? `<span class="muted">${esc(a.memories[0].d)}</span>` : ""}</div>` : `<div class="grow"><small>Memorias</small><span class="muted">Aún no hay memorias.</span></div>`}
      <button class="btn ghost sm" data-go="memoria">Ver memorias →</button><button class="btn sm" data-add="memoria">+ Memoria</button></div>` : ``;
  const led = esenciaLedger(a);
  const esencia = cfg.cards.esencia !== false ? `<div class="card s12 esencia-mini">
      <span class="pixel-font" style="font-size:9px;color:#7b5920">✦ ${(a.xp || 0).toLocaleString("es-CL")} ESENCIA</span>
      <small class="muted" style="font-size:11px">${led.length ? esc(esenciaResumen(led.slice(0, 3))) : "tu primera acción la enciende"}</small>
      <div class="spacer"></div>
      <button class="btn ghost sm" id="esenciaInfoCard">Ver mi actividad →</button>
    </div>` : ``;
  return `${createCTA}${onboarding}${kpis}${graf}${etapas}${trabajos}${prox}${mapa}${leads}${hoy}${tareas}${memoria}${esencia}`;
}

/* ===========================================================
   TALLER → Resumen
   =========================================================== */
function vTaller(a){
  const nameFirst = (a.name || "Alma").split(" ")[0];
  const TERM = ["Entregado", "Cerrado", "Terminado"];
  /* Con tramo, cada cifra cuenta por SU propia fecha y lo dice. */
  const per = state.tallerPeriod || {}, D = per.desde || "", H = per.hasta || "";
  const ranged = !!(D || H), inPer = iso => inRange(iso, D, H);

  const allProjects = a.projects || [];
  const projects = ranged ? allProjects.filter(p => inPer(projectDate(p, "created"))) : allProjects;
  const active = projects.filter(p => !TERM.includes(p.st) && !projectArchived(p));
  const allClients = a.clients || [];
  const clients = ranged ? allClients.filter(c => inPer(c.created)) : allClients;
  const allQuotes = a.live ? (state.cloudQuotes || []) : (typeof loadQuotes === "function" ? loadQuotes(a) : []);
  const quotes = ranged ? allQuotes.filter(q => inPer(q.created_at || q.date)) : allQuotes;

  const incAll = rootIncome(a), expAll = a.finance.expense || [];
  const incL = ranged ? incAll.filter(x => finInRange(x, D, H)) : incAll;
  const expL = ranged ? expAll.filter(x => finInRange(x, D, H)) : expAll;
  const inc = sum(incL), exp = sum(expL), gan = inc - exp;

  const now = Date.now(), soon = now + 30 * 864e5;
  const upcoming = ranged
    ? allProjects.filter(p => !TERM.includes(p.st) && inPer(p.due)).sort((x, y) => String(x.due).localeCompare(String(y.due)))
    : allProjects.filter(p => !TERM.includes(p.st) && !projectArchived(p) && p.due && !isNaN(new Date(p.due)) && new Date(p.due).getTime() <= soon).sort((x, y) => String(x.due).localeCompare(String(y.due)));

  const aprob = projects.filter(p => projectAprobado(p) && !projectClosed(p));
  const saldo = aprob.reduce((t, p) => t + projectMoney(p).balance, 0);
  const cot = projects.filter(p => flowOf(p.st) === "Cotizando" && !projectArchived(p)), enCot = cot.reduce((t, p) => t + projectMoney(p).budget, 0);
  const decididos = projects.filter(p => flowOf(p.st) !== "Cotizando"), cierre = dshPct(decididos.length, projects.length);
  const ticket = decididos.length ? decididos.reduce((t, p) => t + projectMoney(p).budget, 0) / decididos.length : 0;
  const meses12 = dshMeses(12), porMes = dshPorMes(incAll, expAll);
  const sI = meses12.map(k => (porMes[k] || {}).i || 0), sE = meses12.map(k => (porMes[k] || {}).e || 0), sG = meses12.map((k, i) => sI[i] - sE[i]);

  const hero = `<div class="card s12 tl-hero dsh-hero">
      <div class="dsh-hero-top"><div><span class="dsh-eyebrow">${esc(new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" }))}</span>
        <h2 class="tl-greet">${tallerSaludo()}, ${esc(nameFirst)}.</h2></div>
        <div class="dsh-hero-acts"><button class="btn sm" data-add="proyecto">＋ Proyecto</button><button class="btn ghost sm" data-go="cotizador">₵ Cotizar</button><button class="btn ghost sm" data-add="cliente">☺ Vínculo</button></div></div>
      ${periodBar("tl", D, H)}
      <div class="tl-today"><span class="tl-today-lbl">${ranged ? "En el tramo" : "Hoy tienes"}</span>
        <span class="tl-chip"><b>${active.length}</b> Proyectos activos</span>
        <span class="tl-chip"><b>${quotes.length}</b> ${quotes.length === 1 ? "Cotización" : "Cotizaciones"}</span>
        <span class="tl-chip"><b>${upcoming.length}</b> Entregas${ranged ? "" : " en 30 días"}</span>
        <span class="tl-chip"><b>${clients.length}</b> Vínculos${ranged ? " nuevos" : ""}</span>
      </div>
      ${ranged ? `<p class="tl-range">Resumen ${esc(periodWords(D, H))}. Cada cifra cuenta por su propia fecha: proyectos por creación, Raíz por fecha del movimiento, agenda y tareas por su día.</p>` : ""}</div>`;

  const k = (o) => dshKpi(Object.assign({ cls: "dsh-kpi-s" }, o));
  const kpis = `<div class="dsh-kpis s12">
    ${k({ ico: "✦", lbl: "Abonos y pagos", val: dshCorto(inc), tone: "ok", go: "finanzas", sub: ranged ? "en el tramo" : "en total", spark: ranged ? "" : dshSpark(sI, "#2a78d6") })}
    ${k({ ico: "↘", lbl: "Egresos", val: dshCorto(exp), go: "finanzas", sub: ranged ? "en el tramo" : "en total", spark: ranged ? "" : dshSpark(sE, "#eb6834") })}
    ${k({ ico: "◆", lbl: "Ganancia", val: dshCorto(gan), tone: gan >= 0 ? "" : "bad", go: "finanzas", sub: inc ? `margen ${dshPct(gan, inc)}%` : "", spark: ranged ? "" : dshSpark(sG, "#4a3aa7") })}
    ${k({ ico: "◔", lbl: "Por cobrar", val: dshCorto(saldo), tone: saldo > 0 ? "warn" : "", go: "proyectos", sub: `${aprob.filter(p => projectMoney(p).balance > 0).length} con saldo` })}
    ${k({ ico: "₵", lbl: "En cotización", val: dshCorto(enCot), go: "proyectos", sub: `${cot.length} propuesta${cot.length === 1 ? "" : "s"}` })}
    ${k({ ico: "✓", lbl: "Tasa de cierre", val: cierre + "%", go: "proyectos", sub: ticket ? `ticket ${dshCorto(ticket)}` : `${decididos.length} de ${projects.length}` })}
  </div>`;

  const graf = `<div class="card s8 dsh-card"><div class="section-title"><h2>Raíz ${ranged ? "por mes" : "· últimos 12 meses"}</h2><div class="spacer"></div><button class="btn ghost sm" data-go="finanzas">Ver Raíz →</button></div>${dshBarrasMes(incL, expL, dshMesesDe(D, H))}</div>`;
  const etapas = `<div class="card s4 dsh-card"><div class="section-title"><h2>Proyectos por etapa</h2><div class="spacer"></div><button class="btn ghost sm" data-go="proyectos">Ver →</button></div>${dshEtapas(projects, true)}</div>`;
  const mapa = dshMapaHTML(a, {});
  const prox = `<div class="card s6 dsh-card"><div class="section-title"><h2>Entregas ${ranged ? "en el tramo" : "próximas"}</h2><div class="spacer"></div><span class="dsh-badge">${upcoming.length}</span></div>${dshEntregas(a, upcoming, 6)}</div>`;
  const top = `<div class="card s6 dsh-card"><div class="section-title"><h2>Clientes que más encargan</h2><div class="spacer"></div><button class="btn ghost sm" data-go="clientes">Vínculos →</button></div>${dshTopClientes(projects)}</div>`;
  const leads = (typeof vCentro === "function" && planAllows("centro")) ? `<div class="card s4 dsh-card"><div class="section-title"><h2>Clientes potenciales</h2><div class="spacer"></div><button class="btn ghost sm" data-go="centro">Ver →</button></div>${dshEmbudoLeads(D, H)}</div>` : "";

  // AGENDA y TAREAS
  const todayKey = isoDay(new Date()), agAll = a.agenda || [], ag = ranged ? agAll.filter(x => inPer(x.date)) : agAll;
  const agProx = ag.filter(x => !x.date || x.date >= todayKey).sort((x, y) => String(x.date || todayKey).localeCompare(String(y.date || todayKey)) || String(x.h || "").localeCompare(String(y.h || ""))).slice(0, 4);
  const agenda = `<div class="card ${leads ? "s4" : "s6"} dsh-card"><div class="section-title"><h2>Agenda</h2><div class="spacer"></div><button class="btn ghost sm" data-go="agenda">Calendario →</button></div>
      ${agProx.map(x => { const n = x.date ? dshDias(x.date) : 0; return `<div class="dsh-ag"><span class="dsh-ag-d">${x.date ? esc(tallerDate(x.date)) : "Hoy"}</span><div class="grow"><b>${esc(x.t)}</b><small>${esc([x.h, dshCuando(n)].filter(Boolean).join(" · "))}</small></div></div>`; }).join("") || `<div class="dsh-empty">Agenda libre${ranged ? " en el tramo" : ""}.</div>`}
      <button class="btn secondary sm tl-cta" data-add="cita">＋ Nueva cita</button></div>`;
  const tasksAll = a.tasks || [], tasks = ranged ? tasksAll.filter(t => inPer(t.due)) : tasksAll;
  const tPend = tasks.filter(t => ["Pendiente", "En proceso", "Bloqueada"].includes(t.st || "Pendiente")).length;
  const tUrg = tasks.filter(t => (t.pr === "Urgente" || t.pr === "Alta") && t.st !== "Finalizada" && t.st !== "Archivada").length;
  const tDone = tasks.filter(t => t.st === "Finalizada").length, tTot = tPend + tDone;
  const tareas = `<div class="card ${leads ? "s4" : "s6"} dsh-card"><div class="section-title"><h2>Tareas</h2><div class="spacer"></div><button class="btn ghost sm" data-go="tareas">Ver →</button></div>
      <div class="dsh-mini-stats"><div><b>${tPend}</b><span>pendientes</span></div><div class="${tUrg ? "is-warn" : ""}"><b>${tUrg}</b><span>urgentes</span></div><div><b>${tDone}</b><span>completadas</span></div></div>
      <div class="dsh-progress" title="${dshPct(tDone, tTot)}% completadas"><span style="width:${dshPct(tDone, tTot)}%"></span></div><small class="muted">${tTot ? dshPct(tDone, tTot) + "% del total completado" : "Sin tareas" + (ranged ? " en el tramo" : "")}</small>
      <button class="btn secondary sm tl-cta" data-add="tarea">＋ Nueva tarea</button></div>`;

  // ACTIVIDAD reciente
  const acts = [];
  const recientes = incL.slice().sort((x, y) => String(y.on || y.d || "").localeCompare(String(x.on || x.d || ""))).slice(0, 3);
  recientes.forEach(x => acts.push(["✦", "Pago recibido", x.t, "+" + money(x.a)]));
  projects.slice().sort((x, y) => String(y.created || "").localeCompare(String(x.created || ""))).slice(0, 3).forEach(p => acts.push(["◷", "Proyecto · " + flowOf(p.st), p.t, ""]));
  clients.slice(0, 2).forEach(c => acts.push(["☺", "Vínculo", c.name, ""]));
  const activity = `<div class="card s12 dsh-card"><div class="section-title"><h2>Actividad reciente</h2></div>
      ${acts.length ? `<div class="dsh-act">${acts.slice(0, 8).map(x => `<div class="tl-act-row"><span class="tl-act-ico">${x[0]}</span><div class="grow"><b>${esc(x[1])}</b><br><small class="muted">${esc(x[2])}</small></div>${x[3] ? `<span class="amt in">${esc(x[3])}</span>` : ""}</div>`).join("")}</div>` : `<div class="dsh-empty">${ranged ? "Sin actividad registrada en el tramo." : "Tu actividad aparecerá aquí cuando empieces a crear."}</div>`}</div>`;

  return `<div class="grid dsh">${hero}${kpis}${graf}${etapas}${mapa}${prox}${top}${leads}${agenda}${tareas}${activity}</div>`;
}
