/* ===========================================================
   ANIMA Studio — App logic (Beta · Founding Era)
   Sistema vivo: Almas editables, niveles, módulos, LUMBRE,
   personalización y Cotizador. Local + nube (Supabase).
   =========================================================== */

const STORAGE = "anima_alpha_state_v2";

/* ---------- Estado ---------- */
let state = load();
function load(){
  try{ const s = JSON.parse(localStorage.getItem(STORAGE)); if(s && s.almas && s.almas.length) return s; }catch(e){}
  return { almas: JSON.parse(JSON.stringify(SEED_ALMAS)), currentId:"guest", view:"mialma", lumbreMode:"LOCAL", chat:[] };
}
function save(){ localStorage.setItem(STORAGE, JSON.stringify(state)); }
function reset(){ if(confirm("¿Restaurar ANIMA a las 10 Almas fundadoras? Se borrarán tus cambios locales.")){ localStorage.removeItem(STORAGE); location.reload(); } }

const me = () => state.almas.find(a => a.id === state.currentId) || state.almas[0];
const sum = arr => arr.reduce((t,x)=>t+x.a,0);
const esc = s => String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

/* ---------- Avatar ---------- */
function initials(name){ return (name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase(); }
function avatarHTML(a, cls=""){
  if(a.photo) return `<span class="avatar ${cls}" style="background-image:url('${esc(a.photo)}');background-size:cover;background-position:center"></span>`;
  return `<span class="avatar ${cls}" style="background:linear-gradient(145deg,${a.color},${shade(a.color,-22)})">${initials(a.name)}</span>`;
}
function shade(hex,p){ hex=hex||"#111111"; const n=parseInt(hex.slice(1),16); let r=(n>>16)+p,g=(n>>8&255)+p,b=(n&255)+p;
  r=Math.max(0,Math.min(255,r));g=Math.max(0,Math.min(255,g));b=Math.max(0,Math.min(255,b));
  return "#"+(0x1000000+(r<<16)+(g<<8)+b).toString(16).slice(1); }

/* ---------- Pixel art (solo el Camino del Alma) ---------- */
const LEVEL_SPRITES={
  FOUNDING:["....a....","....X....","..x.X.x..","...xXx...","XXXXaXXXX","...xXx...","..x.X.x..","....X....","....a...."],
  EMBER:["....X....","....X....","...xXx...","...xXx...","..xXaXx..","..xXaXx..","...xXx...","....X....","........."],
  ROOT:["...XaX...","....X....","..X.X.X..","..X.X.X..","...XXX...","..d.X.d..",".d..X..d.","d...d...d","........."],
  WILD:[".........",".X.....X.",".X.X.X.X.",".X.X.X.X.",".X.X.X.X.",".X.XaX.X.",".XXXXXXX.",".........","........."],
  TOTEM:[".X.X.X...",".........","...XXX...","..XXXXX..","..XXXXX..","..XXXXX..","...XXX...",".........","........."],
  AETHER:["..XXXXX..",".XdXXXdX.",".X.XaX.X.",".XdXXXdX.",".X.XaX.X.",".XdXXXdX.","..XXXXX..","...XXX...","........."],
  SPIRIT:["....a....",".x..X..x.","..xXXXx..",".xXXXXXx.","aXXXaXXXa",".xXXXXXx.","..xXXXx..",".x..X..x.","....a...."],
  ANIMA:["....a....","...XaX...","..XxxxX..",".XxxxxxX.","XxxxxxxxX",".XxxxxxX.","..XxxxX..","...XaX...","....a...."]
};
function pixelSprite(l){
  const pal={ X:l.color, x:shade(l.color,46), d:shade(l.color,-48), a:"#f5ecd2" };
  const g=LEVEL_SPRITES[l.key]||LEVEL_SPRITES.FOUNDING; let r="";
  g.forEach((row,y)=>{ [...row].forEach((ch,x)=>{ const c=pal[ch]; if(c) r+=`<rect x="${x}" y="${y}" width="1.04" height="1.04" fill="${c}"/>`; }); });
  return `<svg class="pix" viewBox="0 0 9 9" shape-rendering="crispEdges">${r}</svg>`;
}
const UNLOCKS={ FOUNDING:"Tu Alma, portafolio y memoria", EMBER:"Cotizador y Raíz", ROOT:"Vínculos y flujo de trabajo",
  WILD:"Publicar en la comunidad", TOTEM:"Crear o unirte a un Clan", AETHER:"Mentorías y Alma destacada",
  SPIRIT:"Academia: enseñar y cursos", ANIMA:"Santuario e IA conectada (LUMBRE)" };
function caminoPixelHTML(lp){
  const nx=lp.next; const falta=nx?Math.max(0,nx.xp-me().xp):0;
  return `<div class="camino">
    <div class="camino-head"><span class="pixel-font">TU CAMINO</span><div class="spacer" style="flex:1"></div>
      <button class="ia" id="levelsInfo" title="¿Qué son los niveles?">ⓘ</button></div>
    <div class="camino-track">${LEVELS.map((l,i)=>`<div class="ptile ${i===lp.idx?'cur':''} ${i<lp.idx?'passed':''}">
      <span class="pn pixel-font">${i+1}</span>${pixelSprite(l)}<b class="pixel-font">${l.label}</b></div>`).join("")}</div>
    <div class="camino-prog"><div class="bar"><span style="width:${lp.pct}%"></span></div>
      <small class="muted">${nx?`${lp.pct}% — faltan ${falta.toLocaleString("es-CL")} Esencia para <b>${nx.label}</b>`:"Alma Despierta · nivel máximo ∞"}</small></div>
  </div>`;
}
/* Qué REVELA cada nivel y a qué da acceso (coherente con la llegada progresiva). */
const LEVEL_OPENS = {
  FOUNDING:"Mi Alma — tu identidad y tu Esencia.",
  EMBER:"Mi Alma completa: Senda (Sueño y Semillas), Trayectoria, Portafolio, Cronología e Insignias.",
  ROOT:"Se revela el Taller: Proyectos, Vínculos y Agenda. Un proyecto enlaza su cliente, su plan de trabajo y tu Raíz (finanzas).",
  WILD:"Se revela el Mundo: la Constelación de Almas, el Árbol vivo y los Ecos.",
  TOTEM:"Se revela el Clan: crear junto a otras Almas — Panel, Plan de trabajo, Calendario y Proyectos compartidos.",
  AETHER:"LUMBRE más presente y automatizaciones: el sistema empieza a trabajar contigo.",
  SPIRIT:"Mentorías y legado: una Alma que guía a otras.",
  ANIMA:"El ecosistema completo. El Santuario despierta para albergar más Almas."
};
function openLevels(){
  document.getElementById("levelBody").innerHTML=
    `<p class="muted" style="font-size:13px">ANIMA se descubre de a poco: no verás todo de golpe. Cada morada se revela cuando estás listo — a tu ritmo, o al subir de nivel. Este es el mapa de lo que abre cada nivel y a qué da acceso.</p>`+
    LEVELS.map(l=>`<div class="row"><div style="width:40px">${pixelSprite(l)}</div><div class="grow"><b>${l.emoji} ${l.label}</b> <small class="muted">· ${l.xp.toLocaleString("es-CL")} Esencia</small><br><small class="muted">${LEVEL_OPENS[l.key]||UNLOCKS[l.key]||""}</small></div></div>`).join("");
  document.getElementById("levelModal").classList.add("open");
}
function closeLevels(){ document.getElementById("levelModal").classList.remove("open"); }

/* ---------- Personalización (mostrar/ocultar) ---------- */

/* ---------- Personalización (mostrar/ocultar) ---------- */
const cfgKey = a => "anima_cfg_"+(a.almaId||a.id);
function getCfg(a){
  const def={ modules:{trayectoria:true,portafolio:true,proyectos:true,finanzas:true,clientes:true,cotizador:true,agenda:true,memoria:true,biblioteca:true},
              cards:{constelacion:true,kpis:true,camino:true,graficos:true,hoy:true,memoria:true}, mapSize:"md" };
  try{ const c=JSON.parse(localStorage.getItem(cfgKey(a))); if(c){ return { modules:{...def.modules,...c.modules}, cards:{...def.cards,...c.cards}, mapSize:c.mapSize||def.mapSize }; } }catch(e){}
  return def;
}
function setCfg(a,c){ localStorage.setItem(cfgKey(a), JSON.stringify(c)); if(a.live){ Cloud.savePrefs(a.almaId,c).catch(()=>{}); } }
function toggleCfg(path){ const a=me(); const c=getCfg(a); const [g,k]=path.split(":"); c[g][k]=(c[g][k]===false); setCfg(a,c); renderAll(); }

/* ---------- Navegación (3 capas: secciones › reinos › módulos) ---------- */
const CREATOR_EMAIL = "sarkgraff@gmail.com";
let isCreator = false;   // se activa en refreshAuth si la sesión es del Creador

/* ===========================================================
   PLANES Y ROLES (Fase 4) — los umbrales cobran vida
   -----------------------------------------------------------
   PLAN  = qué partes de ANIMA ve un Alma (umbral contratado).
   ROL   = qué puede HACER dentro de su Clan/Santuario.
   El Creador (correo) está por encima de todo: ve y edita todo,
   y solo él ve Consola + Personalizar. Ninguna otra Alma las ve. */
const PLAN_TIERS = [["ALMA","◆ Alma"],["CLAN","❂ Clan"],["SANTUARIO","🜁 Santuario"]];
const PLAN_META = {
  ALMA:      { ico:"◆", t:"Alma",      sub:"Individual",        nivel:1 },
  CLAN:      { ico:"❂", t:"Clan",      sub:"Equipo (2–8)",      nivel:2 },
  SANTUARIO: { ico:"🜁", t:"Santuario", sub:"Organización (8+)", nivel:3 }
};
const PLAN_ORDER = ["ALMA","CLAN","SANTUARIO"];
/* Vistas que cada plan DESBLOQUEA por encima del espacio individual.
   El espacio individual (esencia + taller) y la Comunidad/constelación
   los tienen TODOS los planes — ANIMA es una comunidad de Almas.
   Clan y Santuario añaden herramientas de equipo y el panel de la organización. */
const PLAN_UNLOCKS = {
  ALMA:      [],
  CLAN:      ["clanpanel","equipo","calendario","proyectos_clan","recordatorios"],
  SANTUARIO: ["clanpanel","equipo","calendario","proyectos_clan","recordatorios","santuario"]
};
const GATED_VIEWS = ["clanpanel","equipo","calendario","proyectos_clan","recordatorios","santuario"]; // requieren plan (Comunidad NO se restringe)
const ROLES = [["MIEMBRO","Miembro"],["COLABORADOR","Colaborador"],["LIDER","Líder"],["ADMIN","Admin"]];
const ROLE_RANK = { MIEMBRO:1, COLABORADOR:2, LIDER:3, ADMIN:4, CREADOR:5 };
function roleRank(r){ return ROLE_RANK[r]||1; }
const ROLE_DESC = { MIEMBRO:"Solo visualiza lo del Clan", COLABORADOR:"Crea y edita tareas, eventos y proyectos", LIDER:"Gestiona miembros, roles y códigos", ADMIN:"Coordina varios Clanes del Santuario" };

function almaPlan(a){ return (a && PLAN_META[a.plan]) ? a.plan : "ALMA"; }
function almaRole(a){ if(isCreator && a===me()) return "CREADOR"; return (a && a.team_role) || "MIEMBRO"; }
/* Plan efectivo de la sesión: el Creador ve todo (SANTUARIO) salvo que
   esté previsualizando con "Ver como". El resto, su plan real. */
function effectivePlan(){
  if(state.viewAs) return state.viewAs;
  if(isCreator) return "SANTUARIO";
  return almaPlan(me());
}
function planAllows(view){
  if(!GATED_VIEWS.includes(view)) return true;            // espacio individual: todos
  return PLAN_UNLOCKS[effectivePlan()].includes(view);
}

/* ===========================================================
   NIVEL Y NAVEGACIÓN QUE CRECE (Alpha 2026)
   -----------------------------------------------------------
   "El menú no debe mostrar todo. Debe crecer con la persona."
   Cada vista pide un nivel mínimo; al subir de nivel, ANIMA
   revela nuevas ventanas. El Creador (sin previsualizar) ve todo.
   Las Almas nacen en CHISPA (EMBER), así que el espacio base
   (Mi Alma, Portafolio, Memorias, Trayectoria, Taller, Comunidad)
   nunca queda oculto; lo que llega después se abre con el camino. */
const VIEW_MIN_LEVEL = {
  // RAÍZ — el Alma empieza a recordar y a ordenar su mundo.
  cronologia:"ROOT", insignias:"ROOT", biblioteca:"ROOT", clientes:"ROOT", agenda:"ROOT",
  // HUELLA — el Alma se vuelve reconocible: mide su huella y decide qué muestra.
  estadisticas:"TOTEM", visibilidad:"TOTEM"
};
function levelAllows(view){
  if(isCreator && !state.viewAs) return true;
  const need = VIEW_MIN_LEVEL[view];
  if(!need) return true;
  return levelRank(me().level) >= levelRank(need);
}
/* ¿La sesión puede gestionar el equipo? (Líder, Admin o Creador) */
function canLead(){
  if(isCreator && !state.viewAs) return true;
  const r=almaRole(me());
  return r==="LIDER" || r==="ADMIN" || r==="CREADOR";
}
/* ¿La sesión puede CREAR/EDITAR contenido del Clan? (Colaborador o superior) */
function canCollaborate(){ if(isCreator && !state.viewAs) return true; return roleRank(almaRole(me()))>=ROLE_RANK.COLABORADOR; }
/* ¿La sesión coordina el Santuario? (Admin o Creador) */
function canAdminSantuario(){ if(isCreator && !state.viewAs) return true; return almaRole(me())==="ADMIN"; }

/* ===========================================================
   MENÚ DEFINITIVO (Prompt Maestro Final)
   -----------------------------------------------------------
   Solo existen 5 entradas: MI ALMA · TALLER · CLAN · MUNDO · MI PLAN.
   Todo lo demás vive DENTRO. Esto es un reordenamiento visual:
   ninguna vista, dato, plan ni política cambia — solo cómo se agrupan.
   =========================================================== */
const NAV_TREE = [
  // 1 · MI ALMA — la identidad (todo lo que era "Esencia" vive aquí dentro).
  { type:"reino", key:"mialma", ico:"◆", ic:"alma", t:"Mi Alma", children:[
      {v:"mialma",      ico:"◆",ic:"alma",t:"Núcleo"},
      {v:"trayectoria", ico:"⤴",ic:"ruta",t:"Trayectoria"},
      {v:"portafolio",  ico:"▦",ic:"huellas",t:"Portafolio"},
      {v:"cronologia",  ico:"☷",ic:"tiempo",t:"Cronología"},
      {v:"insignias",   ico:"✷",ic:"insignia",t:"Insignias"},
      {v:"estadisticas",ico:"📊",ic:"grafico",t:"Estadísticas"},
      {v:"visibilidad", ico:"👁",ic:"vista",t:"Visibilidad"},
      {v:"memoria",     ico:"✦",ic:"memoria",t:"Memorias"},
      {v:"biblioteca",  ico:"❏",ic:"archivo",t:"Biblioteca"}
  ]},
  // 2 · TALLER — lo que creo.
  { type:"reino", key:"taller", ico:"₵", ic:"taller", t:"Taller", children:[
      {v:"proyectos",  ico:"◷",ic:"proceso",t:"Proyectos"},
      {v:"clientes",   ico:"☺",ic:"constelacion",t:"Vínculos"},
      {v:"cotizador",  ico:"₵",ic:"documento",t:"Cotizador"},
      {v:"finanzas",   ico:"🌱",ic:"raiz",t:"Raíz"},
      {v:"agenda",     ico:"☰",ic:"agenda",t:"Agenda"}
  ]},
  // 3 · CLAN — con quién creo (solo en planes Clan/Santuario; gating por planAllows).
  { type:"reino", key:"clan", ico:"❂", ic:"constelacion", t:"Clan", children:[
      {v:"clanpanel",     ico:"⬡",ic:"panel",t:"Panel"},
      {v:"equipo",        ico:"▦",ic:"obra",t:"Plan de trabajo"},
      {v:"calendario",    ico:"☷",ic:"agenda",t:"Calendario"},
      {v:"proyectos_clan",ico:"◷",ic:"proceso",t:"Proyectos"},
      {v:"recordatorios", ico:"⏰",ic:"susurro",t:"Recordatorios"}
  ]}
  // 4 · MUNDO y 5 · MI PLAN se construyen en renderNav (dependen de plan/consejo/creador).
];
function navItem(n, sub){ return `<div class="nav-item ${sub?'sub':''} ${state.view===n.v?'active':''}" data-view="${n.v}"><span class="ico">${ANIMA_ICON(n.ic, n.ico)}</span>${n.t}</div>`; }
/* Ítem bloqueado por nivel: visible (para que el Alma sepa qué viene) pero
   con candado y el nivel que lo abre. Al tocarlo, explica cómo desbloquearlo. */
function navItemLocked(n, sub){
  const need=VIEW_MIN_LEVEL[n.v]; const lv=levelByKey(need);
  return `<div class="nav-item ${sub?'sub':''} locked" data-view="${n.v}" title="Se abre en ${lv.label}"><span class="ico">${ANIMA_ICON("lock","🔒")}</span>${n.t}<span class="lock-lv">${lv.emoji} ${lv.label}</span></div>`;
}
/* Los reinos arrancan COLABSADOS: el Alma los despliega para descubrir. */
function reinoOpen(key){ if(!state.navOpen) state.navOpen={}; return state.navOpen[key]===true; }
function toggleReino(key){ if(!state.navOpen) state.navOpen={}; state.navOpen[key]=!reinoOpen(key); save(); renderNav(); }
/* Reino colapsable genérico (lo usan Mi Alma, Taller, Clan y Mundo). */
function navReino(key, ico, ic, t, kids){
  if(!kids.length) return "";
  const activeInside=kids.some(c=>c.v===state.view);
  const open=reinoOpen(key)||activeInside;
  return `<div class="nav-group ${open?'open':''} ${activeInside?'has-active':''}" data-reino="${key}">
      <span class="ico">${ANIMA_ICON(ic, ico)}</span><span class="rt">${t}</span><span class="caret">⌄</span></div>`
    + `<div class="nav-sub ${open?'open':''}"><div class="nav-sub-inner">${kids.map(c=>levelAllows(c.v)?navItem(c,true):navItemLocked(c,true)).join("")}</div></div>`;
}
/* ===========================================================
   PRIMERA LLEGADA PROGRESIVA (Alpha)
   El menú no aparece de golpe: el Alma descubre ANIMA de a poco.
   Cada morada se revela al avanzar (botón "Descubrir") o al subir
   de nivel, y se explica qué abre. Persistente por Alma (local).
   El Creador ve todo. No oculta nunca la vista activa.
   =========================================================== */
const SECTION_REVEAL = {
  mialma: "Mi Alma se ha revelado — tu identidad: Resumen, Senda, Trayectoria, Portafolio, Cronología e Insignias.",
  taller: "El Taller se ha revelado — donde creas: Proyectos, Vínculos y Agenda, todo interconectado.",
  clan:   "El Clan se ha revelado — crear junto a otras Almas (2 a 8).",
  mundo:  "El Mundo se ha revelado — la Constelación de Almas, el Árbol vivo y los Ecos.",
  miplan: "Mi Plan se ha revelado — cómo habitas ANIMA: Alma, Clan o Santuario."
};
const SECTION_TITLE = { mialma:"Mi Alma", taller:"el Taller", clan:"el Clan", mundo:"el Mundo", miplan:"Mi Plan" };
function revealKey(){ return "anima_reveal_"+(me().almaId||me().id||"guest"); }
function storedReveal(){ const n=parseInt(localStorage.getItem(revealKey()),10); return isNaN(n)?0:n; }
function setStoredReveal(n){ try{ localStorage.setItem(revealKey(), String(n)); }catch(e){} }
/* Al subir de nivel, ANIMA revela más moradas por sí sola. */
function levelReveal(){ const r=levelRank(me().level); return r<=1?1:Math.min(5,r); }
/* ¿A qué morada pertenece una vista? (para no ocultar la activa) */
function sectionOfView(v){
  // Mi Plan vive DENTRO de Mi Alma. Clan y Santuario son moradas propias del menú,
  // visibles SOLO si el Alma tiene acceso a esa Forma. No viven dentro de Mundo.
  if(["mialma","trayectoria","portafolio","cronologia","insignias","estadisticas","visibilidad","memoria","biblioteca","miplan"].includes(v)) return "mialma";
  if(["proyectos","clientes","cotizador","finanzas","agenda"].includes(v)) return "taller";
  if(["clanpanel","equipo","calendario","proyectos_clan","recordatorios"].includes(v)) return "clan";
  if(["santuario","sant_plan"].includes(v)) return "santuario";
  if(["comunidad","consejo"].includes(v)) return "mundo";
  return null;
}
/* Ítem de morada en la barra: navega a su vista por defecto y se marca activo
   cuando estás en cualquiera de sus pestañas. */
function navSectionItem(id, ico, ic, t, defView){
  const active = sectionOfView(state.view)===id;
  return `<div class="nav-item ${active?'active':''}" data-view="${defView}"><span class="ico">${ANIMA_ICON(ic, ico)}</span>${t}</div>`;
}
/* Solo 3 moradas en la barra. Todo lo demás vive en pestañas del dashboard:
   Mi Plan dentro de Mi Alma · Clan dentro de Mundo. */
function buildSections(cfg){
  return [
    { id:"mialma", html:navSectionItem("mialma","◆","alma","Mi Alma","mialma") },
    { id:"taller", html:navSectionItem("taller","₵","taller","Taller","proyectos") },
    { id:"mundo",  html:navSectionItem("mundo","❂","nucleo","Mundo","comunidad") }
  ];
}
function renderNav(){
  const cfg=getCfg(me());
  const built=buildSections(cfg);
  // Cuántas moradas revelar: manual + por nivel. El Creador ve todo.
  let stage = (isCreator && !state.viewAs) ? built.length : Math.max(1, storedReveal(), levelReveal());
  // Nunca ocultes la morada que el Alma está viendo ahora.
  const curSec=sectionOfView(state.view);
  if(curSec){ const ci=built.findIndex(s=>s.id===curSec); if(ci>=0) stage=Math.max(stage, ci+1); }
  stage=Math.min(stage, built.length);
  let h = built.slice(0,stage).map(s=>s.html).join("");
  // Afordancia: descubrir la siguiente morada (progresivo, a tu ritmo).
  const next = built[stage];
  if(next){
    h += `<button class="nav-reveal" data-reveal title="${esc(SECTION_REVEAL[next.id]||"")}">✦ Descubrir ${esc(SECTION_TITLE[next.id]||"")} →</button>`;
  }
  // Clan y Santuario: moradas del menú que SOLO aparecen si el Alma tiene acceso
  // a esa Forma (plan). Ese acceso solo lo concede el Creador desde la Consola.
  // No se ocultan por la llegada progresiva: si hay acceso, están en el menú.
  if(planAllows("clanpanel")) h += navSectionItem("clan","❂","constelacion","Clan","clanpanel");
  if(planAllows("santuario")) h += navSectionItem("santuario","🜁","santuario","Santuario","santuario");
  // Pista: qué se abre al subir de nivel.
  const lpNav=levelProgress(me().xp);
  if(lpNav.next && UNLOCKS[lpNav.next.key]){
    h+=`<div class="nav-next">Al alcanzar <b>${lpNav.next.label}</b>: ${UNLOCKS[lpNav.next.key]}</div>`;
  }
  // El bloque Creador se oculta mientras se previsualiza un plan (vista fiel).
  if(isCreator && !state.viewAs){
    h+=`<div class="nav-label">Creador</div>`
      +navItem({v:"consola",ico:"⬡",ic:"panel",t:"Consola"})
      +navItem({v:"config",ico:"⚙",ic:"config",t:"Personalizar"});
  }
  document.getElementById("nav").innerHTML=h;
  renderBottomNav(stage);
}
/* ===========================================================
   BARRA INFERIOR (móvil) — estilo Instagram.
   Solo cambia de menú principal; las sub-secciones siguen viviendo
   dentro como pestañas (morada-tabs). Respeta la llegada progresiva
   (las mismas moradas reveladas que la barra lateral) y el plan.
   =========================================================== */
function renderBottomNav(stage){
  const bn=document.getElementById("botnav"); if(!bn) return;
  // La barra inferior es el conmutador principal en móvil: muestra siempre las
  // moradas base. (El descubrimiento progresivo es una guía de la barra lateral.)
  const cur=sectionOfView(state.view);
  const core=[
    {id:"mialma",ic:"alma",ico:"◆",t:"Mi Alma",v:"mialma"},
    {id:"taller",ic:"taller",ico:"₵",t:"Taller",v:"proyectos"},
    {id:"mundo", ic:"nucleo",ico:"❂",t:"Mundo", v:"comunidad"}
  ];
  let items=core.map(s=>`<button class="botnav-item ${cur===s.id?'on':''}" data-view="${s.v}"><span class="bi">${ANIMA_ICON(s.ic,s.ico)}</span><span class="bl">${esc(s.t)}</span></button>`);
  if(planAllows("clanpanel")) items.push(`<button class="botnav-item ${cur==='clan'?'on':''}" data-view="clanpanel"><span class="bi">${ANIMA_ICON('constelacion','❂')}</span><span class="bl">Clan</span></button>`);
  if(planAllows("santuario")) items.push(`<button class="botnav-item ${cur==='santuario'?'on':''}" data-view="santuario"><span class="bi">${ANIMA_ICON('santuario','🜁')}</span><span class="bl">Santuario</span></button>`);
  items.push(`<button class="botnav-item botnav-lumbre" id="botLumbre"><span class="bi"><img src="assets/img/lumbre.svg" width="22" height="24" alt=""></span><span class="bl">LUMBRE</span></button>`);
  bn.innerHTML=items.join("");
}
/* Revela la siguiente morada, la explica y la marca. */
function revealNext(){
  const built=buildSections(getCfg(me()));
  const cur=Math.max(1, storedReveal(), levelReveal());
  const target=Math.min(built.length, cur+1);
  setStoredReveal(target);
  renderNav();
  const revealed=built[target-1];
  if(revealed && SECTION_REVEAL[revealed.id]) animaToast(SECTION_REVEAL[revealed.id]);
}
/* Aviso sereno (no intrusivo) — mensajes del mundo, nunca "+XP". */
function animaToast(msg){
  let t=document.getElementById("animaToast");
  if(!t){ t=document.createElement("div"); t.id="animaToast"; t.className="anima-toast"; document.body.appendChild(t); }
  t.textContent=msg; t.classList.add("show");
  clearTimeout(animaToast._t); animaToast._t=setTimeout(function(){ t.classList.remove("show"); }, 4400);
}

/* ---------- Sidebar identidad ---------- */
function renderWho(){
  const a=me(); const lv=levelByKey(a.level);
  document.getElementById("who").innerHTML = `${avatarHTML(a)}<div class="meta"><b>${esc(a.name)}</b><small>${lv.emoji} ${a.level} · ${esc(a.city||"")}</small></div>`;
}

/* ---------- Topbar ---------- */
const TITLES = {
  mialma:["Mi Alma","Tu espacio privado: identidad, nivel y pulso de hoy."],
  trayectoria:["Trayectoria","La historia de tu Alma, hito a hito."],
  portafolio:["Portafolio","Las obras que te representan."],
  proyectos:["Proyectos","Lo que está vivo ahora mismo."],
  finanzas:["Raíz","Ingresos, egresos y ganancia — privado. El sustento del Alma."],
  clientes:["Vínculos","Tu cartera de vínculos y contactos."],
  cotizador:["Centro documental","Cotizaciones, propuestas y documentos profesionales · exporta en PDF."],
  agenda:["Agenda","Tu día, ordenado."],
  memoria:["Memorias","Ideas, frases y referencias que no quieres perder."],
  biblioteca:["Biblioteca","Tus documentos y archivos."],
  cronologia:["Cronología","Porque ANIMA recordará. La historia viva de tu Alma."],
  insignias:["Insignias","No se anuncian. Se descubren."],
  estadisticas:["Estadísticas","La huella de tu Alma, en números."],
  visibilidad:["Visibilidad","Tú decides qué ve el mundo de tu Alma."],
  consejo:["Consejo de Almas","Las primeras Almas escriben la historia de ANIMA."],
  sant_plan:["Planificación del Santuario","Coordina a toda la organización."],
  config:["Personalizar","Tú decides qué muestra tu Alma."],
  consola:["Consola del Creador","Planes, roles, nivel y clan · vista omnipresente."],
  miplan:["Mi Plan","Elige tu umbral y desbloquea sus funciones."],
  clanpanel:["Panel del Clan","Miembros, roles y códigos de invitación."],
  equipo:["Plan de trabajo","Tablero del Clan: tareas y responsables."],
  calendario:["Calendario","Eventos y turnos sincronizados del Clan."],
  proyectos_clan:["Proyectos del Clan","Encargos compartidos y su avance."],
  recordatorios:["Recordatorios","Lo que el Clan no puede olvidar."],
  comunidad:["Mundo","La constelación de Almas, el Árbol vivo y los Ecos del mundo."],
  santuario:["Santuario","Nivel 3: la organización completa de ANIMA."]
};
function renderTop(){ const [t,s]=TITLES[state.view]||["ANIMA",""]; document.getElementById("topTitle").innerHTML=`<h1>${t}</h1><div class="sub">${s}</div>`; }

/* ---------- Mapamundi de Almas ---------- */
function hashStr(s){ s=String(s||""); let h=0; for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))>>>0; } return h; }
function timeAgo(iso){ if(!iso) return ""; const d=(Date.now()-new Date(iso).getTime())/1000;
  if(isNaN(d)) return ""; if(d<60) return "ahora"; if(d<3600) return Math.floor(d/60)+" min"; if(d<86400) return Math.floor(d/3600)+" h"; return Math.floor(d/86400)+" d"; }
const WORLD_IMG="https://upload.wikimedia.org/wikipedia/commons/8/83/Equirectangular_projection_SW.jpg";
const CITY_COORDS={ "santiago":[-33.45,-70.66],"valparaiso":[-33.05,-71.62],"concepcion":[-36.83,-73.05],
  "buenos aires":[-34.6,-58.38],"cordoba":[-31.42,-64.18],"medellin":[6.24,-75.57],"bogota":[4.71,-74.07],
  "ciudad de mexico":[19.43,-99.13],"guadalajara":[20.67,-103.35],"lima":[-12.04,-77.04],"madrid":[40.42,-3.70],
  "barcelona":[41.39,2.16],"new york":[40.71,-74.0],"nueva york":[40.71,-74.0],"los angeles":[34.05,-118.24],
  "miami":[25.76,-80.19],"san francisco":[37.77,-122.42],"chicago":[41.88,-87.63],"houston":[29.76,-95.37] };
const COUNTRY_COORDS={ "chile":[-35,-71],"argentina":[-38,-63],"colombia":[4,-73],"mexico":[23,-102],
  "peru":[-10,-76],"espana":[40,-4],"spain":[40,-4],"usa":[39,-98],"brasil":[-10,-52],"brazil":[-10,-52],
  "ecuador":[-1.5,-78],"uruguay":[-33,-56],"venezuela":[7,-66],"bolivia":[-17,-65],"paraguay":[-23,-58],
  "guatemala":[15.5,-90],"costa rica":[10,-84],"panama":[9,-80],"republica dominicana":[19,-70.5],
  "puerto rico":[18.2,-66.5],"francia":[46,2],"france":[46,2],"alemania":[51,10],"italia":[42.8,12.8],
  "reino unido":[54,-2],"canada":[56,-106],"portugal":[39.5,-8] };
const deburr=s=>(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[\u{1F1E6}-\u{1F1FF}]/gu,"").replace(/[.\-]/g," ").replace(/\s+/g," ").trim().toLowerCase();
/* Normaliza el pa\u00eds de un Alma a una forma can\u00f3nica (nombre + bandera) para que
   el conteo y el mapa agrupen bien las variantes ("EE.UU.", "USA", "United States"). */
const COUNTRY_CANON=[
  {key:"chile",name:"Chile",flag:"\ud83c\udde8\ud83c\uddf1",aliases:["chile"]},
  {key:"argentina",name:"Argentina",flag:"\ud83c\udde6\ud83c\uddf7",aliases:["argentina"]},
  {key:"mexico",name:"M\u00e9xico",flag:"\ud83c\uddf2\ud83c\uddfd",aliases:["mexico"]},
  {key:"colombia",name:"Colombia",flag:"\ud83c\udde8\ud83c\uddf4",aliases:["colombia"]},
  {key:"peru",name:"Per\u00fa",flag:"\ud83c\uddf5\ud83c\uddea",aliases:["peru"]},
  {key:"espana",name:"Espa\u00f1a",flag:"\ud83c\uddea\ud83c\uddf8",aliases:["espana","spain"]},
  {key:"usa",name:"Estados Unidos",flag:"\ud83c\uddfa\ud83c\uddf8",aliases:["usa","us","ee uu","eeuu","ee uu ","estados unidos","estados unidos de america","united states","united states of america"]},
  {key:"brasil",name:"Brasil",flag:"\ud83c\udde7\ud83c\uddf7",aliases:["brasil","brazil"]},
  {key:"ecuador",name:"Ecuador",flag:"\ud83c\uddea\ud83c\udde8",aliases:["ecuador"]},
  {key:"uruguay",name:"Uruguay",flag:"\ud83c\uddfa\ud83c\uddfe",aliases:["uruguay"]},
  {key:"venezuela",name:"Venezuela",flag:"\ud83c\uddfb\ud83c\uddea",aliases:["venezuela"]},
  {key:"bolivia",name:"Bolivia",flag:"\ud83c\udde7\ud83c\uddf4",aliases:["bolivia"]},
  {key:"paraguay",name:"Paraguay",flag:"\ud83c\uddf5\ud83c\uddfe",aliases:["paraguay"]},
  {key:"guatemala",name:"Guatemala",flag:"\ud83c\uddec\ud83c\uddf9",aliases:["guatemala"]},
  {key:"costa rica",name:"Costa Rica",flag:"\ud83c\udde8\ud83c\uddf7",aliases:["costa rica"]},
  {key:"panama",name:"Panam\u00e1",flag:"\ud83c\uddf5\ud83c\udde6",aliases:["panama"]},
  {key:"republica dominicana",name:"Rep. Dominicana",flag:"\ud83c\udde9\ud83c\uddf4",aliases:["republica dominicana","dominican republic"]},
  {key:"puerto rico",name:"Puerto Rico",flag:"\ud83c\uddf5\ud83c\uddf7",aliases:["puerto rico"]},
  {key:"francia",name:"Francia",flag:"\ud83c\uddeb\ud83c\uddf7",aliases:["francia","france"]},
  {key:"alemania",name:"Alemania",flag:"\ud83c\udde9\ud83c\uddea",aliases:["alemania","germany"]},
  {key:"italia",name:"Italia",flag:"\ud83c\uddee\ud83c\uddf9",aliases:["italia","italy"]},
  {key:"reino unido",name:"Reino Unido",flag:"\ud83c\uddec\ud83c\udde7",aliases:["reino unido","united kingdom","uk"]},
  {key:"canada",name:"Canad\u00e1",flag:"\ud83c\udde8\ud83c\udde6",aliases:["canada"]},
  {key:"portugal",name:"Portugal",flag:"\ud83c\uddf5\ud83c\uddf9",aliases:["portugal"]}
];
function canonCountry(raw){
  const d=deburr(raw); if(!d) return null;
  for(const c of COUNTRY_CANON){ if(c.aliases.indexOf(d)>-1) return c; }
  return { key:d, name:String(raw).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[\u{1F1E6}-\u{1F1FF}]/gu,"").trim()||String(raw).trim(), flag:"\ud83c\udf0d" };
}
function countryLabel(raw){ const c=canonCountry(raw); return c?`${c.flag} ${c.name}`:""; }
function almaLatLng(m){ const c=deburr(m.city); if(CITY_COORDS[c]) return CITY_COORDS[c];
  const cc=canonCountry(m.country); if(cc && COUNTRY_COORDS[cc.key]) return COUNTRY_COORDS[cc.key];
  const co=deburr(m.country); if(COUNTRY_COORDS[co]) return COUNTRY_COORDS[co]; return [15,-20]; }
/* El mapa de Almas (puntos sobre el planeta). Compartido por el dashboard
   y por el Árbol de Almas de la ventana de Comunidad. */
function soulMapWorld(sz){
  const list=roster();
  const recent=[...list].sort((a,b)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime()).slice(0,5);
  const nodes=list.map(m=>{
    const [lat,lng]=almaLatLng(m); const j=hashStr(m.id||m.name);
    const x=Math.max(2,Math.min(98,(lng+180)/360*100+((j%14)-7)*0.18));
    const y=Math.max(4,Math.min(96,(90-lat)/180*100+(((j>>4)%12)-6)*0.18));
    const isNew=liveMode()&&recent.indexOf(m)>-1;
    const act=(liveMode()&&!m.live)?`data-pub="${m.id}"`:`data-alma="${m.id}"`;
    return `<button class="wn ${isNew?'new':''}" ${act} style="left:${x}%;top:${y}%;--c:${m.color}" title="${esc(m.name)} · ${esc(m.city||m.country||"")} · ${m.level}">${initials(m.name)}</button>`;
  }).join("");
  return `<div class="worldmap ${sz}"><img src="${WORLD_IMG}" alt="" loading="lazy" onerror="this.style.display='none'">${nodes}</div>`;
}
function constelacionHTML(){
  const list=roster();
  const recent=[...list].sort((a,b)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime()).slice(0,5);
  const chips=recent.map(m=>`<span class="chip"><b style="color:${m.color}">●</b> ${esc(m.name)} · ${esc(deburr(m.city)?m.city:m.country||"")} ${m.created_at?"· "+timeAgo(m.created_at):""}</span>`).join("");
  const sz=getCfg(me()).mapSize||"md";
  return `<div class="card s12 map-card">
    <div class="map-bar">
      <span class="pixel-font" style="font-size:11px;color:#e9d9a8">⌖ MAPA DE ALMAS</span>
      <span class="pill ${liveMode()?'gold':''}" style="margin-left:6px">${liveMode()?'🜂 '+list.length:'Demo · '+list.length}</span>
      <div class="spacer" style="flex:1"></div>
      <div class="map-sizes">${["sm","md","lg"].map(s=>`<button class="msz ${sz===s?'on':''}" data-mapsize="${s}">${s.toUpperCase()}</button>`).join("")}</div>
    </div>
    ${soulMapWorld(sz)}
    <div style="display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap">
      <small class="pixel-font" style="font-size:8px;color:#7b5920">ENTRANDO AL MUNDO</small>
      ${chips}
    </div>
  </div>`;
}
function setMapSize(s){ const a=me(); const c=getCfg(a); c.mapSize=s; setCfg(a,c); renderAll(); }

/* ---------- Acciones de ítem (editar/eliminar) ---------- */
function acts(kind,i){ return `<span class="acts"><button class="ia" data-edit="${kind}:${i}" title="Editar">✎</button><button class="ia danger" data-del="${kind}:${i}" title="Eliminar">✕</button></span>`; }

/* ===========================================================
   VISTAS
   =========================================================== */
/* Submenú de la morada como PESTAÑAS dentro del dashboard.
   Al entrar a una morada ves sus sub-secciones en pestañas (no solo en la
   barra). Navegan con go() (data-view). Las bloqueadas por nivel se marcan. */
function moradaTabs(view){
  const sec=sectionOfView(view); if(!sec) return "";
  const cfg=getCfg(me()); let kids=[];
  if(sec==="mialma"){ kids=NAV_TREE[0].children.slice(); kids.push({v:"miplan",t:"Forma"}); }   // Mi Plan plegado aquí
  else if(sec==="taller"){ kids=NAV_TREE[1].children.slice(); }
  else if(sec==="mundo"){
    if(planAllows("comunidad")) kids.push({v:"comunidad",t:"Constelación"});
    if(me().council||(isCreator&&!state.viewAs)) kids.push({v:"consejo",t:"Consejo"});
  }
  else if(sec==="clan"){ kids=NAV_TREE[2].children.slice(); }                                    // Panel · Plan de trabajo · Calendario · Proyectos · Recordatorios
  else if(sec==="santuario"){
    kids.push({v:"santuario",t:"Santuario"});
    if(planAllows("santuario")&&me().santuario) kids.push({v:"sant_plan",t:"Planificar"});
  }
  kids=kids.filter(c=>planAllows(c.v) && cfg.modules[c.v]!==false);
  if(kids.length<2) return "";
  const label={mialma:"Mi Alma",taller:"Taller",mundo:"Mundo",clan:"Clan",santuario:"Santuario"}[sec]||"";
  return `<div class="morada-tabs"><span class="morada-tabs-label">${esc(label)}</span><div class="morada-tabs-row">`+
    kids.map(c=>`<button class="morada-tab ${state.view===c.v?'on':''}" data-view="${c.v}">${esc(c.t)}${levelAllows(c.v)?"":' <span class="mt-lock">🔒</span>'}</button>`).join("")+
    `</div></div>`;
}
/* Transición suave: el cuerpo de cada vista "abre los ojos" en cada render.
   No envuelve la barra de pestañas (queda estable, sin parpadeo). */
function animaWrap(html){ return `<div class="anima-page-transition">${html}</div>`; }
function renderView(){
  if(state.viewAs && !isCreator) state.viewAs=null;              // "Ver como" es solo del Creador
  // Consola y Personalizar: SOLO el Creador, y nunca durante una vista previa.
  if((state.view==="config"||state.view==="consola") && (!isCreator || state.viewAs)) state.view="mialma";
  // Gating por plan: si el plan (real o previsualizado) no incluye la vista, vuelve a Mi Alma.
  if(!planAllows(state.view)) state.view="mialma";
  // Consejo de Almas: reservado a las Almas Fundadoras (Consejo) y al Creador.
  if(state.view==="consejo" && !(me().council || (isCreator && !state.viewAs))) state.view="mialma";
  // Gating por nivel: la ventana está realmente BLOQUEADA hasta alcanzar su nivel.
  if(!levelAllows(state.view)){ document.getElementById("view").innerHTML = previewBanner() + moradaTabs(state.view) + animaWrap(vLocked(state.view)); return; }
  const fn = { mialma:vMiAlma, miplan:vMiPlan, trayectoria:vTrayectoria, portafolio:vPortafolio, proyectos:vProyectos,
    finanzas:vFinanzas, clientes:vClientes, cotizador:vCotizador, agenda:vAgenda, memoria:vMemoria, biblioteca:vBiblioteca,
    cronologia:vCronologia, insignias:vInsignias, estadisticas:vEstadisticas, visibilidad:vVisibilidad, consejo:vConsejo,
    config:vConfig, consola:vConsola, clanpanel:vClanPanel, equipo:vEquipo, calendario:vCalendario, proyectos_clan:vProyectosClan,
    recordatorios:vRecordatorios, comunidad:vComunidad, santuario:vSantuario,
    sant_plan:vSantPlan }[state.view] || vMiAlma;
  document.getElementById("view").innerHTML = previewBanner() + moradaTabs(state.view) + animaWrap(fn(me()));
  if(state.view==="comunidad" && window.WorldTree){ requestAnimationFrame(initWorldTreeView); }
}
/* Ventana bloqueada por nivel — explica qué la abre. */
function vLocked(view){
  const need=VIEW_MIN_LEVEL[view]||"EMBER", lv=levelByKey(need), cur=levelByKey(me().level), p=levelProgress(me().xp);
  const t=(TITLES[view]||["Esta ventana"])[0];
  return `<div class="grid"><div class="card s12 locked-view">
    <div class="locked-glyph">🔒</div>
    <h2 style="letter-spacing:-.03em;margin:6px 0 4px">${esc(t)} se abre en ${lv.emoji} ${esc(lv.label)}</h2>
    <p class="muted" style="max-width:520px;margin:0 auto">Tu Alma está en <b>${cur.emoji} ${esc(cur.label)}</b>. Sigue creando para despertar <b style="color:var(--gold-deep)">${esc(lv.name)}</b> y desbloquear esta ventana.</p>
    <div class="ebar" style="max-width:340px;margin:18px auto 0"><span style="width:${p.pct}%"></span></div>
    ${p.next?`<div class="muted" style="font-size:12px;margin-top:8px">${p.pct}% hacia ${esc(p.next.label)}</div>`:""}
  </div></div>`;
}

/* --- Mi Alma --- */
function vMiAlma(a){
  const lp=levelProgress(a.xp), lv=levelByKey(a.level);
  let tab=state.almaTab||"resumen"; if(tab==="ajustes"&&!isCreator) tab="resumen";
  const idline=[a.discipline||a.role, a.specialty].filter(Boolean).join(" · ");
  const header=`<div class="card s12">
    <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
      ${avatarHTML(a,"lg")}
      <div style="flex:1;min-width:200px">
        <span class="level-badge" style="border-color:${lv.color}55;color:${lv.color}">${lv.emoji} ${lv.label} · ${lv.name}</span>
        <h2 style="font-size:30px;letter-spacing:-.05em;margin:10px 0 2px">${esc(a.name)}</h2>
        <div class="muted">${esc(idline||"")}${(a.territory||a.country)?" · "+esc(a.territory||a.country):""}</div>
        ${a.handle?`<div class="muted" style="font-size:12.5px;margin-top:2px">${esc(a.handle)}</div>`:""}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
        <span class="pixel-font" style="font-size:10px;color:#7b5920">${a.xp.toLocaleString("es-CL")} Esencia</span>
        <div class="bar" style="width:170px"><span style="width:${lp.pct}%"></span></div>
        <small class="muted" style="font-size:11px">${lp.next?`hacia ${lp.next.label}`:"Alma Despierta ∞"}</small>
      </div>
    </div>
    ${a.bio?`<p style="margin:14px 0 0">${esc(a.bio)}</p>`:""}
    <div style="margin-top:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      ${(a.tags||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}
      ${linksHTML(a)}<span style="flex:1"></span>
      ${a.live?`<button class="btn ghost sm" id="sharePf">↗ Compartir portafolio</button>`:""}
      <button class="btn ghost sm" data-export>⤓ PDF</button>
    </div>
  </div>`;
  const tabs=[["resumen","Resumen"],["identidad","Identidad"],["publica","Vista pública"]];
  if(isCreator) tabs.push(["ajustes","Ajustes"]);
  const tabbar=`<div class="card s12 tabbar">${tabs.map(([k,l])=>`<button class="tabbtn ${tab===k?'on':''}" data-tab="${k}">${l}</button>`).join("")}</div>`;
  const body = tab==="identidad"?vAlmaIdentidad(a) : tab==="publica"?vAlmaPublica(a) : tab==="ajustes"?vConfigBody(a) : vAlmaResumen(a,lp);
  return `<div class="grid">${header}${tabbar}${body}</div>`;
}
function linksHTML(a){
  const L=[]; if(a.website)L.push(["Sitio",a.website]); if(a.instagram)L.push(["Instagram",a.instagram.startsWith("http")?a.instagram:"https://instagram.com/"+a.instagram.replace("@","")]);
  if(a.portfolio_url)L.push(["Portafolio",a.portfolio_url]); if(a.shop_url)L.push(["Tienda",a.shop_url]);
  return L.map(([t,u])=>`<a class="chip" href="${esc(u)}" target="_blank" rel="noopener">${t} ↗</a>`).join("");
}
function vAlmaResumen(a,lp){
  const cfg=getCfg(a); const inc=sum(a.finance.income), exp=sum(a.finance.expense);
  const active=a.projects.filter(p=>!["Entregado","Cerrado","Terminado"].includes(p.st)).length;
  const createCTA=(!a.live && Cloud.enabled)?`<div class="card s12" style="background:linear-gradient(145deg,rgba(208,170,99,.16),rgba(255,255,255,.7))">
      <span class="pill gold">Estás viendo una Alma de muestra</span>
      <p style="margin:8px 0 0">Crea tu propia Alma para construir tu trayectoria real y aparecer en la constelación.</p>
      <div style="margin-top:12px"><button class="btn" id="createAlmaBtn">✦ Crear mi Alma</button></div></div>`:``;
  const onboarding=(a.live && a.memories.length===0 && a.projects.length===0)?`<div class="card s12" style="background:linear-gradient(145deg,rgba(208,170,99,.14),rgba(255,255,255,.7))">
      <span class="pill gold">Bienvenida, Alma nueva</span>
      <p style="margin:8px 0 0">Empieza por <b>Identidad</b>: pon tu foto y datos. Luego crea tu primer trabajo o memoria. Cada acción da Esencia.</p>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn sm" data-tab="identidad">✎ Completar identidad</button>
        <button class="btn secondary sm" data-add="proyecto">+ Primer trabajo</button></div></div>`:``;
  return `${createCTA}${onboarding}
    ${cfg.cards.kpis!==false?`
    <div class="card s3"><div class="stat"><span class="num">${active}</span><span class="lbl">Trabajos activos</span></div></div>
    <div class="card s3"><div class="stat"><span class="num" style="color:var(--ok)">${money(inc)}</span><span class="lbl">Ingresos</span></div></div>
    <div class="card s3"><div class="stat"><span class="num">${money(inc-exp)}</span><span class="lbl">Ganancia</span></div></div>
    <div class="card s3"><div class="stat"><span class="num">${a.clan?esc(a.clan):"—"}</span><span class="lbl">${a.clan?"Tu Clan":"Sin Clan aún"}</span></div></div>`:``}
    ${cfg.cards.camino!==false?`<div class="card s12 camino-card">${caminoPixelHTML(lp)}</div>`:``}
    ${cfg.cards.graficos!==false?`
    <div class="card s6"><div class="section-title"><h2>Raíz por mes</h2></div>${chartFinance(a)}</div>
    <div class="card s6"><div class="section-title"><h2>Trabajos por estado</h2></div>${chartProjects(a)}</div>`:``}
    ${cfg.cards.hoy!==false?`<div class="card s6"><div class="section-title"><h2>Hoy</h2><div class="spacer"></div><button class="btn sm" data-add="cita">+ Cita</button></div>
      ${a.agenda.map((x,i)=>`<div class="row"><b style="color:var(--gold);width:60px">${esc(x.h)}</b><div class="grow">${esc(x.t)}</div>${acts("cita",i)}</div>`).join("")||`<p class="muted">Sin agenda hoy.</p>`}</div>`:``}
    ${cfg.cards.memoria!==false?`<div class="card s6"><div class="section-title"><h2>Última memoria</h2><div class="spacer"></div><button class="btn sm" data-add="memoria">+ Memoria</button></div>
      ${a.memories[0]?`<b>${esc(a.memories[0].t)}</b><p class="muted" style="margin:6px 0 0">${esc(a.memories[0].d)}</p>`:`<p class="muted">Aún no hay memorias.</p>`}
      <div style="margin-top:16px"><button class="btn ghost sm" data-go="memoria">Ver memorias →</button></div></div>`:``}`;
}
function vAlmaIdentidad(a){
  if(!a.live) return `<div class="card s12"><p class="muted">Entra o crea tu Alma para editar tu identidad. <button class="btn sm" id="createAlmaBtn" style="margin-left:8px">Crear mi Alma</button></p></div>`;
  const f=(id,l,v,ph="")=>`<div class="field"><label>${l}</label><input id="${id}" value="${esc(v||"")}" placeholder="${ph}"></div>`;
  return `<div class="card s8">
    <div class="section-title"><h2>Identidad creativa</h2></div>
    ${f("id_name","Nombre creativo",a.name)}
    <div style="display:flex;gap:10px"><div style="flex:1">${f("id_disc","Rama artística",a.discipline||a.role,"Muralismo, tattoo…")}</div><div style="flex:1">${f("id_spec","Especialidad",a.specialty)}</div></div>
    <div style="display:flex;gap:10px"><div style="flex:1">${f("id_handle","Alias público",a.handle,"@tualias")}</div><div style="flex:1">${f("id_terr","Territorio",a.territory||a.country,"Ciudad, país")}</div></div>
    <div class="field"><label>Bio</label><textarea id="id_bio" rows="3">${esc(a.bio||"")}</textarea></div>
    ${f("id_tags","Etiquetas (separadas por coma)",(a.tags||[]).join(", "))}
    <div class="section-title" style="margin-top:8px"><h2 style="font-size:16px">Enlaces</h2></div>
    <div style="display:flex;gap:10px"><div style="flex:1">${f("id_web","Sitio web",a.website)}</div><div style="flex:1">${f("id_ig","Instagram",a.instagram)}</div></div>
    <div style="display:flex;gap:10px"><div style="flex:1">${f("id_port","Portafolio",a.portfolio_url)}</div><div style="flex:1">${f("id_shop","Tienda / catálogo",a.shop_url)}</div></div>
    <button class="btn" id="idSave" style="width:100%;margin-top:6px">Guardar identidad</button>
  </div>
  <div class="card s4" style="align-self:start">
    <div class="section-title"><h2 style="font-size:16px">Foto del Alma</h2></div>
    <div style="text-align:center;margin:4px 0 14px">${avatarHTML(a,"lg")}</div>
    ${imgUpField("id_photo","Foto del Alma", a.photo, "perfil")}
    <p class="muted" style="font-size:11.5px;margin-top:4px">Súbela en <b>alta calidad</b>. El <b>banner</b> de tu portafolio se edita en la ventana <b>Portafolio → ✎ Personalizar</b>.</p>
  </div>`;
}
function vAlmaPublica(a){
  if(!a.live) return `<div class="card s12"><p class="muted">Entra a tu Alma para configurar tu vista pública.</p></div>`;
  const v=a.visibility||{}; const on=k=>v[k]!==false;
  const rows=[["bio","Mostrar mi bio"],["tags","Mostrar mis etiquetas"],["location","Mostrar mi ubicación"],["trajectory","Mostrar mi trayectoria"],["portfolio","Mostrar mi portafolio"],["links","Mostrar mis enlaces"]];
  return `<div class="card s12"><span class="pill gold">Vista pública</span>
    <p class="muted" style="max-width:640px">Controla qué ven las demás Almas cuando visitan tu Alma en la comunidad. Tu Raíz, agenda, memorias y vínculos <b>siempre son privados</b>.</p>
    ${rows.map(([k,l])=>`<div class="row"><div class="grow"><b>${l}</b></div><button class="toggle ${on(k)?'on':''}" data-pubcfg="${k}"><span></span></button></div>`).join("")}
  </div>`;
}
/* Gráficos simples */
function chartFinance(a){
  const map={};
  a.finance.income.forEach(x=>{const k=(x.d||x.on||"").slice(0,7);if(k){(map[k]=map[k]||{i:0,e:0}).i+=x.a;}});
  a.finance.expense.forEach(x=>{const k=(x.d||x.on||"").slice(0,7);if(k){(map[k]=map[k]||{i:0,e:0}).e+=x.a;}});
  const keys=Object.keys(map).sort().slice(-6);
  if(!keys.length) return `<p class="muted">Aún no hay datos de Raíz.</p>`;
  const max=Math.max(1,...keys.map(k=>Math.max(map[k].i,map[k].e)));
  return `<div class="chart">${keys.map(k=>`<div class="cbar"><div class="cbars"><span class="ci" style="height:${Math.round(map[k].i/max*100)}%" title="Ingresos ${money(map[k].i)}"></span><span class="ce" style="height:${Math.round(map[k].e/max*100)}%" title="Egresos ${money(map[k].e)}"></span></div><small>${k.slice(2)}</small></div>`).join("")}</div>
    <div class="muted" style="font-size:11px;margin-top:8px"><b style="color:var(--ok)">■</b> Ingresos &nbsp; <b style="color:var(--danger)">■</b> Egresos</div>`;
}
function chartProjects(a){
  const counts=FLOW.map(s=>({s,n:a.projects.filter(p=>flowOf(p.st)===s).length}));
  const max=Math.max(1,...counts.map(c=>c.n));
  return `<div>${counts.map(c=>`<div class="hbar"><small>${c.s}</small><div class="hb"><span style="width:${Math.round(c.n/max*100)}%"></span></div><b>${c.n}</b></div>`).join("")}</div>`;
}
async function saveIdentity(){
  const a=me(); if(!a.live) return;
  const g=id=>{const e=document.getElementById(id);return e?e.value.trim():"";};
  const patch={ name:g("id_name"), discipline:g("id_disc"), specialty:g("id_spec"), handle:g("id_handle"),
    territory:g("id_terr"), bio:g("id_bio"), avatar_url:g("id_photo"), website:g("id_web"),
    instagram:g("id_ig"), portfolio_url:g("id_port"), shop_url:g("id_shop"),
    tags:g("id_tags").split(",").map(s=>s.trim()).filter(Boolean) };
  try{ await Cloud.updateAlma(a.almaId,patch);
    a.name=patch.name; a.discipline=patch.discipline; a.specialty=patch.specialty; a.handle=patch.handle;
    a.territory=patch.territory; a.bio=patch.bio; a.photo=patch.avatar_url; a.website=patch.website;
    a.instagram=patch.instagram; a.portfolio_url=patch.portfolio_url; a.shop_url=patch.shop_url; a.tags=patch.tags;
    a.role=patch.discipline||a.role;
    // Esencia: completar el perfil con lo esencial (una sola vez)
    if(window.AnimaState && patch.bio && patch.discipline && (patch.tags||[]).length){ AnimaState.addEsenciaOnce("perfil",20,"Completar tu Alma"); setTimeout(maybeLevelGuide,400); }
    renderAll(); updateAuthUI(await Cloud.session()); alert("Identidad guardada ✓");
  }catch(e){ alert("No se pudo guardar (¿aplicaste la migración 0003?): "+(e.message||e)); }
}
async function togglePublic(key){
  const a=me(); if(!a.live) return; a.visibility=a.visibility||{}; a.visibility[key]=(a.visibility[key]===false);
  try{ await Cloud.updateAlma(a.almaId,{visibility:a.visibility}); }catch(e){}
  renderAll();
}

/* --- Trayectoria --- */
function vTrayectoria(a){
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Trayectoria</h2><div class="spacer"></div><button class="btn sm" data-add="hito">+ Hito</button></div>
    <div class="tl">${a.trajectory.map((n,i)=>`<div class="node"><div style="display:flex;align-items:flex-start"><div class="grow"><div class="yr">${esc(n.y)}</div><b>${esc(n.t)}</b><p class="muted" style="margin:4px 0 0">${esc(n.d)}</p></div>${acts("hito",i)}</div></div>`).join("")||`<p class="muted">Aún no hay hitos.</p>`}</div>
  </div></div>`;
}

/* --- Portafolio (galería tipo Behance) --- */
function isImgUrl(u){ return u && (/\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(u) || /\/storage\/v1\/object\/public\/media\//.test(u)); }

/* Campo de subida de imagen en ALTA CALIDAD (Supabase Storage, bucket "media").
   Reutilizable: portada de obra, foto de perfil y banner. Permite subir archivo
   o pegar un enlace; muestra vista previa en vivo. */
function imgUpField(inputId, label, val, folder){
  const has = val && isImgUrl(val);
  return `<div class="field"><label>${label}</label>
    <div class="img-up">
      <div class="img-prev ${has?'has':''}" id="prev_${inputId}" style="${has?`background-image:url('${esc(val)}')`:''}">${has?'':'Sin imagen'}</div>
      <label class="btn sm secondary img-pick">⤒ Subir foto<input type="file" accept="image/*" hidden data-imgfield="1" data-imgfolder="${folder||'obra'}" data-imgtarget="${inputId}" data-imgprev="prev_${inputId}" data-imgstatus="up_${inputId}"></label>
      <input id="${inputId}" data-imgurl="prev_${inputId}" type="text" placeholder="o pega el enlace de una imagen" value="${esc(val||'')}">
    </div>
    <small class="muted img-hint" id="up_${inputId}">JPG · PNG · WebP — hasta 15 MB, en alta calidad.</small></div>`;
}
/* Buckets separados (Alpha 2026): cada tipo de archivo en su sitio,
   con su propio límite. avatars ≤ 2 MB · portfolio ≤ 10 MB. */
const UPLOAD_BUCKETS = {
  perfil:{ bucket:"avatars",   maxMB:2,  folder:"avatar" },
  obra:  { bucket:"portfolio", maxMB:10, folder:"obra" },
  banner:{ bucket:"media",     maxMB:10, folder:"banner" }
};
async function uploadImgField(fileInput){
  const file = fileInput.files && fileInput.files[0]; if(!file) return;
  const a = me();
  const status = document.getElementById(fileInput.dataset.imgstatus||"");
  const setS = t => { if(status) status.textContent = t; };
  const done = ()=>{ try{ fileInput.value=""; }catch(e){} };
  if(!a.live || !Cloud.enabled){ setS("Para subir fotos en alta calidad entra a tu Alma en la nube. También puedes pegar un enlace."); return done(); }
  if(!/^image\//.test(file.type||"")){ setS("Elige un archivo de imagen."); return done(); }
  const dest = UPLOAD_BUCKETS[fileInput.dataset.imgfolder] || UPLOAD_BUCKETS.banner;
  if(file.size > dest.maxMB*1024*1024){ setS(`La imagen supera ${dest.maxMB} MB. Sube una versión más liviana.`); return done(); }
  // Límite de obras por nivel: una nueva huella no debe exceder el umbral del Alma.
  if(fileInput.dataset.imgfolder==="obra"){
    const lim = storageLimit(a.level).images;
    const isNew = !(recordCtx && recordCtx.idx!=null);
    if(isNew && (a.portfolio||[]).length >= lim){
      setS(`Has alcanzado el límite de ${lim} obras para tu nivel (${levelByKey(a.level).label}). Sube de nivel para guardar más.`);
      return done();
    }
  }
  setS("Subiendo en alta calidad…");
  try{
    const url = dest.bucket==="media"
      ? await Cloud.uploadMedia(file, dest.folder)
      : await Cloud.uploadTo(dest.bucket, file, dest.folder);
    const inp = document.getElementById(fileInput.dataset.imgtarget); if(inp) inp.value = url;
    const prev = document.getElementById(fileInput.dataset.imgprev); if(prev){ prev.style.backgroundImage = `url('${url}')`; prev.textContent = ""; prev.classList.add("has"); }
    setS("Listo ✓ Imagen en alta calidad.");
  }catch(err){ setS("No se pudo subir: "+(err.message||err)); }
  done();
}
const AVAIL_OPTS=[
  ["","Sin indicar"],
  ["Disponible para proyectos","🟢 Disponible para proyectos"],
  ["Disponible (freelance)","🟢 Disponible · freelance"],
  ["Agenda limitada","🟡 Agenda limitada"],
  ["No disponible por ahora","⚪ No disponible por ahora"]
];
function availBadge(v){ if(!v) return ""; const dot=v.startsWith("No")?"⚪":v.startsWith("Agenda")?"🟡":"🟢";
  const cls=v.startsWith("No")?"":v.startsWith("Agenda")?"warn":"ok"; return `<span class="pill ${cls} pf-avail">${dot} ${esc(v)}</span>`; }
function pfLinks(a){ const L=[]; if(a.website)L.push(["Sitio web",a.website]);
  if(a.instagram)L.push(["Instagram",a.instagram.startsWith("http")?a.instagram:"https://instagram.com/"+a.instagram.replace("@","")]);
  if(a.portfolio_url)L.push(["Portafolio",a.portfolio_url]); if(a.shop_url)L.push(["Tienda",a.shop_url]); return L; }
function isPublicPf(a){ return !!(a.visibility && a.visibility.public===true); }

function pfHero(a){
  const banner = (a.banner && isImgUrl(a.banner))
    ? `background-image:url('${esc(a.banner)}')`
    : `background:linear-gradient(135deg,${a.color||'#b8a892'},${shade(a.color||'#b8a892',-40)})`;
  const pub=isPublicPf(a);
  return `<div class="card s12 pf-hero">
      <div class="pf-hero-banner" style="${banner}"></div>
      <div class="pf-hero-bar">
        <div class="pf-hero-id">${avatarHTML(a,"lg")}
          <div><h2 style="margin:0;font-size:24px;letter-spacing:-.04em">${esc(a.name)}</h2>
            <small class="muted">${esc([a.discipline||a.role,a.specialty].filter(Boolean).join(" · ")||"Tu portafolio")} · ${a.portfolio.length} obra${a.portfolio.length===1?"":"s"}</small></div>
        </div>
        <div class="pf-hero-acts">
          <button class="pf-pubtoggle ${pub?'on':''}" data-pfpublic title="Activa o desactiva tu portafolio público"><span class="toggle ${pub?'on':''}"></span>${pub?'Público':'Privado'}</button>
          ${a.live&&pub?`<a class="btn ghost sm" href="portfolio.html?alma=${a.almaId}" target="_blank" rel="noopener">Ver público ↗</a>`:""}
          <button class="btn secondary sm" data-pfedit>✎ Personalizar</button>
          <button class="btn gold sm" data-add="obra">＋ Subir obra</button>
        </div>
      </div>
    </div>`;
}
function memberSince(a){ if(!a.created_at) return ""; const d=new Date(a.created_at); return isNaN(d)?"":d.toLocaleDateString("es-CL",{year:"numeric",month:"long"}); }
function pfInfoCard(a){
  const loc=a.territory||a.country||""; const services=a.tags||[]; const links=pfLinks(a);
  const head=a.headline||[a.discipline||a.role,a.specialty].filter(Boolean).join(" · ");
  const lv=levelByKey(a.level); const since=memberSince(a);
  return `<div class="card s4 pf-info">
    <div class="pf-info-top">${avatarHTML(a,"lg")}
      <h3>${esc(a.name)}</h3>
      ${head?`<p class="pf-headline">${esc(head)}</p>`:""}
      <div class="pf-info-loc">${lv.emoji} ${esc(lv.label)}${loc?` · ⌖ ${esc(loc)}`:""}</div>
      ${availBadge(a.availability)}
    </div>
    <div class="pf-info-stats">
      <div><b>✦ ${(a.sparks||0).toLocaleString("es-CL")}</b><small>Chispas</small></div>
      <div><b>${a.portfolio.length}</b><small>Obras</small></div>
      <div><b>${(a.xp||0).toLocaleString("es-CL")}</b><small>Esencia</small></div>
    </div>
    ${a.bio?`<div class="pf-info-sec"><span class="pf-info-h">Sobre mí</span><p>${esc(a.bio)}</p></div>`:""}
    ${services.length?`<div class="pf-info-sec"><span class="pf-info-h">Servicios</span><div class="pf-chips">${services.map(t=>`<span class="chip">${esc(t)}</span>`).join("")}</div></div>`:""}
    ${links.length?`<div class="pf-info-sec"><span class="pf-info-h">Enlaces</span><div class="pf-links">${links.map(([t,u])=>`<a href="${esc(u)}" target="_blank" rel="noopener">${t} ↗</a>`).join("")}</div></div>`:""}
    <div class="pf-info-foot">${since?`En ANIMA desde ${esc(since)} · `:""}${isPublicPf(a)?"Portafolio público":"Portafolio privado"}</div>
    <button class="btn secondary sm" data-pfedit style="width:100%;margin-top:12px">✎ Editar tarjeta y portada</button>
  </div>`;
}
function pfEditor(a){
  const f=(id,l,v,ph="")=>`<div class="field"><label>${l}</label><input id="${id}" value="${esc(v||"")}" placeholder="${ph}"></div>`;
  const availSel=`<div class="field"><label>Disponibilidad</label><select id="pf_avail">${AVAIL_OPTS.map(([val,lab])=>`<option value="${esc(val)}" ${val===(a.availability||"")?'selected':''}>${lab}</option>`).join("")}</select></div>`;
  return `<div class="card s12">
    <div class="section-title"><h2 style="font-size:18px">Personaliza tu portafolio</h2><div class="spacer"></div>
      <button class="btn ghost sm" data-pfcancel>Cancelar</button><button class="btn sm" id="pfSave">Guardar</button></div>
    <div class="row" style="border:0;padding:2px 0 12px"><div class="grow"><b>Portafolio público</b><br><small class="muted">${a.live?"Si lo apagas, tu enlace muestra tu Alma como privada para las demás Almas.":"Entra a tu Alma en la nube para publicar tu portafolio."}</small></div>
      <button class="toggle ${isPublicPf(a)?'on':''}" data-pfpublic></button></div>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <div style="flex:2;min-width:240px">${imgUpField("pf_banner","Banner / portada", a.banner, "banner")}
        <small class="muted">Medidas recomendadas: <b>1600 × 400 px</b> (proporción 4:1). JPG o PNG, hasta 15 MB. Deja el centro despejado: en móvil se recorta a los lados.</small></div>
      <div style="flex:1;min-width:180px">${imgUpField("pf_photo","Foto del Alma", a.photo, "perfil")}
        <small class="muted">Recomendado: <b>400 × 400 px</b>, cuadrada.</small></div>
    </div>
    <div class="section-title" style="margin-top:12px"><h2 style="font-size:16px">Tarjeta de información</h2></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><div style="flex:2;min-width:200px">${f("pf_headline2","Titular (ej: Artista visual · Muralista)",a.headline)}</div><div style="flex:1;min-width:160px">${f("pf_loc","Ubicación",a.territory||a.country,"Ciudad, país")}</div></div>
    ${availSel}
    <div class="field"><label>Sobre mí</label><textarea id="pf_bio" rows="3" placeholder="Quién eres, qué haces y qué te mueve como creador.">${esc(a.bio||"")}</textarea></div>
    ${f("pf_tags","Servicios / habilidades (separados por coma)",(a.tags||[]).join(", "),"Muralismo, Fotografía, Dirección creativa")}
    <div class="section-title" style="margin-top:8px"><h2 style="font-size:15px">Enlaces</h2></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><div style="flex:1;min-width:160px">${f("pf_web","Sitio web",a.website)}</div><div style="flex:1;min-width:160px">${f("pf_ig","Instagram",a.instagram)}</div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><div style="flex:1;min-width:160px">${f("pf_port","Portafolio externo",a.portfolio_url)}</div><div style="flex:1;min-width:160px">${f("pf_shop","Tienda / catálogo",a.shop_url)}</div></div>
  </div>`;
}
function pfWorks(a){
  return a.portfolio.length
    ? `<div class="card s8"><div class="section-title"><h2 style="font-size:18px">Obras</h2><div class="spacer"></div><button class="btn sm" data-add="obra">＋ Subir obra</button></div>
        <div class="pf-grid">${a.portfolio.map((p,i)=>{
          const cover=isImgUrl(p.link)?`background-image:url('${esc(p.link)}');background-size:cover;background-position:center`
            :`background:linear-gradient(145deg,${p.c},${shade(p.c,-28)})`;
          return `<div class="pf-card">
            <div class="pf-cover" style="${cover}">${isImgUrl(p.link)?"":`<span>${initials(p.t)}</span>`}<div class="pf-acts">${acts("obra",i)}</div></div>
            <div class="pf-cap"><b>${esc(p.t)}</b><small>${esc([p.k,p.year].filter(Boolean).join(" · "))}</small>${p.desc?`<p>${esc(p.desc)}</p>`:""}${p.link&&!isImgUrl(p.link)?`<a href="${esc(p.link)}" target="_blank" rel="noopener" class="pf-link">Ver →</a>`:""}</div>
          </div>`; }).join("")}</div></div>`
    : `<div class="card s8 pf-empty">
        <span class="pf-empty-ico">▦</span>
        <h2 style="margin:10px 0 4px;letter-spacing:-.03em">Tu portafolio empieza aquí</h2>
        <p class="muted" style="max-width:440px;margin:0 auto 18px">Sube tus obras en <b>alta calidad</b> — se verán en tu Alma pública, profesional como en Behance. Cada obra suma Esencia.</p>
        <button class="btn gold" data-add="obra">＋ Subir mi primera obra</button>
      </div>`;
}
function vPortafolio(a){
  if(state.pfEdit) return `<div class="grid">${pfHero(a)}${pfEditor(a)}</div>`;
  return `<div class="grid">${pfHero(a)}${pfInfoCard(a)}${pfWorks(a)}</div>`;
}
function portfolioEdit(){ const a=me(); if(!a.live){ if(Cloud.enabled){ openAuth(); } else { alert("Entra a tu Alma para personalizar tu portafolio."); } return; } state.pfEdit=true; renderView(); }
function portfolioCancel(){ state.pfEdit=false; renderView(); }
async function togglePortfolioPublic(){
  const a=me(); if(!a.live){ alert("Entra a tu Alma en la nube para publicar tu portafolio."); return; }
  a.visibility=a.visibility||{}; a.visibility.public=!isPublicPf(a);
  try{ await Cloud.updateAlma(a.almaId,{visibility:a.visibility}); }catch(e){ alert("No se pudo cambiar la visibilidad: "+(e.message||e)); }
  renderView();
}
async function savePortfolioProfile(){
  const a=me(); if(!a.live){ alert("Entra a tu Alma para guardar tu portafolio."); return; }
  const g=id=>{const e=document.getElementById(id);return e?e.value.trim():"";};
  const patch={ banner_url:g("pf_banner"), avatar_url:g("pf_photo"), headline:g("pf_headline2"),
    availability:g("pf_avail"), territory:g("pf_loc"), bio:g("pf_bio"), website:g("pf_web"),
    instagram:g("pf_ig"), portfolio_url:g("pf_port"), shop_url:g("pf_shop"),
    tags:g("pf_tags").split(",").map(s=>s.trim()).filter(Boolean) };
  try{ await Cloud.updateAlma(a.almaId,patch);
    a.banner=patch.banner_url; a.photo=patch.avatar_url; a.headline=patch.headline; a.availability=patch.availability;
    a.territory=patch.territory; a.bio=patch.bio; a.website=patch.website; a.instagram=patch.instagram;
    a.portfolio_url=patch.portfolio_url; a.shop_url=patch.shop_url; a.tags=patch.tags;
    state.pfEdit=false; renderAll(); alert("Portafolio actualizado ✓");
  }catch(e){ alert("No se pudo guardar: "+(e.message||e)); }
}

/* --- Proyectos: Flujo de trabajo (kanban) --- */
const FLOW=["Cotizando","Aprobado","En producción","Revisión","Entregado","Cerrado"];
function flowOf(st){ if(FLOW.includes(st)) return st; if(st==="En curso") return "En producción"; if(st==="Terminado"||st==="Cerrado") return "Cerrado"; return "Cotizando"; }
function vProyectos(a){
  const cols=FLOW.map(s=>({s,items:[]}));
  a.projects.forEach((p,i)=>{ const col=cols.find(c=>c.s===flowOf(p.st)); (col||cols[0]).items.push({p,i}); });
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Flujo de trabajo</h2><div class="spacer"></div><span class="muted" style="font-size:12.5px;margin-right:10px">${a.projects.length} trabajos</span><button class="btn sm" data-add="proyecto">+ Nuevo trabajo</button></div>
    <div class="kanban">
      ${cols.map(c=>`<div class="kcol"><div class="kcol-h">${c.s.toUpperCase()}<span>${c.items.length||""}</span></div>
        ${c.items.map(({p,i})=>{ const bal=(p.budget||0)-(p.paid||0);
          const meta=[p.client,p.budget?money(p.budget):"",p.budget?("saldo "+money(bal)):""].filter(Boolean).join(" · ");
          return `<div class="kcard"><b>${esc(p.t)}</b><small>${esc(meta)}</small>${p.due?`<small class="muted">Entrega ${esc(p.due)}</small>`:""}${p.desc?`<p>${esc(p.desc)}</p>`:""}
            <select class="kstatus" data-pstatus="${i}">${FLOW.map(s=>`<option ${s===flowOf(p.st)?'selected':''}>${s}</option>`).join("")}</select>
            <div class="kacts">${acts("proyecto",i)}</div></div>`; }).join("")||`<div class="kempty">Sin trabajos.</div>`}
      </div>`).join("")}
    </div>
  </div></div>`;
}
async function setProjectStatus(i,st){
  const a=me(); const p=a.projects[i]; if(!p) return; p.st=st;
  if(a.live && p._id){ try{ await Cloud.updateRow("projects",p._id,{status:st}); }catch(e){ alert("No se pudo mover: "+(e.message||e)); } }
  save(); renderAll();
}

/* --- Finanzas --- */
function vFinanzas(a){
  const inc=sum(a.finance.income), exp=sum(a.finance.expense);
  return `<div class="grid">
    <div class="card s4"><div class="stat"><span class="num" style="color:var(--ok)">${money(inc)}</span><span class="lbl">Ingresos totales</span></div></div>
    <div class="card s4"><div class="stat"><span class="num" style="color:var(--danger)">${money(exp)}</span><span class="lbl">Egresos totales</span></div></div>
    <div class="card s4"><div class="stat"><span class="num">${money(inc-exp)}</span><span class="lbl">Ganancia neta</span></div></div>
    <div class="card s6"><div class="section-title"><h2>Ingresos</h2><div class="spacer"></div><button class="btn sm" data-add="ingreso">+ Ingreso</button></div>
      ${a.finance.income.map((x,i)=>`<div class="row"><div class="grow"><b>${esc(x.t)}</b><br><small>${esc(x.d)}</small></div><span class="amt in">+${money(x.a)}</span>${acts("ingreso",i)}</div>`).join("")||`<p class="muted">Sin ingresos.</p>`}</div>
    <div class="card s6"><div class="section-title"><h2>Egresos</h2><div class="spacer"></div><button class="btn sm secondary" data-add="egreso">+ Egreso</button></div>
      ${a.finance.expense.map((x,i)=>`<div class="row"><div class="grow"><b>${esc(x.t)}</b><br><small>${esc(x.d)}</small></div><span class="amt out">−${money(x.a)}</span>${acts("egreso",i)}</div>`).join("")||`<p class="muted">Sin egresos.</p>`}</div>
    <div class="card s12 muted" style="font-size:12.5px">🔒 Tu Raíz es privada. Mi Alma ≠ Mi Clan. Nada se comparte automáticamente.</div>
  </div>`;
}

/* --- Agenda --- */
function vAgenda(a){
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Agenda</h2><div class="spacer"></div><button class="btn sm" data-add="cita">+ Cita</button></div>
    ${a.agenda.map((x,i)=>`<div class="row"><b style="color:var(--gold);width:70px">${esc(x.h)}</b><div class="grow">${esc(x.t)}</div>${acts("cita",i)}</div>`).join("")||`<p class="muted">Día libre.</p>`}
  </div></div>`;
}

/* --- Memoria --- */
function vMemoria(a){
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Memorias</h2><div class="spacer"></div><button class="btn sm" data-add="memoria">+ Nueva memoria</button></div>
    ${a.memories.map((m,i)=>`<div class="row"><span style="color:var(--gold);font-size:18px">✦</span><div class="grow"><b>${esc(m.t)}</b><br><small>${esc(m.d)}</small></div>${acts("memoria",i)}</div>`).join("")||`<p class="muted">Aún no guardas memorias.</p>`}
  </div></div>`;
}

/* --- Biblioteca --- */
function vBiblioteca(a){
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Biblioteca</h2><div class="spacer"></div><button class="btn sm" data-add="doc">+ Documento</button></div>
    ${a.library.map((d,i)=>`<div class="row"><span style="font-size:18px">❏</span><div class="grow"><b>${esc(d.t)}</b></div><span class="chip">${esc(d.k)}</span>${acts("doc",i)}</div>`).join("")||`<p class="muted">Biblioteca vacía.</p>`}
    <p class="muted" style="margin-top:16px;font-size:12.5px">LUMBRE en modo IA Local podrá leer estos PDFs y ordenar tu memoria sin enviar nada a internet.</p>
  </div></div>`;
}

/* --- Personalizar --- */
function vConfigBody(a){
  const cfg=getCfg(a);
  const mod=[["trayectoria","Trayectoria"],["portafolio","Portafolio"],["proyectos","Flujo de trabajo"],["finanzas","Raíz"],["clientes","Vínculos"],["cotizador","Cotizador"],["agenda","Agenda"],["memoria","Memorias"],["biblioteca","Biblioteca"]];
  const card=[["kpis","Indicadores rápidos"],["camino","Camino (pixel art)"],["graficos","Gráficos"],["hoy","Agenda de hoy"],["memoria","Última memoria"]];
  const tg=(g,k,l,on)=>`<div class="row"><div class="grow"><b>${l}</b></div><button class="toggle ${on?'on':''}" data-cfg="${g}:${k}"><span></span></button></div>`;
  return `<div class="card s12"><span class="pill gold">Personalización</span>
      <p class="muted" style="max-width:640px">Configura tu espacio: qué módulos aparecen en tu menú y qué secciones se muestran en tu panel.</p></div>
    <div class="card s6"><div class="section-title"><h2>Módulos del menú</h2></div>${mod.map(([k,l])=>tg("modules",k,l,cfg.modules[k]!==false)).join("")}</div>
    <div class="card s6"><div class="section-title"><h2>Secciones de Mi Alma</h2></div>${card.map(([k,l])=>tg("cards",k,l,cfg.cards[k]!==false)).join("")}</div>`;
}
function vConfig(a){ return `<div class="grid">${vConfigBody(a)}</div>`; }

/* --- Consola del Creador (Fase 3) --- */
function previewBanner(){
  if(!state.viewAs) return "";
  const l=(PLAN_TIERS.find(t=>t[0]===state.viewAs)||["",state.viewAs])[1];
  return `<div class="viewas-banner">Viendo ANIMA como <b>${l}</b> — vista previa, no se modifica ningún dato.
    <button class="btn sm" data-viewas="">Salir de la vista ✕</button></div>`;
}
function setViewAs(tier){
  if(!isCreator) return;
  state.viewAs = tier || null;
  if(state.viewAs && !planAllows(state.view)) state.view="mialma";
  save(); renderAll(); closeSide();
}
function vConsola(a){
  const va=state.viewAs;
  const omni=`<div class="card s12">
      <div class="section-title"><h2>Omnipresencia · Ver como</h2></div>
      <p class="muted" style="max-width:640px">Previsualiza ANIMA tal como la vería cada umbral. Es solo una vista del Studio: <b>no cambia ningún dato real</b>.</p>
      <div class="viewas-row">
        ${PLAN_TIERS.map(([k,l])=>`<button class="btn sm ${va===k?'gold':''}" data-viewas="${k}">${l}</button>`).join("")}
        <button class="btn sm ${!va?'gold':''}" data-viewas="">Creador (todo)</button>
      </div></div>`;

  const note=`<div class="card s12" style="background:linear-gradient(145deg,rgba(58,138,95,.12),rgba(255,255,255,.6))">
      <span class="pill" style="background:rgba(58,138,95,.16);border:1px solid rgba(58,138,95,.4);color:#2f7a52">Backend conectado ✓</span>
      <p class="muted" style="max-width:680px;margin-top:8px">Estás conectado a Supabase. Puedes asignar <b>Plan</b>, <b>Rol</b>, nivel, Esencia, rol-crew y clan a cualquier Alma; se guarda en la nube al instante.
        Para gestionar Almas necesitas haber entrado con el correo del Creador (<b>${esc(CREATOR_EMAIL)}</b>).</p></div>`;

  const almas=state.cloudAlmas||[];
  const rows = almas.length ? almas.map(x=>{
    const lv=levelByKey(x.level);
    const lopts=LEVELS.map(l=>`<option value="${l.key}" ${l.key===(x.level||'EMBER')?'selected':''}>${l.emoji} ${l.label} · ${esc(l.name)}</option>`).join("");
    const popts=PLAN_TIERS.map(([k,l])=>`<option value="${k}" ${k===(x.plan||'ALMA')?'selected':''}>${l}</option>`).join("");
    const ropts=ROLES.map(([k,l])=>`<option value="${k}" ${k===(x.team_role||'MIEMBRO')?'selected':''}>${l}</option>`).join("");
    const pm=PLAN_META[x.plan||'ALMA']||PLAN_META.ALMA;
    return `<div class="card s12 cs-row">
        <div class="row" style="align-items:flex-start;margin-bottom:10px">
          <span class="avatar sm" style="background:linear-gradient(145deg,${x.color||'#888'},${shade(x.color||'#888',-22)})">${initials(x.name)}</span>
          <div class="grow"><b>${esc(x.name)}</b> ${planBadge(x.plan||'ALMA')} ${roleBadge(x.team_role||'MIEMBRO')}<br><small class="muted">${lv.emoji} ${esc(x.level||'EMBER')} · ${x.xp||0} Esencia${x.clan?` · ${esc(x.clan)}`:""}${x.crew_role?` · ${esc(x.crew_role)}`:""}</small></div>
        </div>
        <div class="cs-fields">
          <label class="fld"><span>Plan</span><select id="cs_plan_${x.id}">${popts}</select></label>
          <label class="fld"><span>Rol</span><select id="cs_trole_${x.id}">${ropts}</select></label>
          <label class="fld"><span>Nivel</span><select id="cs_level_${x.id}">${lopts}</select></label>
          <label class="fld"><span>Esencia</span><input id="cs_xp_${x.id}" type="number" min="0" value="${x.xp||0}"></label>
          <label class="fld"><span>Rol (crew)</span><input id="cs_role_${x.id}" type="text" value="${esc(x.crew_role||'')}" placeholder="FOUNDING / rol"></label>
          <label class="fld"><span>Clan</span><input id="cs_clan_${x.id}" type="text" value="${esc(x.clan||'')}" placeholder="slug del clan"></label>
          <label class="fld"><span>Acceso al Mundo</span><select id="cs_world_${x.id}"><option value="no" ${!x.world_access?'selected':''}>No</option><option value="si" ${x.world_access?'selected':''}>Sí — ve el resumen general</option></select></label>
          <button class="btn sm gold cs-save" id="cs_save_${x.id}" data-cssave="${x.id}">Guardar</button>
        </div>
      </div>`;
  }).join("") : `<div class="card s12"><p class="muted">Aún no hay Almas reales. Cuando alguien cruce el umbral aparecerá aquí.</p></div>`;

  return `<div class="grid">${omni}${note}${rows}</div>`;
}
async function consolaSave(almaId){
  if(!isCreator || !Cloud.enabled) return;
  const g=id=>document.getElementById(id);
  const core={
    level: g("cs_level_"+almaId).value,
    crew_role: (g("cs_role_"+almaId).value||"").trim() || null,
    clan: (g("cs_clan_"+almaId).value||"").trim() || null,
    world_access: g("cs_world_"+almaId).value==="si"
  };
  const xpv=g("cs_xp_"+almaId).value;
  if(xpv!=="") core.xp=Math.max(0, parseInt(xpv,10)||0);
  const planRole={ plan:g("cs_plan_"+almaId).value, team_role:g("cs_trole_"+almaId).value||null };
  const btn=g("cs_save_"+almaId); if(btn){ btn.disabled=true; btn.textContent="Guardando…"; }
  try{
    const rows=await Cloud.adminUpdateAlma(almaId, core);
    if(!rows.length) throw new Error("No se aplicó el cambio. Asegúrate de haber entrado con el correo del Creador ("+CREATOR_EMAIL+").");
    // Plan y rol se guardan aparte para no bloquear el resto si algo falla.
    let planWarn="";
    try{ await Cloud.adminUpdateAlma(almaId, planRole); }
    catch(e2){ planWarn=" (No se pudo guardar Plan/Rol: "+(e2.message||e2)+")"; }
    state.cloudAlmas=await Cloud.allAlmas();
    renderView();
    alert("Alma actualizada ✓"+planWarn);
  }catch(e){
    alert("No se pudo guardar: "+(e.message||e));
    if(btn){ btn.disabled=false; btn.textContent="Guardar"; }
  }
}

/* --- Clientes --- */
function vClientes(a){
  const list=a.clients||[];
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Vínculos</h2><div class="spacer"></div><button class="btn sm" data-add="cliente">+ Nuevo vínculo</button></div>
    ${list.length?list.map((c,i)=>`<div class="row"><span class="avatar sm" style="background:linear-gradient(145deg,${a.color},${shade(a.color,-22)})">${initials(c.name)}</span>
        <div class="grow"><b>${esc(c.name)}</b><br><small>${esc(c.email||"")}${c.email&&c.phone?" · ":""}${esc(c.phone||"")}</small>${c.notes?`<br><small class="muted">${esc(c.notes)}</small>`:""}</div>${acts("cliente",i)}</div>`).join("")
      :`<p class="muted">Aún no tienes vínculos. Se crean solos al guardar una cotización, o agrégalos aquí.</p>`}
  </div></div>`;
}

/* ===========================================================
   COTIZADOR — presupuestos profesionales + PDF
   =========================================================== */
const CURRENCIES={CLP:"$",USD:"US$",EUR:"€",MXN:"MX$",ARS:"AR$",COP:"CO$",PEN:"S/"};
const fmtq=(n,c)=>(CURRENCIES[c]||"$")+Number(n||0).toLocaleString("es-CL");
function blankQuote(){ return { id:null, client_id:null, project_id:null, docType:"cotizacion", title:"Cotización", client:"", date:new Date().toISOString().slice(0,10),
  discipline:"", currency:"CLP", taxPct:0, notes:"", items:[{desc:"",qty:1,price:0,unit:"unidad"}] }; }

/* ---------- Centro documental: formatos + plantillas (estilo Canva, identidad ANIMA) ---------- */
const DOC_FORMATS=[
  {id:"cotizacion", t:"Cotización",         ico:"₵", d:"Presupuesto detallado, ítem por ítem."},
  {id:"propuesta",  t:"Propuesta",          ico:"✦", d:"Concepto + inversión. La obra se explica con palabras."},
  {id:"factura",    t:"Factura · Honorarios", ico:"$", d:"Cobro formal de un trabajo entregado."},
  {id:"orden",      t:"Orden de trabajo",    ico:"◷", d:"Lo acordado, listo para producción."},
  {id:"anticipo",   t:"Recibo de anticipo",  ico:"⛨", d:"Comprobante del anticipo para iniciar."},
  {id:"acuerdo",    t:"Acuerdo breve",       ico:"❏", d:"Alcance, plazos y condiciones en una página."}
];
const docFmt=id=>DOC_FORMATS.find(f=>f.id===id)||DOC_FORMATS[0];
const TEMPLATES=[
  {id:"mural_pub", t:"Mural publicitario", ico:"🜂", disc:"Muralismo · Marca", fmt:"propuesta",
   note:"Anticipo 50% para iniciar (cubre materiales, pre-producción y boceto). Saldo contra entrega. Incluye documentación fotográfica del proceso. Validez 15 días.",
   items:[["Concepto + boceto (dirección creativa)",1,"proyecto"],["Intervención mural",1,"m²"],["Materiales (aerosol / acrílico)",1,"global"],["Jornadas de ejecución",1,"jornada"],["Documentación foto + video",1,"global"]]},
  {id:"mural_dec", t:"Mural decorativo", ico:"◈", disc:"Muralismo · Espacio", fmt:"cotizacion",
   note:"El concepto parte del espacio y de quién lo vive. Anticipo 50%. Validez 15 días.",
   items:[["Visita y lectura del espacio",1,"visita"],["Concepto y paleta",1,"proyecto"],["Intervención mural",1,"m²"],["Materiales",1,"global"]]},
  {id:"foto", t:"Sesión fotográfica", ico:"❍", disc:"Fotografía", fmt:"cotizacion",
   note:"Incluye edición de seleccionados y entrega digital en alta resolución. Anticipo 50%.",
   items:[["Pre-producción y dirección",1,"sesión"],["Jornada de fotografía",1,"jornada"],["Edición y retoque",1,"global"],["Entrega Fine Art (opcional)",1,"global"]]},
  {id:"taller", t:"Taller / Workshop", ico:"✲", disc:"Educación · Arte urbano", fmt:"propuesta",
   note:"Incluye materiales para participantes. Cupo según espacio. Anticipo para reservar la fecha.",
   items:[["Diseño del taller",1,"global"],["Sesión / clase",1,"sesión"],["Materiales por participante",1,"persona"]]},
  {id:"direccion", t:"Dirección creativa", ico:"✦", disc:"Conceptual", fmt:"propuesta",
   note:"Honorarios por desarrollo conceptual y supervisión artística. No incluye ejecución de terceros.",
   items:[["Investigación y concepto",1,"global"],["Desarrollo de narrativa visual",1,"global"],["Supervisión artística",1,"jornada"]]},
  {id:"tattoo", t:"Sesión de tatuaje", ico:"❂", disc:"Tatuaje", fmt:"cotizacion",
   note:"Incluye diseño personalizado. El abono reserva la fecha y cubre el diseño.",
   items:[["Diseño personalizado",1,"diseño"],["Sesión de tatuaje",1,"sesión"]]},
  {id:"diseno", t:"Diseño / Branding", ico:"▦", disc:"Diseño", fmt:"cotizacion",
   note:"Incluye 2 rondas de ajustes y entrega de archivos editables. Anticipo 50%.",
   items:[["Investigación de marca",1,"global"],["Propuesta de identidad",1,"global"],["Entrega de archivos",1,"global"]]},
  {id:"musica", t:"Producción musical", ico:"♪", disc:"Música", fmt:"cotizacion",
   note:"Incluye mezcla. Masterización opcional. Entrega de stems a pedido.",
   items:[["Producción / arreglo",1,"tema"],["Grabación",1,"jornada"],["Mezcla",1,"tema"],["Masterización (opcional)",1,"tema"]]},
  {id:"obra", t:"Obra original · Fine Art", ico:"◆", disc:"Coleccionismo", fmt:"factura",
   note:"Obra única con certificado de autenticidad. Embalaje y envío según destino.",
   items:[["Obra original",1,"pieza"],["Certificado de autenticidad",1,"global"],["Embalaje y envío",1,"global"]]}
];
const tplKey = a => "anima_templates_"+(a.almaId||a.id);
function loadTpls(a){ try{ return JSON.parse(localStorage.getItem(tplKey(a)))||[]; }catch(e){ return []; } }
function saveTpls(a,t){ localStorage.setItem(tplKey(a), JSON.stringify(t)); }
function normItem(it){ return Array.isArray(it)?{desc:it[0]||"",qty:it[1]||1,unit:it[2]||"unidad",price:it[3]||0}:{desc:it.desc||"",qty:it.qty||1,unit:it.unit||"unidad",price:it.price||0}; }
function applyTemplate(tpl){
  quoteDraft=blankQuote();
  quoteDraft.docType=tpl.fmt||"cotizacion"; quoteDraft.title=tpl.t||docFmt(quoteDraft.docType).t;
  quoteDraft.discipline=tpl.disc||""; quoteDraft.notes=tpl.note||"";
  const its=(tpl.items||[]).map(normItem); quoteDraft.items=its.length?its:[{desc:"",qty:1,price:0,unit:"unidad"}];
}
function cotUseFormat(id){ quoteDraft=blankQuote(); quoteDraft.docType=id; quoteDraft.title=docFmt(id).t; state.cotMode="editor"; renderView(); }
function cotUseTemplate(id){ const a=me(); const tpl=TEMPLATES.find(t=>t.id===id)||loadTpls(a).find(t=>t.id===id); if(!tpl) return; applyTemplate(tpl); state.cotMode="editor"; renderView(); }
function cotBlank(){ quoteDraft=blankQuote(); state.cotMode="editor"; renderView(); }
function cotGallery(){ state.cotMode="galeria"; renderView(); }
function cotSaveTemplate(){
  readQuoteForm(); const a=me();
  const name=prompt("Nombre de la plantilla:", quoteDraft.title||"Mi plantilla"); if(!name) return;
  const list=loadTpls(a);
  list.unshift({ id:"t"+Date.now(), t:name, ico:"✶", disc:quoteDraft.discipline||"", fmt:quoteDraft.docType||"cotizacion",
    note:quoteDraft.notes||"", items:quoteDraft.items.map(it=>({desc:it.desc,qty:it.qty,unit:it.unit,price:it.price})), custom:true });
  saveTpls(a,list); alert("Plantilla guardada ✓ Aparecerá en «Mis plantillas».");
}
function cotDelTemplate(id){ const a=me(); if(!confirm("¿Eliminar esta plantilla?"))return; saveTpls(a,loadTpls(a).filter(t=>t.id!==id)); renderView(); }
let quoteDraft = blankQuote();
const quotesKey = a => "anima_quotes_"+(a.almaId||a.id);
function loadQuotes(a){ try{ return JSON.parse(localStorage.getItem(quotesKey(a)))||[]; }catch(e){ return []; } }
function saveQuotes(a,q){ localStorage.setItem(quotesKey(a), JSON.stringify(q)); }
function quoteTotals(){ const sub=quoteDraft.items.reduce((t,it)=>t+(+it.qty||0)*(+it.price||0),0); const tax=sub*(+quoteDraft.taxPct||0)/100; return {sub,tax,total:sub+tax}; }
function readQuoteForm(){
  const g=id=>{const e=document.getElementById(id);return e?e.value:"";};
  quoteDraft.title=g("q_title"); quoteDraft.client=g("q_client"); quoteDraft.date=g("q_date");
  quoteDraft.discipline=g("q_disc"); quoteDraft.currency=g("q_cur"); quoteDraft.taxPct=+g("q_tax")||0; quoteDraft.notes=g("q_notes");
  if(g("q_fmt")) quoteDraft.docType=g("q_fmt");
  quoteDraft.items=quoteDraft.items.map((it,i)=>({ desc:g("qi_desc_"+i), qty:+g("qi_qty_"+i)||0, price:+g("qi_price_"+i)||0, unit:g("qi_unit_"+i)||"unidad" }));
}
function vCotizador(a){ return state.cotMode==="editor" ? vCotEditor(a) : vCotGaleria(a); }

function vCotGaleria(a){
  const saved = a.live
    ? (state.cloudQuotes||[]).map(q=>({id:q.id,title:q.title,client:q.client_name,date:(q.created_at||"").slice(0,10)}))
    : loadQuotes(a);
  const mine = loadTpls(a);
  const fmtStrip = DOC_FORMATS.map(f=>`<button class="doc-fmt" data-cotfmt="${f.id}"><span class="df-ico">${f.ico}</span><b>${f.t}</b><small>${f.d}</small></button>`).join("");
  const tplCard = (t,custom)=>`<div class="tpl-card" data-cottpl="${t.id}">
      ${custom?`<button class="ia danger tpl-del" data-cottpldel="${t.id}" title="Eliminar">✕</button>`:``}
      <span class="tpl-ico">${t.ico||"✶"}</span>
      <b>${esc(t.t)}</b>
      <small class="muted">${esc(t.disc||docFmt(t.fmt).t)}</small>
      <span class="pill" style="margin-top:8px;width:max-content">${docFmt(t.fmt).ico} ${docFmt(t.fmt).t}</span>
      <span class="tpl-use">Usar plantilla →</span>
    </div>`;
  return `<div class="grid">
    <div class="card s12 cot-hero">
      <div><span class="pill gold">Centro documental</span>
        <h2 style="font-size:clamp(24px,4vw,34px);letter-spacing:-.05em;margin:12px 0 4px">¿Qué vas a crear hoy?</h2>
        <p class="muted" style="max-width:560px;margin:0">Elige un formato o parte de una plantilla pensada para tu oficio. Todo se exporta en PDF con la identidad de tu Alma.</p>
      </div>
      <button class="btn" data-cotblank>＋ Documento en blanco</button>
    </div>

    <div class="card s12">
      <div class="section-title"><h2 style="font-size:18px">Formatos</h2><div class="spacer"></div><span class="muted" style="font-size:12.5px">El documento que necesitas</span></div>
      <div class="doc-fmts">${fmtStrip}</div>
    </div>

    <div class="card s12">
      <div class="section-title"><h2 style="font-size:18px">Plantillas por oficio</h2><div class="spacer"></div><span class="muted" style="font-size:12.5px">ANIMA es para todo creador</span></div>
      <div class="tpl-grid">${TEMPLATES.map(t=>tplCard(t,false)).join("")}</div>
    </div>

    ${mine.length?`<div class="card s12">
      <div class="section-title"><h2 style="font-size:18px">Mis plantillas</h2><div class="spacer"></div><span class="pill gold">${mine.length}</span></div>
      <div class="tpl-grid">${mine.map(t=>tplCard(t,true)).join("")}</div>
    </div>`:``}

    <div class="card s12">
      <div class="section-title"><h2 style="font-size:18px">Documentos guardados</h2><div class="spacer"></div><span class="muted" style="font-size:12.5px">${saved.length}</span></div>
      ${saved.length?saved.map(q=>`<div class="row"><div class="grow"><b>${esc(q.title)}</b><br><small>${esc(q.client||"—")} · ${esc(q.date)}</small></div>
        <button class="btn ghost sm" data-qload="${q.id}">Abrir</button><button class="ia danger" data-qdelete="${q.id}">✕</button></div>`).join(""):`<p class="muted">Aún no guardas documentos. Crea el primero desde un formato o plantilla.</p>`}
    </div>
  </div>`;
}

function vCotEditor(a){
  const t=quoteTotals(), cur=quoteDraft.currency, fmt=docFmt(quoteDraft.docType);
  const itemsRows = quoteDraft.items.map((it,i)=>`<div class="qitem">
      <input id="qi_desc_${i}" placeholder="Concepto / obra / servicio" value="${esc(it.desc)}">
      <input id="qi_qty_${i}" type="number" min="0" step="any" value="${it.qty}" title="Cantidad">
      <input id="qi_unit_${i}" placeholder="unidad" value="${esc(it.unit)}" title="Unidad (m², hora, pieza…)">
      <input id="qi_price_${i}" type="number" min="0" step="any" value="${it.price}" title="Precio unitario">
      <div class="qsub">${fmtq((+it.qty||0)*(+it.price||0),cur)}</div>
      <button class="ia danger" data-qdel="${i}" title="Quitar">✕</button>
    </div>`).join("");
  return `<div class="grid">
    <div class="card s8">
      <div class="section-title">
        <button class="btn ghost sm" data-cotback>← Centro</button>
        <h2 style="font-size:20px">${fmt.ico} ${fmt.t}</h2><div class="spacer"></div>
        <button class="btn ghost sm" id="q_tpl" title="Guardar este documento como plantilla reutilizable">✶ Plantilla</button>
        <button class="btn secondary sm" id="q_save">Guardar</button>
        <button class="btn sm" id="q_export">⤓ PDF</button>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div class="field" style="flex:1;min-width:150px"><label>Formato</label><select id="q_fmt">${DOC_FORMATS.map(f=>`<option value="${f.id}" ${f.id===quoteDraft.docType?'selected':''}>${f.t}</option>`).join("")}</select></div>
        <div class="field" style="flex:2;min-width:180px"><label>Título</label><input id="q_title" value="${esc(quoteDraft.title)}"></div>
        <div class="field" style="flex:1;min-width:120px"><label>Fecha</label><input id="q_date" type="date" value="${esc(quoteDraft.date)}"></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div class="field" style="flex:2;min-width:180px"><label>Vínculo</label><input id="q_client" placeholder="Nombre del vínculo" value="${esc(quoteDraft.client)}"></div>
        <div class="field" style="flex:2;min-width:160px"><label>Disciplina / rama</label><input id="q_disc" placeholder="Mural, tattoo, branding, música…" value="${esc(quoteDraft.discipline)}"></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div class="field" style="flex:1;min-width:120px"><label>Moneda</label><select id="q_cur">${Object.keys(CURRENCIES).map(c=>`<option ${c===cur?'selected':''}>${c}</option>`).join("")}</select></div>
        <div class="field" style="flex:1;min-width:120px"><label>Impuesto %</label><input id="q_tax" type="number" min="0" step="any" value="${quoteDraft.taxPct}"></div>
      </div>

      <div class="section-title" style="margin-top:8px"><h2 style="font-size:16px">Ítems</h2><div class="spacer"></div><button class="btn sm" data-qadd>+ Ítem</button></div>
      <div class="qhead"><span>Concepto</span><span>Cant.</span><span>Unidad</span><span>Precio</span><span>Subtotal</span><span></span></div>
      ${itemsRows||`<p class="muted">Agrega tu primer ítem.</p>`}

      <div class="field" style="margin-top:14px"><label>Notas / condiciones</label><textarea id="q_notes" rows="2" placeholder="Validez, anticipo, plazos, formas de pago…">${esc(quoteDraft.notes)}</textarea></div>
    </div>

    <div class="card s4" style="align-self:start">
      <span class="pill gold">Resumen</span>
      <div class="row"><div class="grow muted">Subtotal</div><b>${fmtq(t.sub,cur)}</b></div>
      <div class="row"><div class="grow muted">Impuesto (${quoteDraft.taxPct||0}%)</div><b>${fmtq(t.tax,cur)}</b></div>
      <div class="row"><div class="grow"><b>Total</b></div><span class="kpi" style="font-size:24px">${fmtq(t.total,cur)}</span></div>
      <p class="muted" style="font-size:12px;margin-top:8px">${esc(fmt.d)} Exporta un PDF limpio con tu identidad, listo para enviar.</p>
    </div>
  </div>`;
}
function qAddItem(){ readQuoteForm(); quoteDraft.items.push({desc:"",qty:1,price:0,unit:"unidad"}); renderView(); }
function qDelItem(i){ readQuoteForm(); quoteDraft.items.splice(i,1); if(!quoteDraft.items.length) quoteDraft.items.push({desc:"",qty:1,price:0,unit:"unidad"}); renderView(); }
function qNew(){ quoteDraft=blankQuote(); renderView(); }
async function qSave(){
  readQuoteForm(); const a=me();
  if(a.live) return qSaveCloud(a);
  const list=loadQuotes(a);
  if(!quoteDraft.id){ quoteDraft.id="q"+Date.now(); list.unshift(JSON.parse(JSON.stringify(quoteDraft))); }
  else { const i=list.findIndex(x=>x.id===quoteDraft.id); if(i>=0) list[i]=JSON.parse(JSON.stringify(quoteDraft)); else list.unshift(JSON.parse(JSON.stringify(quoteDraft))); }
  saveQuotes(a,list); renderView(); alert("Cotización guardada.");
}
async function qSaveCloud(a){
  const t=quoteTotals();
  try{
    let clientId=quoteDraft.client_id||null;
    if(quoteDraft.client){
      let c=(a.clients||[]).find(x=>(x.name||"").toLowerCase()===quoteDraft.client.toLowerCase());
      if(!c){ const row=await Cloud.insertRow("clients",{alma_id:a.almaId,name:quoteDraft.client}); c={_id:row.id,name:row.name}; (a.clients||(a.clients=[])).unshift(c); }
      clientId=c._id;
    }
    let projectId=quoteDraft.project_id||null;
    if(!projectId && quoteDraft.title){
      const prow=await Cloud.insertRow("projects",{alma_id:a.almaId,title:quoteDraft.title,client:quoteDraft.client||null,status:"Planificado",pct:0,client_id:clientId});
      projectId=prow.id; a.projects.unshift({_id:prow.id,t:quoteDraft.title,st:"Planificado",pct:0,client:quoteDraft.client||""});
    }
    const payload={ alma_id:a.almaId, client_id:clientId, project_id:projectId, title:quoteDraft.title, client_name:quoteDraft.client,
      discipline:quoteDraft.discipline, currency:quoteDraft.currency, tax_pct:quoteDraft.taxPct, notes:quoteDraft.notes,
      items:quoteDraft.items, subtotal:Math.round(t.sub), total:Math.round(t.total) };
    if(quoteDraft.id){ await Cloud.updateRow("quotes",quoteDraft.id,payload); }
    else { const qrow=await Cloud.insertRow("quotes",payload); quoteDraft.id=qrow.id; }
    quoteDraft.client_id=clientId; quoteDraft.project_id=projectId;
    state.cloudQuotes=await Cloud.quotes(a.almaId);
    renderAll(); alert("Cotización guardada en la nube ✓ Vínculo y proyecto enlazados.");
  }catch(e){ alert("No se pudo guardar la cotización: "+(e.message||e)); }
}
function qLoad(id){
  const a=me(); state.cotMode="editor";
  if(a.live){ const q=(state.cloudQuotes||[]).find(x=>x.id===id);
    if(q){ quoteDraft={ id:q.id, client_id:q.client_id, project_id:q.project_id, docType:q.doc_type||"cotizacion", title:q.title||"Cotización", client:q.client_name||"",
      date:(q.created_at||"").slice(0,10), discipline:q.discipline||"", currency:q.currency||"CLP", taxPct:+q.tax_pct||0, notes:q.notes||"",
      items:(q.items&&q.items.length)?q.items:[{desc:"",qty:1,price:0,unit:"unidad"}] }; renderView(); }
    return;
  }
  const ql=loadQuotes(a).find(x=>x.id===id); if(ql){ quoteDraft=JSON.parse(JSON.stringify(ql)); if(!quoteDraft.docType) quoteDraft.docType="cotizacion"; renderView(); }
}
async function qDeleteSaved(id){
  if(!confirm("¿Eliminar esta cotización?"))return; const a=me();
  if(a.live){ try{ await Cloud.deleteRow("quotes",id); state.cloudQuotes=await Cloud.quotes(a.almaId); renderView(); }catch(e){ alert("No se pudo eliminar: "+(e.message||e)); } return; }
  saveQuotes(a,loadQuotes(a).filter(x=>x.id!==id)); renderView();
}
function qExport(){
  readQuoteForm(); const a=me(), t=quoteTotals(), cur=quoteDraft.currency;
  document.getElementById("printArea").innerHTML=`
    <div class="p-head"><div class="brand"><span class="mark"><svg viewBox="0 0 100 100" fill="none"><path d="M50 7 89 91H72L61 66H39L28 91H11L50 7Z" stroke="#111" stroke-width="6.5" stroke-linejoin="round"/><circle cx="50" cy="49" r="5.5" fill="#111"/></svg></span>ANIMA · ${esc(a.name)}</div><small>${esc(docFmt(quoteDraft.docType).t)} · ${esc(quoteDraft.date)}</small></div>
    <h1 class="p-name">${esc(quoteDraft.title)}</h1>
    <div class="p-sub">${esc(quoteDraft.discipline||a.role||"")} · Vínculo: ${esc(quoteDraft.client||"—")}</div>
    <table class="p-table"><thead><tr><th>Concepto</th><th>Cant.</th><th>Unidad</th><th>P. unitario</th><th>Subtotal</th></tr></thead><tbody>
      ${quoteDraft.items.map(it=>`<tr><td>${esc(it.desc)}</td><td>${it.qty}</td><td>${esc(it.unit)}</td><td>${fmtq(it.price,cur)}</td><td>${fmtq((+it.qty||0)*(+it.price||0),cur)}</td></tr>`).join("")}
    </tbody></table>
    <table class="p-tot"><tr><td>Subtotal</td><td>${fmtq(t.sub,cur)}</td></tr><tr><td>Impuesto (${quoteDraft.taxPct||0}%)</td><td>${fmtq(t.tax,cur)}</td></tr><tr class="grand"><td>Total</td><td>${fmtq(t.total,cur)}</td></tr></table>
    ${quoteDraft.notes?`<h2>Notas</h2><p>${esc(quoteDraft.notes)}</p>`:``}
    <div class="p-foot">${esc(a.name)} · ${esc(a.city||"")} ${esc(a.country||"")} · ANIMA TSC — The Soul of Creativity</div>`;
  window.print();
}

/* --- Comunidad --- */
function roster(){ return (state.cloudAlmas && state.cloudAlmas.length) ? state.cloudAlmas : state.almas; }
const liveMode = () => !!(state.cloudAlmas && state.cloudAlmas.length);
function authorOf(id){ return (state.cloudAlmas||[]).find(x=>x.id===id) || {name:"Alma",color:"#888"}; }
/* ===========================================================
   COMUNIDAD — el Árbol de Almas como referencia + Ecos + países.
   "Esto forma parte de la ventana de Comunidad." (Alpha 2026)
   =========================================================== */
const ECO_ICON={ despertar:"✦", huella:"▦", nivel:"⤴", eco:"◎", senal:"➶", consejo:"⚖" };
function vComunidad(a){
  const list=roster(); const clan=SEED_CLANS.find(c=>c.name===a.clan);
  const members=a.clan?list.filter(m=>m.clan===a.clan):[];
  const feed=state.cloudPosts||[];
  const sz=getCfg(me()).mapSize||"md";

  // Contador X / 100 (vivo) + países desde las Almas presentes.
  const n = state.cloudSoulsCount!=null ? state.cloudSoulsCount : list.length;
  const counts={}; list.forEach(m=>{ const c=(m.country&&m.country.trim())?countryLabel(m.country):"✦ En tránsito"; counts[c]=(counts[c]||0)+1; });
  const countriesArr=Object.entries(counts).sort((x,y)=>y[1]-x[1]);

  // Ecos (carga diferida).
  if(state.cloudEcos==null) loadCommunityExtras();
  const ecos=state.cloudEcos||[];
  const ecosHTML = (state.cloudEcos==null)
    ? `<p class="muted" style="font-size:13px">Escuchando los Ecos…</p>`
    : (ecos.length
        ? ecos.slice(0,10).map(e=>`<div class="eco-row"><span class="eco-ico">${ECO_ICON[e.kind]||"·"}</span>
            <div><div style="font-size:13.5px">${esc(e.text||("✦ "+(e.alma_name||"Una Alma")))}</div>
            <small class="muted">${esc(timeAgo(e.created_at))}</small></div></div>`).join("")
        : `<p class="muted" style="font-size:13px">Aún no hay Ecos. Cuando una Alma despierte o deje una huella, aparecerá aquí.</p>`);

  // Cifras vivas del Mundo.
  const todayKey=new Date().toISOString().slice(0,10);
  const ecosToday=ecos.filter(e=>(e.created_at||"").slice(0,10)===todayKey).length;
  const clanesCount=new Set(list.map(x=>x.clan).filter(Boolean)).size;
  const santuariosCount=new Set(list.map(x=>x.santuario).filter(Boolean)).size;
  const paisesCount=countriesArr.filter(([c])=>c!=="✦ En tránsito").length;
  const weekAgo=Date.now()-7*864e5;
  const newWeek=list.filter(x=>x.created_at && new Date(x.created_at).getTime()>=weekAgo).length;
  const nivelesCount=new Set(list.map(x=>x.level).filter(Boolean)).size;

  // EL ÁRBOL VIVO — corazón del Mundo (pixel art reactivo).
  const tree = `<div class="card s8 wt-card">
      <div class="wt-head">
        <span class="wt-title">🌳 Árbol de Almas</span>
        <span class="pill ${liveMode()?'gold':''}">${n} / 100</span>
        <div class="wt-sizes">${["sm","md","lg"].map(s=>`<button class="wt-msz ${sz===s?'on':''}" data-mapsize="${s}">${s.toUpperCase()}</button>`).join("")}</div>
      </div>
      <div class="wt-stage ${sz}">
        <canvas id="worldTreeCanvas" class="wt-canvas"></canvas>
        <div class="wt-state" id="wtState"><span class="glyph">○</span><span class="lbl">Latente</span><span class="sub">El Mundo descansa.</span></div>
        <div class="wt-essence"><b id="wtEssN">0</b><small id="wtEssTier">Latente</small></div>
        <div class="wt-phenom hidden" id="wtPhenom"><span class="pglyph">✦</span><span><span class="pn" id="wtPhenomN"></span> · <span class="pd" id="wtPhenomD"></span></span></div>
      </div>
      <div class="muted" style="font-size:12px;margin-top:10px" id="wtLatido">${n} Almas habitan ANIMA · ${Math.max(0,100-n)} lugares libres. Cada acción deja una Huella en el Árbol.</div>
      <div class="wt-tiles">
        <div class="wt-tile"><div class="n" id="wtAlmas">${n}</div><span class="k"><span class="ic">☺</span>Almas</span></div>
        <div class="wt-tile"><div class="n" id="wtEcos">${ecosToday}</div><span class="k"><span class="ic">◎</span>Ecos hoy</span></div>
        <div class="wt-tile"><div class="n">${clanesCount}</div><span class="k"><span class="ic">❂</span>Clanes</span></div>
        <div class="wt-tile"><div class="n">${paisesCount}</div><span class="k"><span class="ic">✦</span>Países</span></div>
        <div class="wt-tile"><div class="n" id="wtEnergy">0</div><span class="k"><span class="ic">🌱</span>Esencia</span></div>
      </div>
    </div>`;
  const aside = `<div class="card s4 arbol-aside">
      <div class="section-title"><h2 style="font-size:15px">Ecos de ANIMA</h2></div>
      <div class="ecos-mini">${ecosHTML}</div>
    </div>`;

  // RESUMEN DEL MUNDO — panorama de la semana.
  const week = `<div class="card s8"><div class="section-title"><h2>Resumen del Mundo</h2></div>
      <div class="wt-week">
        <div><div class="num">${newWeek}</div><span class="lbl">Almas nuevas esta semana</span></div>
        <div><div class="num">${clanesCount}</div><span class="lbl">Clanes activos</span></div>
        <div><div class="num">${santuariosCount}</div><span class="lbl">Santuarios activos</span></div>
        <div><div class="num">${nivelesCount}</div><span class="lbl">Niveles habitando el Mundo</span></div>
      </div></div>`;
  // ALMAS CONECTADAS — constelación viva.
  const connect = `<div class="card s4"><div class="section-title"><h2 style="font-size:15px">Almas conectadas</h2></div>${constelMini(list)}</div>`;

  // DISTRIBUCIÓN POR PAÍS — barras.
  const maxC=countriesArr.length?countriesArr[0][1]:1;
  const paisCard = `<div class="card s6"><div class="section-title"><h2 style="font-size:15px">Distribución por país</h2></div>
      <div class="wt-bars">${countriesArr.length?countriesArr.slice(0,7).map(([c,k])=>`<div class="wt-bar"><span>${esc(c)}</span><span class="track"><span class="fill" style="width:${Math.max(6,Math.round(k/maxC*100))}%"></span></span><b>${k}</b></div>`).join(""):`<p class="muted" style="font-size:13px">Todavía sin geografía.</p>`}</div></div>`;

  // RITUAL ACTIVO — la vela encendida del Mundo. Una vez al día por Alma:
  // subir una Huella (post) sobre lo que se creó esta semana.
  const ritDone=a.live && ritualDoneToday(a);
  const ritual = `<div class="card s6 wt-ritual"><div class="section-title"><h2 style="font-size:15px">Ritual activo</h2><div class="spacer"></div><span class="pill gold">${ritDone?"🜂 Completado hoy":"Vela encendida"}</span></div>
      <div class="rt-name">Ritual del Eco</div>
      <p>¿Qué creaste esta semana? Sube tu Huella al Mundo y deja que el Árbol resuene contigo. <b>Una vez al día.</b></p>
      ${!a.live
        ? `<p class="muted" style="font-size:13px">Entra a tu Alma para participar en el Ritual.</p>`
        : (ritDone
            ? `<button class="btn secondary" disabled style="opacity:.7;cursor:default">✓ Ya encendiste la vela hoy</button><div class="muted" style="font-size:12px;margin-top:8px">Vuelve mañana para dejar una nueva Huella.</div>`
            : `<button class="btn" data-ritual="eco">✦ Participar en el Ritual</button>`)}</div>`;

  const create = a.live ? `<div class="card s12"><div class="section-title"><h2>Comparte con la comunidad</h2></div>
      <div class="field"><input id="postTitle" placeholder="Título (opcional)"></div>
      <div class="field"><textarea id="postBody" rows="2" placeholder="¿Qué estás creando? Comparte un proyecto, idea o pregunta…"></textarea></div>
      <button class="btn" id="postSend">Dejar mi Huella</button></div>`
    : `<div class="card s12"><p class="muted">Entra a tu Alma para dejar tu Huella en la comunidad.</p></div>`;
  const wall = `<div class="card s12"><div class="section-title"><h2>Muro de la comunidad</h2><div class="spacer"></div><span class="pill ${liveMode()?'gold':''}">${feed.length} Huellas</span></div>
      ${feed.length?feed.map(p=>{ const au=authorOf(p.author_alma_id);
        const visit=(au.id && au.id!==a.almaId)?`data-pub="${au.id}"`:"";
        const isRit=p.kind==="ritual";
        return `<div class="post" data-openpost="${p.id}"><span class="avatar sm pub-link" ${visit} title="${visit?'Visitar Alma':''}" style="background:linear-gradient(145deg,${au.color},${shade(au.color,-22)})">${initials(au.name)}</span>
          <div class="grow"><b>${esc(p.title||au.name)}</b>${isRit?` <span class="pill gold" style="font-size:9px">🜂 Ritual</span>`:""}<br><small class="muted">${esc(au.name)} · ${timeAgo(p.created_at)}</small>
          <p style="margin:6px 0 0">${esc((p.body||"").slice(0,160))}${(p.body||"").length>160?"…":""}</p></div></div>`;
      }).join(""):`<p class="muted">Aún no hay Huellas.${a.live?" ¡Deja la primera!":""}</p>`}</div>`;
  const clanCard = a.clan ? `<div class="card s12"><div class="section-title"><h2>${clan?clan.emoji:"🖤"} ${esc(a.clan)}</h2><div class="spacer"></div><span class="pill">Clan · Nivel 2</span></div>
      <p class="muted">${clan?clan.desc:"Comunidad privada por invitación (2 a 8 Almas)."}</p>
      <div class="alma-grid" style="margin-top:14px">${members.map(almaMini).join("")}</div></div>`
    : "";
  // RESUMEN DEL MUNDO (clanes/santuarios) — solo Almas con acceso o el Creador.
  const worldCard = (a.world_access || (isCreator && !state.viewAs)) ? worldSummaryCard(list) : "";
  return `<div class="grid">${tree}${aside}${week}${connect}${paisCard}${ritual}${create}${wall}${clanCard}${worldCard}</div>`;
}
/* Glifos del Estado del Mundo (símbolos oficiales del Árbol). */
const WT_GLYPH={ LATENTE:"○", SERENO:"🌱", RESONANDO:"〰", FLORECIENDO:"✧", LUMINOSO:"◎", DESPERTAR:"∞" };
const PHENOM_DESC={
  "Lluvia de Ecos":"100 Chispas en 1 hora.",
  "Nueva Rama":"10 colaboraciones en 24 horas.",
  "Fruto del Árbol":"50 Memorias guardadas en el día.",
  "Nueva Estrella":"Primer Alma de un nuevo país.",
  "Aurora":"Alguien alcanzó el último nivel.",
  "Latido Mayor":"1.000 Almas conectadas.",
  "Origen Renacido":"El Árbol alcanzó su máxima evolución."
};
/* Constelación mini — Almas conectadas alrededor de un centro. */
function constelMini(list){
  const top=(list||[]).slice(0,7);
  if(top.length<2) return `<div class="wt-constel"><div style="position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-size:13px">Aún no hay constelaciones.</div></div>`;
  const cx=50, cy=48; let links="", stars="";
  const pts=top.map((m,i)=>{ if(i===0) return {x:cx,y:cy,m}; const ang=((i-1)/(top.length-1))*Math.PI*2; return {x:cx+Math.cos(ang)*32, y:cy+Math.sin(ang)*34, m}; });
  pts.forEach((p,i)=>{ if(i===0) return; const dx=p.x-cx, dy=p.y-cy; const len=Math.sqrt(dx*dx+dy*dy); const ang=Math.atan2(dy,dx)*180/Math.PI; links+=`<span class="wt-link" style="left:${cx}%;top:${cy}%;width:${len}%;transform:rotate(${ang}deg)"></span>`; });
  pts.forEach(p=>{ const c=p.m.color||"#888"; const act=(liveMode()&&!p.m.live&&p.m.id)?`data-pub="${p.m.id}"`:""; stars+=`<span class="wt-star ${act?'pub-link':''}" ${act} title="${esc(p.m.name)}" style="left:${p.x}%;top:${p.y}%;background:linear-gradient(145deg,${c},${shade(c,-22)})">${initials(p.m.name)}</span>`; });
  return `<div class="wt-constel">${links}${stars}</div>`;
}
/* Monta el Árbol Vivo y enlaza el Estado del Mundo con el DOM (en vivo). */
function updateWtDom(s){
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  set("wtEnergy", Math.round(s.energy).toLocaleString("es-CL"));
  set("wtEssN", Math.round(s.energy).toLocaleString("es-CL"));
  set("wtEssTier", s.essenceTier);
  const st=document.getElementById("wtState");
  if(st){ st.querySelector(".lbl").textContent=s.world_label; st.querySelector(".sub").textContent=s.world_sub; st.querySelector(".glyph").textContent=WT_GLYPH[s.world_state]||"○"; }
  const ph=document.getElementById("wtPhenom");
  if(ph){ if(s.phenomenon){ ph.classList.remove("hidden"); set("wtPhenomN",s.phenomenon); set("wtPhenomD",PHENOM_DESC[s.phenomenon]||""); } else ph.classList.add("hidden"); }
  const lat=document.getElementById("wtLatido");
  if(lat && s.events && s.events[0]) lat.textContent="Último latido — "+s.events[0].description;
}
function initWorldTreeView(){
  if(!window.WorldTree) return;
  const canvas=document.getElementById("worldTreeCanvas"); if(!canvas) return;
  const n = state.cloudSoulsCount!=null ? state.cloudSoulsCount : roster().length;
  try{ WorldTree.hydrate({almas:n}); }catch(e){}
  WorldTree.mount(canvas);
  if(!state._wtBound){ state._wtBound=true; WorldTree.onChange(updateWtDom); }
  updateWtDom(WorldTree.snapshot());
}
/* ===========================================================
   RITUAL DEL ECO — una vez al día por Alma.
   El Ritual ya no es un botón vacío: es subir una Huella (post)
   sobre lo que creaste esta semana. Se publica en el Muro,
   enciende el Árbol y solo puede hacerse una vez por día.
   =========================================================== */
function ritualKey(a){ return "anima_ritual_"+(a.almaId||a.id||"guest")+"_"+new Date().toISOString().slice(0,10); }
function ritualDoneToday(a){ try{ return localStorage.getItem(ritualKey(a))==="1"; }catch(e){ return false; } }
function doRitual(kind){
  const a=me(); if(!a.live){ alert("Entra a tu Alma para participar en el Ritual."); return; }
  if(ritualDoneToday(a)){ toast("🜂 Ya encendiste la vela hoy. Vuelve mañana."); return; }
  document.getElementById("ritualBody").value="";
  document.getElementById("ritualTitle").value="";
  document.getElementById("ritualMsg").textContent="";
  document.getElementById("ritualModal").classList.add("open");
  setTimeout(()=>{ const t=document.getElementById("ritualBody"); if(t) t.focus(); },120);
}
function closeRitual(){ document.getElementById("ritualModal").classList.remove("open"); }
async function sendRitual(){
  const a=me(); if(!a.live){ alert("Entra a tu Alma para participar en el Ritual."); return; }
  if(ritualDoneToday(a)){ closeRitual(); toast("🜂 Ya encendiste la vela hoy."); renderView(); return; }
  const body=document.getElementById("ritualBody").value.trim();
  const title=(document.getElementById("ritualTitle").value.trim())||"Mi Huella de la semana";
  const msg=document.getElementById("ritualMsg");
  if(!body){ msg.textContent="Cuenta qué creaste esta semana para encender la vela."; return; }
  msg.textContent="Encendiendo la vela…";
  try{
    await Cloud.insertRow("posts",{ author_alma_id:a.almaId, kind:"ritual", title, body });
    try{ localStorage.setItem(ritualKey(a),"1"); }catch(e){}
    if(window.WorldTree){ WorldTree.onRitual({ almaName:a.name, country:a.country }); WorldTree.onHuella({ almaName:a.name, branch:branchOf(a), country:a.country, targetId:a.almaId }); }
    if(window.AnimaState){ AnimaState.addEsencia(20,"Ritual del Eco"); setTimeout(maybeLevelGuide,400); }
    const nick=(a.name||"Alma").split(" ")[0];
    Cloud.emitEcho("ritual","🜂 "+nick+" completó el Ritual del Eco").catch(()=>{});
    try{ Cloud.logTimeline("huella","Ritual del Eco",title); }catch(e){}
    await loadPosts();
    closeRitual(); renderView();
    toast("🜂 El Árbol resonó con tu Huella.");
  }catch(e){ msg.textContent="No se pudo completar el Ritual: "+(e.message||e); }
}
/* Aviso breve y suave (no satura la pantalla). */
function toast(msg){
  let t=document.getElementById("wtToast");
  if(!t){ t=document.createElement("div"); t.id="wtToast"; t.style.cssText="position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:9999;background:rgba(18,16,24,.92);color:#f5ecd2;padding:11px 18px;border-radius:14px;font-size:14px;box-shadow:0 8px 30px rgba(0,0,0,.3);opacity:0;transition:opacity .3s,transform .3s"; document.body.appendChild(t); }
  t.textContent=msg; requestAnimationFrame(()=>{ t.style.opacity="1"; t.style.transform="translateX(-50%) translateY(-4px)"; });
  clearTimeout(t._h); t._h=setTimeout(()=>{ t.style.opacity="0"; t.style.transform="translateX(-50%)"; },2600);
}
/* Resumen general del Mundo (clanes, santuarios, panorama). Acceso restringido. */
function worldSummaryCard(list){
  const clanes=[...new Set(list.map(x=>x.clan).filter(Boolean))];
  const santuarios=[...new Set(list.map(x=>x.santuario).filter(Boolean))];
  const dist=LEVELS.map(l=>({l,n:list.filter(x=>x.level===l.key).length})).filter(d=>d.n>0);
  const clanRows=clanes.length?clanes.map(c=>{ const mem=list.filter(x=>x.clan===c); const s=mem.find(x=>x.santuario)?mem.find(x=>x.santuario).santuario:null;
      return `<div class="country-row"><span>❂ ${esc(c)}${s?` <small class="muted">· 🜁 ${esc(s)}</small>`:""}</span><b>${mem.length}</b></div>`;}).join("")
    :`<p class="muted" style="font-size:13px">Aún no hay Clanes.</p>`;
  const santRows=santuarios.length?santuarios.map(s=>{ const mem=list.filter(x=>x.santuario===s); const cl=[...new Set(mem.map(x=>x.clan).filter(Boolean))];
      return `<div class="country-row"><span>🜁 ${esc(s)} <small class="muted">· ${cl.length} clan(es)</small></span><b>${mem.length}</b></div>`;}).join("")
    :`<p class="muted" style="font-size:13px">Aún no hay Santuarios.</p>`;
  return `<div class="card s12" style="border:1px solid rgba(208,170,99,.4)">
    <div class="section-title"><h2>🌍 Resumen del Mundo</h2><div class="spacer"></div><span class="pill gold">Acceso restringido</span></div>
    <div class="grid" style="gap:14px;margin-top:4px">
      <div class="s3"><div class="stat"><span class="num">${list.length}</span><span class="lbl">Almas</span></div></div>
      <div class="s3"><div class="stat"><span class="num">${clanes.length}</span><span class="lbl">Clanes</span></div></div>
      <div class="s3"><div class="stat"><span class="num">${santuarios.length}</span><span class="lbl">Santuarios</span></div></div>
      <div class="s3"><div class="stat"><span class="num">${dist.length}</span><span class="lbl">Niveles activos</span></div></div>
    </div>
    <div class="grid" style="gap:14px;margin-top:14px">
      <div class="s6"><div class="section-title"><h2 style="font-size:15px">Clanes</h2></div><div class="country-rows">${clanRows}</div></div>
      <div class="s6"><div class="section-title"><h2 style="font-size:15px">Santuarios</h2></div><div class="country-rows">${santRows}</div></div>
    </div>
    <div class="section-title" style="margin-top:14px"><h2 style="font-size:15px">Distribución por nivel</h2></div>
    <div class="country-rows">${dist.map(d=>`<div class="country-row"><span>${d.l.emoji} ${esc(d.l.label)} · ${esc(d.l.name)}</span><b>${d.n}</b></div>`).join("")}</div>
  </div>`;
}
async function loadPosts(){ if(!Cloud.enabled) return; try{ state.cloudPosts=await Cloud.posts(); if(state.view==="comunidad") renderView(); }catch(e){} }
async function loadCommunityExtras(){
  if(!Cloud.enabled){ state.cloudEcos=[]; return; }
  try{ const r=await Promise.all([Cloud.echoes(12), Cloud.soulsCount()]); state.cloudEcos=r[0]; state.cloudSoulsCount=r[1]; ensureEcoRealtime(); if(state.view==="comunidad") renderView(); }
  catch(e){ state.cloudEcos=[]; }
}
/* Ecos en vivo: un solo canal para toda la sesión. */
function ensureEcoRealtime(){
  if(window.__ecoSub) return;
  window.__ecoSub = Cloud.subscribeEchoes(function(eco){
    if(!eco) return;
    const cur = state.cloudEcos || [];
    if(cur.some(e=>e.id===eco.id)) return;
    state.cloudEcos = [eco, ...cur].slice(0,30);
    if(eco.kind==="despertar" && state.cloudSoulsCount!=null) state.cloudSoulsCount++;
    if(state.view==="comunidad") renderView();
  });
}
async function sendPost(){
  const a=me(); if(!a.live){ alert("Entra a tu Alma para publicar."); return; }
  const title=document.getElementById("postTitle").value.trim(), body=document.getElementById("postBody").value.trim();
  if(!title && !body) return;
  try{ await Cloud.insertRow("posts",{author_alma_id:a.almaId,kind:"post",title,body});
    if(window.AnimaState){ AnimaState.addEsencia(15,"Publicar en comunidad"); setTimeout(maybeLevelGuide,400); }
    if(window.WorldTree) WorldTree.onHuella({ almaName:a.name, branch:branchOf(a), country:a.country, targetId:a.almaId });
    await loadPosts(); }
  catch(e){ alert("No se pudo publicar: "+(e.message||e)); }
}
/* La Rama creativa del Alma (camino) a partir de su disciplina. */
function branchOf(a){
  const d=((a&&(a.discipline||a.role))||"").toLowerCase();
  if(/mural/.test(d)) return "Muralismo";
  if(/foto/.test(d)) return "Fotografía";
  if(/ilustr|dibuj/.test(d)) return "Ilustración";
  if(/m[uú]sic|sonid/.test(d)) return "Música";
  if(/moda|dise[nñ]o|streetwear|textil/.test(d)) return "Moda";
  if(/escrit|poes|letra|guion/.test(d)) return "Escritura";
  if(/3d|render|model/.test(d)) return "3D";
  return (window.WorldTree && WorldTree.branches[Math.floor(Math.random()*WorldTree.branches.length)]) || "Muralismo";
}
function openPost(id){
  const p=(state.cloudPosts||[]).find(x=>x.id===id); if(!p) return; const au=authorOf(p.author_alma_id);
  document.getElementById("postModal").classList.add("open");
  const visit=(au.id && au.id!==me().almaId)?`data-pub="${au.id}"`:"";
  document.getElementById("postModalBody").innerHTML=`
    <div style="display:flex;gap:10px;align-items:center">
      <span class="avatar sm ${visit?'pub-link':''}" ${visit} title="${visit?'Visitar Alma':''}" style="background:linear-gradient(145deg,${au.color},${shade(au.color,-22)})">${initials(au.name)}</span>
      <div><b ${visit?'class="pub-link" '+visit:""}>${esc(au.name)}</b><br><small class="muted">${timeAgo(p.created_at)}</small></div></div>
    ${p.title?`<h2 style="margin:12px 0 4px;letter-spacing:-.03em">${esc(p.title)}</h2>`:""}
    <p style="white-space:pre-wrap">${esc(p.body||"")}</p>
    <div class="section-title" style="margin-top:14px"><h3 style="font-size:14px;margin:0">Ecos</h3></div>
    <div id="postComments" class="muted">Cargando…</div>
    <div class="lum-input" style="margin-top:10px"><input id="commentInput" placeholder="Escribe un Eco…"><button class="btn" id="commentSend" data-post="${id}">↑</button></div>`;
  loadComments(id);
}
async function loadComments(postId){
  try{ const cs=await Cloud.comments(postId); const box=document.getElementById("postComments"); if(!box) return;
    box.innerHTML=cs.length?cs.map(c=>{ const au=authorOf(c.author_alma_id);
      return `<div class="row"><span class="avatar sm" style="background:linear-gradient(145deg,${au.color},${shade(au.color,-22)})">${initials(au.name)}</span><div class="grow"><b>${esc(au.name)}</b> <small class="muted">${timeAgo(c.created_at)}</small><br>${esc(c.body)}</div></div>`;
    }).join(""):`<p class="muted">Sé la primera Alma en dejar un Eco.</p>`;
  }catch(e){}
}
async function sendComment(postId){
  const a=me(); if(!a.live){ alert("Entra a tu Alma para dejar un Eco."); return; }
  const el=document.getElementById("commentInput"); const body=el.value.trim(); if(!body) return; el.value="";
  try{ await Cloud.insertRow("comments",{post_id:postId,author_alma_id:a.almaId,body});
    if(window.AnimaState){ AnimaState.addEsencia(5,"Dejar un Eco en comunidad"); setTimeout(maybeLevelGuide,400); }
    if(window.WorldTree) WorldTree.onEco({ almaName:a.name, country:a.country });
    // Alpha 2026: ayudar/responder a otra Alma descubre la insignia Guardián y emite una señal.
    const post=(state.cloudPosts||[]).find(x=>x.id===postId);
    if(post && post.author_alma_id!==a.almaId){
      try{
        const nick=(a.name||"Alma").split(" ")[0];
        Cloud.awardBadge("guardian").then(g=>{ if(g) state.cloudBadges=null; });
        Cloud.log("comentario", { post:postId });
        Cloud.emitEcho("senal", "✦ "+nick+" envió una señal").catch(()=>{});
      }catch(e){}
    }
    loadComments(postId); }catch(e){ alert("No se pudo comentar: "+(e.message||e)); }
}
function closePost(){ document.getElementById("postModal").classList.remove("open"); }
function almaMini(m){
  const lv=levelByKey(m.level); const act=(liveMode()&&!m.live)?`data-pub="${m.id}"`:`data-alma="${m.id}"`;
  return `<div class="card alma-card" ${act}>${avatarHTML(m,"lg")}
    <b style="display:block;letter-spacing:-.02em">${esc(m.name)}</b><small class="muted">${esc(m.role||"")}</small><br>
    <span class="level-badge" style="margin-top:8px;border-color:${lv.color}55;color:${lv.color};font-size:11px">${lv.emoji} ${m.level}</span>
    <div class="muted" style="font-size:11px;margin-top:6px">${esc(m.country||"")}</div></div>`;
}

/* ===========================================================
   CRONOLOGÍA DEL ALMA (Alpha 2026) — "Porque ANIMA recordará."
   =========================================================== */
const TL_ICON = { despertar:"✦", obra:"▦", huella:"▦", nivel:"⤴", insignia:"✷", eco:"◎" };
function vCronologia(a){
  if(!a.live){ return `<div class="grid"><div class="card s12"><p class="muted">Entra a tu Alma en la nube para ver tu Cronología.</p></div></div>`; }
  const tl = state.cloudTimeline;
  if(tl==null){ loadTimeline(); return `<div class="grid"><div class="card s12"><p class="muted">Cargando tu historia…</p></div></div>`; }
  const body = tl.length
    ? `<div class="tl-soul">${tl.map(e=>{
        const d=new Date(e.created_at); const day=isNaN(d)?"":d.toLocaleDateString("es-CL",{day:"numeric",month:"long"});
        return `<div class="tl-node"><span class="tl-glyph">${TL_ICON[e.event_type]||"·"}</span>
          <div class="tl-body"><b>${esc(e.title)}</b>${e.description?`<p class="muted" style="margin:2px 0 0;font-size:13px">${esc(e.description)}</p>`:""}
          <small class="muted" style="display:block;margin-top:3px">${esc(day)}</small></div></div>`;
      }).join("")}</div>`
    : `<p class="muted">Tu historia empieza ahora. Cada hito quedará escrito aquí.</p>`;
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>La memoria de tu Alma</h2><div class="spacer"></div><span class="pill">${tl.length} recuerdo${tl.length===1?"":"s"}</span></div>
    ${body}</div></div>`;
}
async function loadTimeline(){ if(!Cloud.enabled) return; try{ state.cloudTimeline=await Cloud.timeline(); if(state.view==="cronologia") renderView(); }catch(e){ state.cloudTimeline=[]; } }

/* ===========================================================
   INSIGNIAS SECRETAS (Alpha 2026) — "No se anuncian. Se descubren."
   =========================================================== */
function vInsignias(a){
  if(!a.live){ return `<div class="grid"><div class="card s12"><p class="muted">Entra a tu Alma en la nube para descubrir tus Insignias.</p></div></div>`; }
  if(state.cloudBadges==null){ loadBadges(); return `<div class="grid"><div class="card s12"><p class="muted">Buscando tus insignias…</p></div></div>`; }
  const cat = state.badgeCatalog||[]; const earned = state.cloudBadges||[];
  const earnedSet = new Set(earned.map(b=>b.code));
  const earnedAt = c => { const r=earned.find(b=>b.code===c); return r?new Date(r.earned_at).toLocaleDateString("es-CL",{day:"numeric",month:"long"}):""; };
  // Orden: descubiertas primero; el resto, misterio.
  const cards = cat.slice().sort((x,y)=> (earnedSet.has(y.code)?1:0)-(earnedSet.has(x.code)?1:0)).map(b=>{
    const has=earnedSet.has(b.code);
    if(has) return `<div class="badge-card on"><span class="badge-glyph">${esc(b.glyph||"✦")}</span>
        <b>${esc(b.name)}</b><small class="muted">${esc(b.description||"")}</small><small class="badge-when">Descubierta · ${esc(earnedAt(b.code))}</small></div>`;
    if(b.secret) return `<div class="badge-card off secret"><span class="badge-glyph">✦</span><b>Insignia secreta</b><small class="muted">Sigue creando para descubrirla.</small></div>`;
    return `<div class="badge-card off"><span class="badge-glyph">${esc(b.glyph||"✦")}</span><b>${esc(b.name)}</b><small class="muted">${esc(b.description||"")}</small></div>`;
  }).join("");
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Tus Insignias</h2><div class="spacer"></div><span class="pill ${earned.length?'gold':''}">${earned.length} de ${cat.length}</span></div>
    <p class="muted" style="margin:-4px 0 14px;font-size:13px">No se anuncian todas. Algunas esperan a ser descubiertas.</p>
    <div class="badge-grid">${cards}</div></div></div>`;
}
async function loadBadges(){
  if(!Cloud.enabled){ state.cloudBadges=[]; return; }
  try{ const r=await Promise.all([Cloud.badgeCatalog(),Cloud.myBadges()]); state.badgeCatalog=r[0]; state.cloudBadges=r[1]; if(state.view==="insignias"||state.view==="estadisticas") renderView(); }
  catch(e){ state.cloudBadges=[]; }
}

/* ===========================================================
   ESTADÍSTICAS (Alpha 2026) — "La huella de tu Alma, en números."
   Se abre en HUELLA. Mide lo que el Alma ha creado y recibido.
   =========================================================== */
function vEstadisticas(a){
  // Carga diferida de insignias y cronología para los conteos.
  if(a.live){ if(state.cloudBadges==null) loadBadges(); if(state.cloudTimeline==null) loadTimeline(); }
  const p=levelProgress(a.xp), lv=levelByKey(a.level);
  const works=(a.portfolio||[]).length, projT=(a.projects||[]).length;
  const projA=(a.projects||[]).filter(x=>x.st==="En curso"||x.st==="En producción").length;
  const mem=(a.memories||[]).length, hitos=(a.trajectory||[]).length, lib=(a.library||[]).length;
  const badges=(state.cloudBadges||[]).length, recuerdos=(state.cloudTimeline||[]).length;
  const days=a.created_at?Math.max(1,Math.floor((Date.now()-new Date(a.created_at).getTime())/86400000)):null;
  const stat=(n,l,c)=>`<div class="card s3"><div class="stat"><span class="num"${c?` style="color:${c}"`:''}>${n}</span><span class="lbl">${l}</span></div></div>`;
  // Proyectos por estado.
  const byStatus={}; (a.projects||[]).forEach(x=>{ const s=x.st||"Sin estado"; byStatus[s]=(byStatus[s]||0)+1; });
  const statusRows=Object.keys(byStatus).length?Object.entries(byStatus).sort((x,y)=>y[1]-x[1])
      .map(([s,n])=>`<div class="country-row"><span>${esc(s)}</span><b>${n}</b></div>`).join("")
    :`<p class="muted" style="font-size:13px">Aún no registras trabajos.</p>`;
  return `<div class="grid">
    <div class="card s12" style="background:linear-gradient(145deg,rgba(208,170,99,.14),rgba(255,255,255,.7))">
      <span class="pill gold">${lv.emoji} ${esc(lv.label)} · ${esc(lv.name)}</span>
      <h2 style="font-size:24px;letter-spacing:-.04em;margin:10px 0 4px">La huella de tu Alma</h2>
      <div class="ebar" style="max-width:420px;margin:6px 0 6px"><span style="width:${p.pct}%"></span></div>
      <div class="muted" style="font-size:12.5px">${a.xp.toLocaleString("es-CL")} XP${p.next?` · ${p.pct}% hacia ${esc(p.next.label)}`:" · camino completo ∞"}${days?` · ${days} día${days===1?"":"s"} en ANIMA`:""}</div>
    </div>
    ${stat((a.sparks||0).toLocaleString("es-CL"),"Chispas","var(--gold-deep)")}
    ${stat(works,"Obras")}
    ${stat(projA+"/"+projT,"Proyectos activos")}
    ${stat(recuerdos,"Recuerdos")}
    ${stat(mem,"Memorias")}
    ${stat(hitos,"Hitos")}
    ${stat(lib,"Biblioteca")}
    ${stat(badges,"Insignias","var(--gold-deep)")}
    <div class="card s7"><div class="section-title"><h2>Trabajos por estado</h2></div><div class="country-rows">${statusRows}</div></div>
    <div class="card s5"><div class="section-title"><h2>Tu pulso</h2></div>
      <p class="muted" style="font-size:13px;line-height:1.6">Cada obra, memoria e hito suma Esencia y te acerca al siguiente nivel. ${p.next?`Te faltan <b>${(p.next.xp-a.xp).toLocaleString("es-CL")} XP</b> para <b>${esc(p.next.label)}</b>.`:"Has recorrido todo el camino."}</p>
      ${a.live?"":`<p class="muted" style="font-size:12px">Entra a tu Alma en la nube para contar tus insignias y recuerdos.</p>`}</div>
  </div>`;
}

/* ===========================================================
   VISIBILIDAD (Alpha 2026) — "Tú decides qué ve el mundo."
   Se abre en HUELLA. Centraliza el portafolio público y qué
   secciones se muestran a las demás Almas (almas.visibility).
   =========================================================== */
function visOn(a,k,def){ const v=a.visibility||{}; return (k==="public")?(v.public===true):(v[k]!==false&&(def!==false)); }
function vVisibilidad(a){
  if(!a.live) return `<div class="grid"><div class="card s12"><span class="pill gold">Visibilidad</span><h2 style="margin:8px 0;letter-spacing:-.03em">Entra a tu Alma</h2><p class="muted" style="max-width:600px">Para decidir qué muestra tu Alma al mundo, entra a tu Alma en la nube.</p></div></div>`;
  const pub=visOn(a,"public");
  const sw=(k,label,desc)=>{ const on=(k==="public")?pub:visOn(a,k);
    return `<div class="row" style="align-items:flex-start"><div class="grow"><b>${label}</b><br><small class="muted">${desc}</small></div>
      <button class="pf-pubtoggle ${on?'on':''}" data-vistoggle="${k}"><span class="toggle ${on?'on':''}"></span>${on?'Visible':'Oculto'}</button></div>`; };
  const link = pub ? `<div class="row"><div class="grow"><b>Tu enlace público</b><br><small class="muted">Compártelo: muestra solo tu cara pública.</small></div>
      <a class="btn ghost sm" href="portfolio.html?alma=${a.almaId}" target="_blank" rel="noopener">Ver público ↗</a></div>` : "";
  return `<div class="grid">
    <div class="card s12" style="background:linear-gradient(145deg,rgba(208,170,99,.14),rgba(255,255,255,.7))">
      <span class="pill gold">👁 Visibilidad</span>
      <h2 style="font-size:24px;letter-spacing:-.04em;margin:10px 0 4px">Tú decides qué ve el mundo</h2>
      <p class="muted" style="max-width:640px">Tu espacio es privado por defecto. Aquí eliges qué parte de tu Alma es pública. Tu Raíz, memorias, proyectos y agenda <b>nunca</b> se muestran.</p></div>
    <div class="card s12"><div class="section-title"><h2>Portafolio público</h2></div>
      ${sw("public","Portafolio público","Si está activo, otras Almas y visitantes pueden ver tu portafolio.")}
      ${link}</div>
    <div class="card s12"><div class="section-title"><h2>¿Qué se muestra en tu cara pública?</h2></div>
      ${sw("bio","Sobre mí","Tu biografía.")}
      ${sw("tags","Servicios / etiquetas","Tus disciplinas y servicios.")}
      ${sw("trajectory","Trayectoria","Tus hitos y trayectoria.")}
      ${sw("portfolio","Obras","Las obras de tu portafolio.")}
      ${sw("links","Enlaces","Sitio, redes y tienda.")}
      <p class="muted" style="font-size:12px;margin-top:10px">Estas opciones afectan únicamente tu portafolio público.</p></div>
  </div>`;
}
async function toggleVisibility(key){
  const a=me(); if(!a.live) return;
  a.visibility=a.visibility||{};
  if(key==="public") a.visibility.public=!(a.visibility.public===true);
  else a.visibility[key]=(a.visibility[key]===false); // por defecto visible → al togglear, oculta/restaura
  try{ await Cloud.updateAlma(a.almaId,{visibility:a.visibility}); Cloud.log("visibilidad",{key}); }
  catch(e){ alert("No se pudo guardar: "+(e.message||e)); }
  save(); renderView();
}

/* ===========================================================
   CONSEJO DE ALMAS (Alpha 2026) — proponer y votar.
   "Las primeras Almas ayudaron a escribir la historia de ANIMA."
   =========================================================== */
function vConsejo(a){
  const can = a.council || (isCreator && !state.viewAs);
  const intro = `<div class="card s12">
    <div class="section-title"><h2>⚖ Consejo de Almas</h2><div class="spacer"></div>
      <span class="pill gold">✦ Alma Fundadora</span></div>
    <p class="muted" style="margin:0">Las primeras 50 Almas proponen funciones, votan cambios y eligen el rumbo de ANIMA.</p></div>`;
  const form = can ? `<div class="card s12">
      <div class="section-title"><h2>Proponer una idea</h2></div>
      <div class="field"><input id="propTitle" placeholder="Título de la propuesta"></div>
      <div class="field"><textarea id="propBody" rows="2" placeholder="¿Qué deberíamos construir o cambiar en ANIMA?"></textarea></div>
      <button class="btn gold" id="propSend">Proponer al Consejo</button></div>` : "";
  const props = state.cloudProposals;
  let list;
  if(props==null){ loadProposals(); list = `<div class="card s12"><p class="muted">Cargando propuestas…</p></div>`; }
  else if(!props.length){ list = `<div class="card s12"><p class="muted">Aún no hay propuestas. ${can?"Sé la primera Alma en proponer.":""}</p></div>`; }
  else {
    list = props.map(p=>{
      const fav=p.favor||0, con=p.contra||0, mine=p.my_vote||0;
      const d=new Date(p.created_at); const day=isNaN(d)?"":d.toLocaleDateString("es-CL",{day:"numeric",month:"long"});
      const voteBtns = can ? `<div class="prop-vote">
          <button class="btn sm ${mine>0?'gold':'secondary'}" data-vote="${p.id}" data-val="1">▲ A favor · ${fav}</button>
          <button class="btn sm ${mine<0?'gold':'secondary'}" data-vote="${p.id}" data-val="-1">▼ En contra · ${con}</button>
        </div>` : `<div class="prop-vote muted" style="font-size:12.5px">A favor ${fav} · En contra ${con}</div>`;
      return `<div class="card s12 prop-card">
        <div class="section-title"><h2 style="font-size:17px">${esc(p.title)}</h2><div class="spacer"></div>
          <span class="pill ${p.status==='abierta'?'':'gold'}">${esc(p.status)}</span></div>
        ${p.description?`<p style="margin:2px 0 10px">${esc(p.description)}</p>`:""}
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          ${voteBtns}<small class="muted">${esc(day)}</small></div></div>`;
    }).join("");
  }
  return `<div class="grid">${intro}${form}${list}</div>`;
}
async function loadProposals(){ if(!Cloud.enabled){ state.cloudProposals=[]; return; } try{ state.cloudProposals=await Cloud.proposals(); if(state.view==="consejo") renderView(); }catch(e){ state.cloudProposals=[]; } }
async function sendProposal(){
  const a=me(); if(!(a.council||isCreator)){ alert("Solo el Consejo de Almas puede proponer."); return; }
  const title=(document.getElementById("propTitle")||{}).value, body=(document.getElementById("propBody")||{}).value;
  if(!title || !title.trim()){ alert("Escribe un título para tu propuesta."); return; }
  try{
    await Cloud.createProposal(title.trim(), (body||"").trim());
    if(window.AnimaState){ AnimaState.addEsencia(20,"Proponer al Consejo"); }
    state.cloudProposals=null; state.cloudTimeline=null; renderView();
  }catch(e){ alert("No se pudo proponer: "+(e.message||e)); }
}
async function vote(id, val){
  const a=me(); if(!(a.council||isCreator)){ alert("Solo el Consejo de Almas puede votar."); return; }
  try{ await Cloud.castVote(id, val); state.cloudProposals=await Cloud.proposals(); renderView(); }
  catch(e){ alert("No se pudo votar: "+(e.message||e)); }
}

/* --- Santuario --- */
function vSantuario(a){
  if(a.live && a.santuario) return vSantuarioLive(a);
  const S=SEED_SANCTUARY, list=roster(), live=liveMode();
  const full=state.almas.filter(x=>x.finance);
  const totalInc=full.reduce((t,x)=>t+sum(x.finance.income),0), totalExp=full.reduce((t,x)=>t+sum(x.finance.expense),0);
  const totalProj=full.reduce((t,x)=>t+x.projects.length,0), activeProj=full.reduce((t,x)=>t+x.projects.filter(p=>p.st==="En curso").length,0);
  const dist=LEVELS.map(l=>({l,n:list.filter(x=>x.level===l.key).length})).filter(d=>d.n>0);
  const top=[...list].sort((x,y)=>y.xp-x.xp).slice(0,5);
  return `<div class="grid">
    <div class="card s12" style="background:linear-gradient(145deg,rgba(208,170,99,.16),rgba(255,255,255,.7))">
      <span class="pill gold">Nivel 3 · Santuario</span><h2 style="font-size:30px;letter-spacing:-.05em;margin:10px 0 4px">${S.emoji} ${S.name}</h2>
      <p class="muted" style="max-width:680px">${S.desc}</p></div>
    <div class="card s3"><div class="stat"><span class="num">${list.length}</span><span class="lbl">Almas</span></div></div>
    <div class="card s3"><div class="stat"><span class="num">${S.clans.length}</span><span class="lbl">Clanes</span></div></div>
    <div class="card s3"><div class="stat"><span class="num">${activeProj}/${totalProj}</span><span class="lbl">Proyectos ${live?'(míos)':'activos'}</span></div></div>
    <div class="card s3"><div class="stat"><span class="num">${money(totalInc-totalExp)}</span><span class="lbl">Ganancia ${live?'(mía)':'general'}</span></div></div>
    <div class="card s7"><div class="section-title"><h2>Clanes del Santuario</h2></div>
      ${S.clans.map(id=>{const c=SEED_CLANS.find(x=>x.id===id); const n=list.filter(m=>m.clan===c.name).length;
        return `<div class="row"><span style="font-size:22px">${c.emoji}</span><div class="grow"><b>${c.name}</b><br><small>${n} Almas · ${c.desc}</small></div></div>`;}).join("")}</div>
    <div class="card s5"><div class="section-title"><h2>Departamentos</h2></div>
      ${S.departments.map(d=>{const l=list.find(x=>x.slug===d.lead)||state.almas.find(x=>x.id===d.lead);return `<div class="row"><div class="grow"><b>${d.t}</b><br><small>Lidera: ${l?esc(l.name):"—"}</small></div></div>`;}).join("")}</div>
    <div class="card s7"><div class="section-title"><h2>Raíz general</h2><div class="spacer"></div><span class="pill">${live?'Privadas':'Agregado'}</span></div>
      ${live?`<p class="muted" style="font-size:13px">🔒 En el sistema vivo la Raíz de cada Alma es <b>privada</b>. Estos números corresponden sólo a tu Alma.</p>`:``}
      <div class="grid" style="gap:14px;margin-top:${live?'10px':'0'}">
        <div class="s4"><div class="stat"><span class="num" style="color:var(--ok);font-size:22px">${money(totalInc)}</span><span class="lbl">Ingresos</span></div></div>
        <div class="s4"><div class="stat"><span class="num" style="color:var(--danger);font-size:22px">${money(totalExp)}</span><span class="lbl">Egresos</span></div></div>
        <div class="s4"><div class="stat"><span class="num" style="font-size:22px">${money(totalInc-totalExp)}</span><span class="lbl">Neto</span></div></div></div></div>
    <div class="card s5"><div class="section-title"><h2>Distribución por nivel</h2></div>
      ${dist.map(d=>`<div class="row"><span style="font-size:18px">${d.l.emoji}</span><div class="grow"><b>${d.l.key}</b></div><span class="chip">${d.n}</span></div>`).join("")}</div>
    <div class="card s12"><div class="section-title"><h2>Almas destacadas (Esencia)</h2></div>
      ${top.map((m,i)=>`<div class="row"><b style="color:var(--gold);width:24px">${i+1}</b>${avatarHTML(m,"sm")}<div class="grow"><b>${esc(m.name)}</b><br><small>${esc(m.role||"")}</small></div><span class="chip">${m.xp.toLocaleString("es-CL")} Esencia</span></div>`).join("")}</div>
  </div>`;
}

/* ===========================================================
   CLAN — Equipo, roles y recordatorios (Fase 4)
   Local-first (localStorage por clan) + sincronización en la nube
   best-effort si existen las tablas de la migración 0006.
   =========================================================== */
function roleBadge(role){
  const m={CREADOR:["👑","Creador","#d0aa63"],ADMIN:["◆","Admin","#7b3a8a"],LIDER:["✦","Líder","#3a6f8a"],COLABORADOR:["✚","Colaborador","#3a8a5f"],MIEMBRO:["•","Miembro","#8a8170"]};
  const [i,l,c]=m[role]||m.MIEMBRO; return `<span class="role-badge" style="--rc:${c}">${i} ${l}</span>`;
}
function planBadge(plan){ const p=PLAN_META[plan]||PLAN_META.ALMA; return `<span class="plan-badge">${p.ico} ${esc(p.t)}</span>`; }
function clanMembers(clan){ return clan ? roster().filter(m=>m.clan===clan) : []; }

function teamKey(clan){ return "anima_team_"+(clan||"_none"); }
function teamLocal(clan){ try{ const d=JSON.parse(localStorage.getItem(teamKey(clan))); if(d&&d.tasks&&d.reminders) return d; }catch(e){} return {tasks:[],reminders:[]}; }
function teamSaveLocal(clan,d){ try{ localStorage.setItem(teamKey(clan), JSON.stringify(d)); }catch(e){} }
function teamCache(clan){ if(!state.teamCache) state.teamCache={}; if(!state.teamCache[clan]) state.teamCache[clan]=teamLocal(clan); const d=state.teamCache[clan]; d.tasks=d.tasks||[]; d.reminders=d.reminders||[]; d.events=d.events||[]; d.projects=d.projects||[]; return d; }

async function syncTeam(clan){
  if(!clan || !(Cloud.enabled && me().live)) return;   // sin nube/clan → modo local
  try{
    const [tasks,reminders,events,projects]=await Promise.all([
      Cloud.teamTasks(clan),Cloud.reminders(clan),
      Cloud.clanEvents(clan).catch(()=>[]),Cloud.clanProjects(clan).catch(()=>[])
    ]);
    if(!state.teamCache) state.teamCache={};
    const prev=state.teamCache[clan]||{};
    state.teamCache[clan]={
      tasks: tasks.map(t=>({id:t.id,title:t.title,assignee:t.assignee,status:t.status||"Pendiente",_cloud:true})),
      reminders: reminders.map(r=>({id:r.id,title:r.title,due:r.due_at,assignee:r.assignee,done:!!r.done,_cloud:true})),
      events: events.map(e=>({id:e.id,title:e.title,date:e.at_date,time:e.at_time,kind:e.kind,notes:e.notes,_cloud:true})),
      projects: projects.map(p=>({id:p.id,title:p.title,assignee:p.assignee,status:p.status||"Pendiente",pct:p.pct||0,due:p.due_at,notes:p.notes,_cloud:true})),
      invites: prev.invites||null, _cloud:true
    };
    if(["equipo","recordatorios","calendario","proyectos_clan","clanpanel"].includes(state.view)) renderView();
  }catch(e){ /* tablas aún no creadas → se mantiene lo local */ }
}

async function addTeamTask(){
  if(!canCollaborate()){ alert("Tu rol es de solo lectura. Pide a tu Líder el rol de Colaborador para crear tareas."); return; }
  const clan=me().clan; if(!clan){ alert("Necesitas pertenecer a un Clan."); return; }
  const title=prompt("Tarea para el equipo:"); if(!title||!title.trim()) return;
  const assignee=(prompt("¿Para quién? (nombre, opcional)","")||"").trim()||null;
  const row={title:title.trim(),assignee,status:"Pendiente"};
  if(Cloud.enabled && me().live){ try{ await Cloud.addTeamTask(clan,row); await syncTeam(clan); return; }catch(e){} }
  const d=teamCache(clan); d.tasks.unshift({id:"l"+Date.now(),...row}); teamSaveLocal(clan,d); renderView();
}
async function cycleTask(id){
  if(!canCollaborate()){ alert("Solo Colaboradores o Líderes pueden mover tareas."); return; }
  const clan=me().clan; const d=teamCache(clan); const t=d.tasks.find(x=>x.id===id); if(!t) return;
  const order=["Pendiente","En curso","Hecho"]; t.status=order[(order.indexOf(t.status)+1)%order.length];
  if(t._cloud && Cloud.enabled){ try{ await Cloud.updateTeamTask(id,{status:t.status}); }catch(e){} }
  teamSaveLocal(clan,d); renderView();
}
async function delTeamTask(id){
  if(!canLead()){ alert("Solo el Líder puede eliminar tareas."); return; }
  const clan=me().clan; const d=teamCache(clan); const t=d.tasks.find(x=>x.id===id);
  d.tasks=d.tasks.filter(x=>x.id!==id);
  if(t&&t._cloud&&Cloud.enabled){ try{ await Cloud.deleteTeamTask(id); }catch(e){} }
  teamSaveLocal(clan,d); renderView();
}
async function addReminder(){
  const clan=me().clan; if(!clan){ alert("Necesitas pertenecer a un Clan."); return; }
  const title=prompt("Recordatorio del Clan:"); if(!title||!title.trim()) return;
  const due=(prompt("Fecha (AAAA-MM-DD, opcional):","")||"").trim()||null;
  const assignee=(prompt("¿Para quién? (opcional):","")||"").trim()||null;
  const row={title:title.trim(),due_at:due,assignee,done:false};
  if(Cloud.enabled && me().live){ try{ await Cloud.addReminder(clan,row); await syncTeam(clan); return; }catch(e){} }
  const d=teamCache(clan); d.reminders.unshift({id:"l"+Date.now(),title:row.title,due:row.due_at,assignee:row.assignee,done:false}); teamSaveLocal(clan,d); renderView();
}
async function toggleReminder(id){
  const clan=me().clan; const d=teamCache(clan); const r=d.reminders.find(x=>x.id===id); if(!r) return; r.done=!r.done;
  if(r._cloud&&Cloud.enabled){ try{ await Cloud.updateReminder(id,{done:r.done}); }catch(e){} }
  teamSaveLocal(clan,d); renderView();
}
async function delReminder(id){
  if(!canLead()){ alert("Solo el Líder puede eliminar recordatorios."); return; }
  const clan=me().clan; const d=teamCache(clan); const r=d.reminders.find(x=>x.id===id);
  d.reminders=d.reminders.filter(x=>x.id!==id);
  if(r&&r._cloud&&Cloud.enabled){ try{ await Cloud.deleteReminder(id); }catch(e){} }
  teamSaveLocal(clan,d); renderView();
}

function fmtDay(d){ if(!d) return "—"; try{ return new Date(d+"T00:00:00").toLocaleDateString("es-CL",{day:"2-digit",month:"short"}); }catch(e){ return d; } }
function joinCodeBox(){ return `<div class="join-box"><input id="joinCode" placeholder="Código de invitación (ej: CLAN-AB12)"><button class="btn sm" id="joinBtn">Unirme</button></div>`; }
function clanEmpty(title, sub){
  return `<div class="grid"><div class="card s12">
    <span class="pill gold">${esc(title)}</span>
    <h2 style="letter-spacing:-.03em;margin:8px 0">Aún no perteneces a un Clan</h2>
    <p class="muted" style="max-width:620px">${esc(sub)} Únete con un código de tu Líder, o activa el plan <b>Clan</b> en <b>Mi Plan</b>.</p>
    <div style="margin-top:12px">${joinCodeBox()}</div>
    <div style="margin-top:10px"><button class="btn secondary sm" data-view="miplan">Ir a Mi Plan →</button></div>
  </div></div>`;
}
function clanHeader(a,clan,title,sub){
  const seed=SEED_CLANS.find(c=>c.name===clan); const members=clanMembers(clan);
  return `<div class="card s12" style="background:linear-gradient(145deg,rgba(208,170,99,.14),rgba(255,255,255,.7))">
    <div class="section-title"><h2>${seed?seed.emoji:'❂'} ${esc(clan)} · ${esc(title)}</h2><div class="spacer"></div>${planBadge(a.plan||'CLAN')}${roleBadge(almaRole(me()))}<span class="pill">${members.length||1} Alma(s)</span></div>
    <p class="muted" style="font-size:13px">${esc(sub)}</p></div>`;
}
function vEquipo(a){
  const clan=a.clan; if(!clan) return clanEmpty("Plan de trabajo","El tablero de tareas es compartido por el Clan.");
  const d=teamCache(clan); const can=canCollaborate(); const COLS=["Pendiente","En curso","Hecho"];
  const card=t=>`<div class="kcard"><b>${esc(t.title)}</b><small>${esc(t.assignee||'Sin asignar')}</small>
      <div class="kacts">${can?`<button class="ia" data-taskcycle="${t.id}" title="Avanzar estado">→</button>`:''}${canLead()?`<button class="ia danger" data-taskdel="${t.id}" title="Eliminar">✕</button>`:''}</div></div>`;
  return `<div class="grid">
    ${clanHeader(a,clan,"Plan de trabajo",can?"Tablero compartido: crea, asigna y mueve tareas.":"Tablero del Clan (tu rol es de solo lectura).")}
    <div class="card s12"><div class="section-title"><h2>Tablero</h2><div class="spacer"></div>${can?`<button class="btn sm gold" data-teamadd="1">+ Tarea</button>`:`<span class="pill">Solo lectura</span>`}</div>
      <div class="kanban">${COLS.map(s=>`<div class="kcol"><div class="kcol-h">${s.toUpperCase()}<span>${d.tasks.filter(t=>(t.status||'Pendiente')===s).length||""}</span></div>${d.tasks.filter(t=>(t.status||'Pendiente')===s).map(card).join("")||`<div class="kempty">—</div>`}</div>`).join("")}</div></div>
  </div>`;
}
function vClanPanel(a){
  const clan=a.clan; if(!clan) return clanEmpty("Panel del Clan","Aquí gestionas miembros, roles y códigos de invitación.");
  const members=clanMembers(clan); const lead=canLead();
  const roleCtrl=m=>{ const r=(m===me()&&isCreator)?'CREADOR':((m.team_role)||'MIEMBRO');
    if(!lead || r==='CREADOR' || m.id===a.almaId) return roleBadge(r);
    return `<select class="role-sel" data-roleset="${m.id}">${ROLES.map(([k,l])=>`<option value="${k}" ${k===r?'selected':''}>${l}</option>`).join("")}</select>`; };
  const roster=members.length?members.map(m=>{ const lv=levelByKey(m.level);
    return `<div class="row"><span class="avatar sm" style="background:linear-gradient(145deg,${m.color||'#888'},${shade(m.color||'#888',-22)})">${initials(m.name)}</span>
      <div class="grow"><b>${esc(m.name)}</b><br><small class="muted">${lv.emoji} ${esc(m.level)} · ${esc(m.role||m.country||'')}</small></div>${roleCtrl(m)}</div>`; }).join(""):`<p class="muted">Aún eres la única Alma del Clan. Genera un código para sumar a otras.</p>`;
  const legend=ROLES.map(([k])=>`<div class="row"><span class="grow">${roleBadge(k)} <small class="muted">${ROLE_DESC[k]}</small></span><span class="chip">${members.filter(m=>((m.team_role)||'MIEMBRO')===k).length}</span></div>`).join("");
  const inv=(teamCache(clan).invites)||[];
  const invitesCard = lead
    ? `<div class="card s12"><div class="section-title"><h2>Códigos de invitación</h2><div class="spacer"></div>
        <select id="inviteRole" class="role-sel">${ROLES.filter(r=>r[0]!=='ADMIN').map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select>
        <button class="btn sm gold" id="genInvite">+ Generar código</button></div>
        <p class="muted" style="font-size:12.5px">Comparte un código para que un Alma se una a <b>${esc(clan)}</b> con el rol elegido. Lo ingresa en su <b>Mi Plan</b>.</p>
        ${inv.length?inv.map(c=>`<div class="row"><code class="invite-code">${esc(c.code)}</code><div class="grow"><small class="muted">Rol al unirse: <b>${esc((ROLES.find(r=>r[0]===c.role)||['',c.role])[1])}</b></small></div>
          <button class="btn ghost sm" data-copycode="${esc(c.code)}">Copiar</button><button class="ia danger" data-delinvite="${c.id}">✕</button></div>`).join(""):`<p class="muted">Aún no generaste códigos.</p>`}</div>`
    : `<div class="card s12"><div class="section-title"><h2>Tu rol</h2></div><p class="muted">Eres ${roleBadge(almaRole(me()))} en este Clan. Solo el Líder asigna roles y genera códigos.</p></div>`;
  return `<div class="grid">
    ${clanHeader(a,clan,"Panel",lead?"Eres Líder: asigna roles a tu gente y genera códigos.":"Miembros del Clan y tu rol actual.")}
    <div class="card s6"><div class="section-title"><h2>Miembros</h2><div class="spacer"></div><span class="pill">${members.length}</span></div>${roster}</div>
    <div class="card s6"><div class="section-title"><h2>Roles</h2></div><p class="muted" style="font-size:12.5px">${lead?'Cambia el rol de cada Alma con el selector. Miembro = solo ve; Colaborador = crea/edita; Líder = gestiona.':'Los roles definen quién organiza al equipo.'}</p>${legend}</div>
    ${invitesCard}
  </div>`;
}
function vCalendario(a){
  const clan=a.clan; if(!clan) return clanEmpty("Calendario","Los eventos y turnos son del Clan.");
  const d=teamCache(clan); const can=canCollaborate();
  const evs=[...d.events].sort((x,y)=>String(x.date||"9999").localeCompare(String(y.date||"9999")));
  const today=new Date().toISOString().slice(0,10);
  const up=evs.filter(e=>!e.date||e.date>=today), past=evs.filter(e=>e.date&&e.date<today);
  const item=e=>`<div class="row ev-row"><div class="ev-date"><b>${fmtDay(e.date)}</b><small>${esc(e.time||"")}</small></div>
    <div class="grow"><b>${esc(e.title)}</b>${e.kind?` <span class="chip">${esc(e.kind)}</span>`:""}${e.notes?`<br><small class="muted">${esc(e.notes)}</small>`:""}</div>
    ${canLead()?`<button class="ia danger" data-eventdel="${e.id}">✕</button>`:""}</div>`;
  return `<div class="grid">
    ${clanHeader(a,clan,"Calendario",can?"Eventos y turnos del Clan. Agrega los próximos.":"Calendario del Clan (solo lectura).")}
    <div class="card s12"><div class="section-title"><h2>Próximos</h2><div class="spacer"></div>${can?`<button class="btn sm gold" data-eventadd="1">+ Evento</button>`:`<span class="pill">Solo lectura</span>`}</div>
      ${up.length?up.map(item).join(""):`<p class="muted">Sin eventos próximos.</p>`}</div>
    ${past.length?`<div class="card s12"><div class="section-title"><h2>Pasados</h2><div class="spacer"></div><span class="pill">${past.length}</span></div>${past.map(item).join("")}</div>`:""}
  </div>`;
}
function vProyectosClan(a){
  const clan=a.clan; if(!clan) return clanEmpty("Proyectos del Clan","Los encargos compartidos son del Clan.");
  const d=teamCache(clan); const can=canCollaborate(); const FLOWP=["Pendiente","En curso","Revisión","Hecho"];
  const card=p=>`<div class="kcard"><b>${esc(p.title)}</b><small>${esc(p.assignee||'Sin asignar')}${p.due?' · '+fmtDay(p.due):''}</small>${p.notes?`<p>${esc(p.notes)}</p>`:""}
      <div class="kacts">${can?`<button class="ia" data-cprojcycle="${p.id}" title="Avanzar">→</button>`:''}${canLead()?`<button class="ia danger" data-cprojdel="${p.id}">✕</button>`:''}</div></div>`;
  return `<div class="grid">
    ${clanHeader(a,clan,"Proyectos",can?"Encargos compartidos del Clan y su avance.":"Proyectos del Clan (solo lectura).")}
    <div class="card s12"><div class="section-title"><h2>Encargos</h2><div class="spacer"></div>${can?`<button class="btn sm gold" data-cprojadd="1">+ Proyecto</button>`:`<span class="pill">Solo lectura</span>`}</div>
      <div class="kanban">${FLOWP.map(s=>`<div class="kcol"><div class="kcol-h">${s.toUpperCase()}<span>${d.projects.filter(p=>(p.status||'Pendiente')===s).length||""}</span></div>${d.projects.filter(p=>(p.status||'Pendiente')===s).map(card).join("")||`<div class="kempty">—</div>`}</div>`).join("")}</div></div>
  </div>`;
}
const PLAN_PICK_FEATURES={
  ALMA:["Tu espacio individual completo","Portafolio público + Chispas","Centro documental y Raíz privada","Comunidad y constelación"],
  CLAN:["Todo lo de Alma para cada miembro","Panel: miembros, roles y códigos","Plan de trabajo y calendario sincronizados","Proyectos y recordatorios del Clan"],
  SANTUARIO:["Todo lo de Clan a gran escala","Varios Clanes y departamentos","Panel del Santuario con métricas","Coordinación con rol Admin"]
};
function vMiPlan(a){
  const cur=almaPlan(a); const admin=(isCreator&&!state.viewAs);
  const card=k=>{ const m=PLAN_META[k]; const on=cur===k;
    return `<div class="card s4 plan-pick ${on?'on':''}">
      <span class="lvl" style="font-size:34px;line-height:1">${m.ico}</span>
      <h2 style="font-size:24px;letter-spacing:-.04em;margin:8px 0 0">${m.t}</h2>
      <small class="muted">${m.sub}</small>
      <ul class="feat">${PLAN_PICK_FEATURES[k].map(f=>`<li><span class="ck">✦</span> ${f}</li>`).join("")}</ul>
      ${on?`<span class="pill ok" style="width:max-content">Tu Forma actual</span>`
          :admin?`<button class="btn ${k==='CLAN'?'gold':'secondary'}" data-pickplan="${k}">Asignar ${m.t}</button>`
          :(k==='ALMA'?`<span class="pill" style="width:max-content">Tu Forma de origen</span>`
                      :`<span class="pill" style="width:max-content">La concede el Creador</span>`)}
    </div>`; };
  const intro = admin
    ? `<p class="muted" style="max-width:640px">Como Creador, asignas la Forma de cada Alma desde la <b>Consola</b>. Aquí puedes asignar la tuya.</p>`
    : `<p class="muted" style="max-width:640px">Tu Forma define cómo habitas ANIMA. Toda Alma nace como <b>Alma</b>. <b>Clan</b> y <b>Santuario</b> son moradas que <b>concede el Creador de ANIMA</b> — no se activan solas.</p>`;
  return `<div class="grid">
    <div class="card s12" style="background:linear-gradient(145deg,rgba(208,170,99,.14),rgba(255,255,255,.7))">
      <span class="pill gold">Forma</span>
      <h2 style="font-size:26px;letter-spacing:-.04em;margin:10px 0 4px">Cómo habitas ANIMA</h2>
      ${intro}
      ${a.clan?`<p class="muted" style="font-size:12.5px;margin-top:8px">Tu Clan: <b>${esc(a.clan)}</b>${a.santuario?` · Santuario: <b>${esc(a.santuario)}</b>`:""} · Rol: ${roleBadge(almaRole(me()))}</p>`:""}
    </div>
    ${["ALMA","CLAN","SANTUARIO"].map(card).join("")}
  </div>`;
}
function vSantuarioLive(a){
  const s=a.santuario; const list=(state.cloudAlmas||[]).filter(x=>x.santuario===s);
  const clans=[...new Set(list.map(x=>x.clan).filter(Boolean))];
  const sparks=list.reduce((t,x)=>t+(x.sparks||0),0);
  const clanRow=c=>{ const mem=list.filter(x=>x.clan===c); const lead=mem.find(x=>(x.team_role)==='LIDER'||(x.team_role)==='ADMIN');
    return `<div class="row"><span style="font-size:20px">❂</span><div class="grow"><b>${esc(c)}</b><br><small class="muted">${mem.length} Alma(s)${lead?` · Lidera ${esc(lead.name)}`:""}</small></div><span class="chip">${mem.reduce((t,x)=>t+(x.sparks||0),0)} ✦</span></div>`; };
  return `<div class="grid">
    <div class="card s12" style="background:linear-gradient(145deg,rgba(208,170,99,.16),rgba(255,255,255,.7))">
      <span class="pill gold">Nivel 3 · Santuario</span><h2 style="font-size:30px;letter-spacing:-.05em;margin:10px 0 4px">🜁 ${esc(s)}</h2>
      <p class="muted">Tu organización: varios Clanes bajo una misma visión. ${canAdminSantuario()?'Como <b>Admin</b>, coordinas a todos.':'Vista del Santuario.'}</p></div>
    <div class="card s3"><div class="stat"><span class="num">${list.length}</span><span class="lbl">Almas</span></div></div>
    <div class="card s3"><div class="stat"><span class="num">${clans.length}</span><span class="lbl">Clanes</span></div></div>
    <div class="card s3"><div class="stat"><span class="num">${sparks}</span><span class="lbl">Chispas</span></div></div>
    <div class="card s3"><div class="stat"><span class="num">${list.filter(x=>(x.team_role)==='LIDER'||(x.team_role)==='ADMIN').length}</span><span class="lbl">Líderes</span></div></div>
    <div class="card s7"><div class="section-title"><h2>Clanes del Santuario</h2></div>${clans.length?clans.map(clanRow).join(""):`<p class="muted">Aún no hay Clanes. Crea códigos por Clan desde el Panel.</p>`}</div>
    <div class="card s5"><div class="section-title"><h2>Almas destacadas (Chispas)</h2></div>
      ${[...list].sort((x,y)=>(y.sparks||0)-(x.sparks||0)).slice(0,6).map((m,i)=>`<div class="row"><b style="color:var(--gold);width:22px">${i+1}</b>${avatarHTML(m,"sm")}<div class="grow"><b>${esc(m.name)}</b><br><small class="muted">${esc(m.clan||'—')}</small></div><span class="chip">${m.sparks||0} ✦</span></div>`).join("")||`<p class="muted">—</p>`}</div>
  </div>`;
}
/* ===========================================================
   PLANIFICACIÓN DEL SANTUARIO (Alpha 2026)
   Igual que el Panel de Clan, pero a escala de organización.
   Lectura: cualquier Alma del Santuario. Edición: ADMIN (o Creador).
   =========================================================== */
function santCache(s){ if(!state.santCache) state.santCache={}; if(!state.santCache[s]) state.santCache[s]={tasks:[],projects:[],events:[]}; return state.santCache[s]; }
async function loadSant(s){
  if(!s || !(Cloud.enabled && me().live)) return;
  try{
    const [tasks,projects,events]=await Promise.all([
      Cloud.santTasks(s).catch(()=>[]), Cloud.santProjects(s).catch(()=>[]), Cloud.santEvents(s).catch(()=>[])
    ]);
    state.santCache=state.santCache||{};
    state.santCache[s]={
      tasks:tasks.map(t=>({id:t.id,title:t.title,assignee:t.assignee,status:t.status||'Pendiente',_cloud:true})),
      projects:projects.map(p=>({id:p.id,title:p.title,assignee:p.assignee,due:p.due_at,status:p.status||'Pendiente',_cloud:true})),
      events:events.map(e=>({id:e.id,title:e.title,date:e.at_date,time:e.at_time,notes:e.notes,_cloud:true}))
    };
    if(state.view==="sant_plan") renderView();
  }catch(e){}
}
function vSantPlan(a){
  const s=a.santuario;
  if(!s) return `<div class="grid"><div class="card s12"><span class="pill gold">Planificación</span><h2 style="margin:8px 0;letter-spacing:-.03em">Sin Santuario</h2><p class="muted" style="max-width:600px">La planificación es de la organización. Activa el plan <b>Santuario</b> en Mi Plan para coordinar varios Clanes.</p></div></div>`;
  const can=canAdminSantuario(); const d=santCache(s);
  const COLS=["Pendiente","En curso","Hecho"];
  const tcard=t=>`<div class="kcard"><b>${esc(t.title)}</b><small>${esc(t.assignee||'Sin asignar')}</small>
      <div class="kacts">${can?`<button class="ia" data-santtaskcycle="${t.id}" title="Avanzar">→</button><button class="ia danger" data-santtaskdel="${t.id}" title="Eliminar">✕</button>`:''}</div></div>`;
  const FLOWP=["Pendiente","En curso","Revisión","Hecho"];
  const pcard=p=>`<div class="kcard"><b>${esc(p.title)}</b><small>${esc(p.assignee||'Sin asignar')}${p.due?' · '+fmtDay(p.due):''}</small>
      <div class="kacts">${can?`<button class="ia" data-santprojcycle="${p.id}" title="Avanzar">→</button><button class="ia danger" data-santprojdel="${p.id}" title="Eliminar">✕</button>`:''}</div></div>`;
  const evs=[...d.events].sort((x,y)=>String(x.date||"9999").localeCompare(String(y.date||"9999")));
  const eitem=e=>`<div class="row ev-row"><div class="ev-date"><b>${fmtDay(e.date)}</b><small>${esc(e.time||"")}</small></div>
    <div class="grow"><b>${esc(e.title)}</b>${e.notes?`<br><small class="muted">${esc(e.notes)}</small>`:""}</div>
    ${can?`<button class="ia danger" data-santeventdel="${e.id}">✕</button>`:""}</div>`;
  return `<div class="grid">
    <div class="card s12" style="background:linear-gradient(145deg,rgba(208,170,99,.16),rgba(255,255,255,.7))">
      <span class="pill gold">🜁 ${esc(s)} · Planificación</span>
      <h2 style="font-size:24px;letter-spacing:-.04em;margin:10px 0 4px">Coordina tu organización</h2>
      <p class="muted">${can?'Como <b>Admin</b> del Santuario, planificas tareas, proyectos y el calendario de toda la organización.':'Vista de la planificación del Santuario (solo el Admin puede editar).'}</p></div>
    <div class="card s12"><div class="section-title"><h2>Tablero de tareas</h2><div class="spacer"></div>${can?`<button class="btn sm gold" data-santtaskadd="1">+ Tarea</button>`:`<span class="pill">Solo lectura</span>`}</div>
      <div class="kanban">${COLS.map(c=>`<div class="kcol"><div class="kcol-h">${c.toUpperCase()}<span>${d.tasks.filter(t=>(t.status||'Pendiente')===c).length||""}</span></div>${d.tasks.filter(t=>(t.status||'Pendiente')===c).map(tcard).join("")||`<div class="kempty">—</div>`}</div>`).join("")}</div></div>
    <div class="card s12"><div class="section-title"><h2>Proyectos de la organización</h2><div class="spacer"></div>${can?`<button class="btn sm gold" data-santprojadd="1">+ Proyecto</button>`:`<span class="pill">Solo lectura</span>`}</div>
      <div class="kanban">${FLOWP.map(c=>`<div class="kcol"><div class="kcol-h">${c.toUpperCase()}<span>${d.projects.filter(p=>(p.status||'Pendiente')===c).length||""}</span></div>${d.projects.filter(p=>(p.status||'Pendiente')===c).map(pcard).join("")||`<div class="kempty">—</div>`}</div>`).join("")}</div></div>
    <div class="card s12"><div class="section-title"><h2>Calendario</h2><div class="spacer"></div>${can?`<button class="btn sm gold" data-santeventadd="1">+ Evento</button>`:`<span class="pill">Solo lectura</span>`}</div>
      ${evs.length?evs.map(eitem).join(""):`<p class="muted">Sin eventos. ${can?'Agrega el primero.':''}</p>`}</div>
  </div>`;
}
async function addSantTask(){
  if(!canAdminSantuario()){ alert("Solo el Admin del Santuario planifica."); return; }
  const s=me().santuario; if(!s) return;
  const title=(prompt("Tarea del Santuario:")||"").trim(); if(!title) return;
  const assignee=(prompt("Responsable (opcional):","")||"").trim()||null;
  try{ await Cloud.addSantTask(s,{title,assignee,status:"Pendiente"}); await loadSant(s); }catch(e){ alert("No se pudo guardar: "+(e.message||e)); }
}
async function cycleSantTask(id){
  if(!canAdminSantuario()) return; const s=me().santuario; const d=santCache(s); const t=d.tasks.find(x=>x.id===id); if(!t) return;
  const order=["Pendiente","En curso","Hecho"]; t.status=order[(order.indexOf(t.status)+1)%order.length];
  try{ await Cloud.updateSantTask(id,{status:t.status}); }catch(e){} renderView();
}
async function delSantTask(id){
  if(!canAdminSantuario()) return; const s=me().santuario;
  try{ await Cloud.deleteSantTask(id); await loadSant(s); }catch(e){ alert("No se pudo eliminar: "+(e.message||e)); }
}
async function addSantProject(){
  if(!canAdminSantuario()){ alert("Solo el Admin del Santuario planifica."); return; }
  const s=me().santuario; if(!s) return;
  const title=(prompt("Proyecto del Santuario:")||"").trim(); if(!title) return;
  const assignee=(prompt("Responsable (opcional):","")||"").trim()||null;
  const due_at=(prompt("Entrega (AAAA-MM-DD, opcional):","")||"").trim()||null;
  try{ await Cloud.addSantProject(s,{title,assignee,due_at,status:"Pendiente",pct:0}); await loadSant(s); }catch(e){ alert("No se pudo guardar: "+(e.message||e)); }
}
async function cycleSantProject(id){
  if(!canAdminSantuario()) return; const s=me().santuario; const d=santCache(s); const p=d.projects.find(x=>x.id===id); if(!p) return;
  const order=["Pendiente","En curso","Revisión","Hecho"]; p.status=order[(order.indexOf(p.status)+1)%order.length];
  try{ await Cloud.updateSantProject(id,{status:p.status}); }catch(e){} renderView();
}
async function delSantProject(id){
  if(!canAdminSantuario()) return; const s=me().santuario;
  try{ await Cloud.deleteSantProject(id); await loadSant(s); }catch(e){ alert("No se pudo eliminar: "+(e.message||e)); }
}
async function addSantEvent(){
  if(!canAdminSantuario()){ alert("Solo el Admin del Santuario planifica."); return; }
  const s=me().santuario; if(!s) return;
  const title=(prompt("Evento del Santuario:")||"").trim(); if(!title) return;
  const at_date=(prompt("Fecha (AAAA-MM-DD):","")||"").trim()||null;
  const at_time=(prompt("Hora (opcional):","")||"").trim()||null;
  const notes=(prompt("Nota (opcional):","")||"").trim()||null;
  try{ await Cloud.addSantEvent(s,{title,at_date,at_time,notes}); await loadSant(s); }catch(e){ alert("No se pudo guardar: "+(e.message||e)); }
}
async function delSantEvent(id){
  if(!canAdminSantuario()) return; const s=me().santuario;
  try{ await Cloud.deleteSantEvent(id); await loadSant(s); }catch(e){ alert("No se pudo eliminar: "+(e.message||e)); }
}

/* --- Acciones de planes, roles y herramientas de Clan --- */
async function pickPlan(plan){
  const a=me(); if(!a.live){ alert("Entra a tu Alma en la nube para activar un plan."); return; }
  // Clan y Santuario son moradas concedidas: solo el Creador las asigna (Consola).
  if((plan==="CLAN"||plan==="SANTUARIO") && !(isCreator && !state.viewAs)){
    alert("Clan y Santuario los concede el Creador de ANIMA."); return;
  }
  const patch={plan};
  if(plan==="CLAN" || plan==="SANTUARIO"){
    if(!a.clan){ const name=(prompt(plan==="SANTUARIO"?"Nombre de tu Santuario (y Clan principal):":"Nombre de tu Clan:","")||"").trim(); if(!name) return; patch.clan=name; patch.team_role="LIDER"; if(plan==="SANTUARIO"){ patch.santuario=name; patch.team_role="ADMIN"; } }
    else if(plan==="SANTUARIO" && !a.santuario){ patch.santuario=a.clan; patch.team_role="ADMIN"; }
  }
  try{ await Cloud.updateAlma(a.almaId,patch);
    a.plan=patch.plan; if(patch.clan)a.clan=patch.clan; if(patch.team_role)a.team_role=patch.team_role; if(patch.santuario)a.santuario=patch.santuario;
    try{ state.cloudAlmas=await Cloud.allAlmas(); }catch(e){}
    if(a.clan) await syncTeam(a.clan);
    save(); renderAll(); alert("Plan "+PLAN_META[plan].t+" activado ✓");
  }catch(e){ alert("No se pudo activar el plan: "+(e.message||e)); }
}
async function joinClanCode(){
  const a=me(); if(!a.live){ alert("Entra a tu Alma para unirte a un Clan."); return; }
  const el=document.getElementById("joinCode"); const code=(el?el.value:"").trim(); if(!code) return;
  try{ const clan=await Cloud.joinByCode(code);
    try{ state.cloudAlmas=await Cloud.allAlmas(); const meRow=(state.cloudAlmas||[]).find(x=>x.id===a.almaId);
      if(meRow){ a.clan=meRow.clan; a.team_role=meRow.team_role; a.santuario=meRow.santuario; } }catch(e){}
    a.clan=a.clan||clan;
    if(almaPlan(a)==="ALMA"){ try{ await Cloud.updateAlma(a.almaId,{plan:"CLAN"}); a.plan="CLAN"; }catch(e){} }
    await syncTeam(a.clan); save(); state.view="clanpanel"; renderAll(); alert("Te uniste al Clan "+clan+" ✓");
  }catch(e){ alert("No se pudo unir: "+(e.message||e)); }
}
async function setMemberRole(almaId, role){
  if(!canLead()){ alert("Solo el Líder asigna roles."); return; }
  try{ const rows=await Cloud.adminUpdateAlma(almaId,{team_role:role}); if(!rows.length) throw new Error("RLS bloqueó el cambio.");
    state.cloudAlmas=await Cloud.allAlmas(); renderView();
  }catch(e){ alert("No se pudo cambiar el rol: "+(e.message||e)); }
}
async function loadInvites(clan){
  if(!(Cloud.enabled && me().live && clan && canLead())) return;
  try{ const inv=await Cloud.clanInvites(clan); const d=teamCache(clan); d.invites=inv.map(c=>({id:c.id,code:c.code,role:c.role})); if(state.view==='clanpanel') renderView(); }catch(e){}
}
async function genInvite(){
  const a=me(), clan=a.clan; if(!clan||!canLead()) return;
  const role=(document.getElementById("inviteRole")||{}).value||"MIEMBRO";
  const code="CLAN-"+Math.random().toString(36).slice(2,6).toUpperCase();
  try{ await Cloud.createInvite({code,clan,santuario:a.santuario||null,role}); await loadInvites(clan); }
  catch(e){ alert("No se pudo generar el código: "+(e.message||e)); }
}
async function delInvite(id){ const clan=me().clan; try{ await Cloud.deleteInvite(id); await loadInvites(clan); }catch(e){ alert("No se pudo eliminar: "+(e.message||e)); } }
function copyCode(code){ if(navigator.clipboard){ navigator.clipboard.writeText(code).then(()=>alert("Código copiado: "+code)); } else { prompt("Copia el código:",code); } }
async function addClanEvent(){
  if(!canCollaborate()){ alert("Tu rol es de solo lectura. Pide a tu Líder el rol de Colaborador."); return; }
  const clan=me().clan; if(!clan) return;
  const title=(prompt("Evento / turno:")||"").trim(); if(!title) return;
  const at_date=(prompt("Fecha (AAAA-MM-DD):","")||"").trim()||null;
  const at_time=(prompt("Hora (opcional, ej 15:00):","")||"").trim()||null;
  const notes=(prompt("Nota (opcional):","")||"").trim()||null;
  const row={title,at_date,at_time,notes};
  if(Cloud.enabled&&me().live){ try{ await Cloud.addClanEvent(clan,row); await syncTeam(clan); return; }catch(e){ alert("No se pudo guardar: "+(e.message||e)); return; } }
  const d=teamCache(clan); d.events.unshift({id:"l"+Date.now(),title,date:at_date,time:at_time,notes}); teamSaveLocal(clan,d); renderView();
}
async function delClanEvent(id){
  if(!canLead()){ alert("Solo el Líder elimina eventos."); return; }
  const clan=me().clan; const d=teamCache(clan); const e=d.events.find(x=>x.id===id); d.events=d.events.filter(x=>x.id!==id);
  if(e&&e._cloud&&Cloud.enabled){ try{ await Cloud.deleteClanEvent(id); }catch(err){} }
  teamSaveLocal(clan,d); renderView();
}
async function addClanProject(){
  if(!canCollaborate()){ alert("Tu rol es de solo lectura. Pide a tu Líder el rol de Colaborador."); return; }
  const clan=me().clan; if(!clan) return;
  const title=(prompt("Proyecto / encargo del Clan:")||"").trim(); if(!title) return;
  const assignee=(prompt("Responsable (opcional):","")||"").trim()||null;
  const due_at=(prompt("Entrega (AAAA-MM-DD, opcional):","")||"").trim()||null;
  const row={title,assignee,due_at,status:"Pendiente",pct:0};
  if(Cloud.enabled&&me().live){ try{ await Cloud.addClanProject(clan,row); await syncTeam(clan); return; }catch(e){ alert("No se pudo guardar: "+(e.message||e)); return; } }
  const d=teamCache(clan); d.projects.unshift({id:"l"+Date.now(),title,assignee,due:due_at,status:"Pendiente",pct:0}); teamSaveLocal(clan,d); renderView();
}
async function cycleClanProject(id){
  if(!canCollaborate()){ alert("Solo Colaboradores o Líderes avanzan proyectos."); return; }
  const clan=me().clan; const d=teamCache(clan); const p=d.projects.find(x=>x.id===id); if(!p) return;
  const order=["Pendiente","En curso","Revisión","Hecho"]; p.status=order[(order.indexOf(p.status)+1)%order.length];
  if(p._cloud&&Cloud.enabled){ try{ await Cloud.updateClanProject(id,{status:p.status}); }catch(e){} }
  teamSaveLocal(clan,d); renderView();
}
async function delClanProject(id){
  if(!canLead()){ alert("Solo el Líder elimina proyectos."); return; }
  const clan=me().clan; const d=teamCache(clan); const p=d.projects.find(x=>x.id===id); d.projects=d.projects.filter(x=>x.id!==id);
  if(p&&p._cloud&&Cloud.enabled){ try{ await Cloud.deleteClanProject(id); }catch(err){} }
  teamSaveLocal(clan,d); renderView();
}
function vRecordatorios(a){
  const clan=a.clan;
  if(!clan){ return `<div class="grid"><div class="card s12"><span class="pill gold">Recordatorios</span><h2 style="margin:8px 0;letter-spacing:-.03em">Sin Clan</h2><p class="muted" style="max-width:600px">Los recordatorios son compartidos por el Clan. Únete a un Clan para usarlos.</p></div></div>`; }
  const d=teamCache(clan); const pend=d.reminders.filter(r=>!r.done), done=d.reminders.filter(r=>r.done);
  const item=r=>`<div class="row rem-row"><button class="task-dot" data-remtoggle="${r.id}" style="--tc:${r.done?'#3a8a5f':'#c0703a'}" title="Marcar">${r.done?'✓':''}</button>
      <div class="grow"><b style="${r.done?'text-decoration:line-through;opacity:.6':''}">${esc(r.title)}</b><br><small class="muted">${r.due?'⏰ '+esc(r.due):'Sin fecha'}${r.assignee?' · '+esc(r.assignee):''}</small></div>
      ${canLead()?`<button class="icon-btn" data-remdel="${r.id}" title="Eliminar">✕</button>`:''}</div>`;
  const sub=(Cloud.enabled&&me().live)?'Se sincronizan por Clan en la nube si aplicaste la migración 0006; si no, quedan en este dispositivo.':'Guardados en este dispositivo.';
  return `<div class="grid">
    <div class="card s12"><div class="section-title"><h2>⏰ Recordatorios · ${esc(clan)}</h2><div class="spacer"></div><button class="btn sm gold" data-remadd="1">+ Recordatorio</button></div>
      <p class="muted" style="font-size:12.5px">Compartidos por todo el Clan. ${sub}</p></div>
    <div class="card s12"><div class="section-title"><h2>Pendientes</h2><div class="spacer"></div><span class="pill">${pend.length}</span></div>
      ${pend.length?pend.map(item).join(""):`<p class="muted">Nada pendiente. ✨</p>`}</div>
    ${done.length?`<div class="card s12"><div class="section-title"><h2>Hechos</h2><div class="spacer"></div><span class="pill">${done.length}</span></div>${done.map(item).join("")}</div>`:''}</div>`;
}

/* ===========================================================
   EDITOR UNIVERSAL DE REGISTROS (crear / editar / eliminar)
   =========================================================== */
const EDITORS = {
  proyecto:{ title:"Trabajo", table:"projects", get:a=>a.projects, push:"unshift", xp:60,
    fields:[{k:"t",l:"Trabajo"},{k:"client",l:"Vínculo (elige o crea uno)",clients:true},{k:"st",l:"Estado",sel:["Cotizando","Aprobado","En producción","Revisión","Entregado","Cerrado"]},{k:"pct",l:"Avance %",num:true},{k:"budget",l:"Valor",num:true},{k:"start",l:"Inicio",date:true},{k:"due",l:"Entrega",date:true},{k:"desc",l:"Entregables / notas",ta:true}],
    toRow:v=>({title:v.t,client:v.client,status:v.st,pct:+v.pct||0,budget:v.budget?+v.budget:null,started_at:v.start||null,due_at:v.due||null,description:v.desc}) },
  memoria:{ title:"Memoria", table:"memories", get:a=>a.memories, push:"unshift", xp:40,
    fields:[{k:"t",l:"Título"},{k:"d",l:"Descripción",ta:true}], toRow:v=>({title:v.t,detail:v.d}) },
  ingreso:{ title:"Ingreso", table:"finance_entries", get:a=>a.finance.income, push:"unshift", xp:20,
    fields:[{k:"t",l:"Concepto"},{k:"a",l:"Monto",num:true},{k:"cat",l:"Categoría"},{k:"on",l:"Fecha",date:true},{k:"method",l:"Método (efectivo, transferencia…)"},{k:"d",l:"Periodo (AAAA-MM)"},{k:"notes",l:"Notas",ta:true}],
    toRow:v=>({title:v.t,amount:+v.a||0,period:v.d,kind:"income",category:v.cat,occurred_at:v.on||null,method:v.method,notes:v.notes}) },
  egreso:{ title:"Egreso", table:"finance_entries", get:a=>a.finance.expense, push:"unshift", xp:0,
    fields:[{k:"t",l:"Concepto"},{k:"a",l:"Monto",num:true},{k:"cat",l:"Categoría"},{k:"on",l:"Fecha",date:true},{k:"method",l:"Método (efectivo, transferencia…)"},{k:"d",l:"Periodo (AAAA-MM)"},{k:"notes",l:"Notas",ta:true}],
    toRow:v=>({title:v.t,amount:+v.a||0,period:v.d,kind:"expense",category:v.cat,occurred_at:v.on||null,method:v.method,notes:v.notes}) },
  hito:{ title:"Hito", table:"trajectory", get:a=>a.trajectory, push:"push", xp:50,
    fields:[{k:"y",l:"Año"},{k:"t",l:"Título"},{k:"d",l:"Descripción",ta:true}], toRow:v=>({year:v.y,title:v.t,detail:v.d}) },
  obra:{ title:"Obra", table:"portfolio", get:a=>a.portfolio, push:"push", xp:40,
    fields:[{k:"t",l:"Título"},{k:"k",l:"Tipo / técnica"},{k:"year",l:"Año"},{k:"c",l:"Color de respaldo",color:true},{k:"link",l:"Imagen de la obra (alta calidad)",img:true,folder:"obra"},{k:"desc",l:"Descripción",ta:true}],
    toRow:v=>({title:v.t,kind:v.k,color:v.c,year:v.year,link:v.link,description:v.desc}) },
  cita:{ title:"Cita", table:"agenda", get:a=>a.agenda, push:"push", xp:0,
    fields:[{k:"h",l:"Hora (ej: 15:00)"},{k:"t",l:"Actividad"},{k:"date",l:"Fecha",date:true},{k:"notes",l:"Notas",ta:true}], toRow:v=>({at_time:v.h,title:v.t,on_date:v.date||null,notes:v.notes}) },
  doc:{ title:"Documento", table:"library", get:a=>a.library, push:"push", xp:0,
    fields:[{k:"t",l:"Nombre"},{k:"k",l:"Tipo (Contrato, Brief…)"},{k:"url",l:"Enlace / URL"},{k:"notes",l:"Notas",ta:true}], toRow:v=>({title:v.t,kind:v.k,url:v.url,notes:v.notes}) },
  cliente:{ title:"Vínculo", table:"clients", get:a=>(a.clients||(a.clients=[])), push:"unshift", xp:0,
    fields:[{k:"name",l:"Nombre"},{k:"email",l:"Correo"},{k:"phone",l:"Teléfono"},{k:"notes",l:"Notas",ta:true}], toRow:v=>({name:v.name,email:v.email,phone:v.phone,notes:v.notes}) }
};
let recordCtx=null;
function openRecord(kind, idx=null){
  const cfg=EDITORS[kind]; if(!cfg) return; recordCtx={kind,idx};
  const a=me(); const item=(idx!=null)?cfg.get(a)[idx]:{};
  document.getElementById("recTitle").textContent=(idx!=null?"Editar ":"Nuevo/a ")+cfg.title;
  document.getElementById("recFields").innerHTML=cfg.fields.map(f=>{
    const val=(item[f.k]!=null)?item[f.k]:"";
    if(f.sel) return `<div class="field"><label>${f.l}</label><select id="rec_${f.k}">${f.sel.map(o=>`<option ${o==val?'selected':''}>${o}</option>`).join("")}</select></div>`;
    if(f.ta)  return `<div class="field"><label>${f.l}</label><textarea id="rec_${f.k}" rows="3">${esc(val)}</textarea></div>`;
    if(f.color) return `<div class="field"><label>${f.l}</label><input type="color" id="rec_${f.k}" value="${val||a.color||'#b8a892'}"></div>`;
    if(f.img) return imgUpField("rec_"+f.k, f.l, val, f.folder||"obra");
    if(f.clients){ const opts=(a.clients||[]).map(c=>`<option value="${esc(c.name)}"></option>`).join("");
      return `<div class="field"><label>${f.l}</label><input id="rec_${f.k}" list="rec_clientlist" value="${esc(val)}" autocomplete="off" placeholder="Escribe un nombre nuevo o elige uno"><datalist id="rec_clientlist">${opts}</datalist></div>`; }
    if(f.date) return `<div class="field"><label>${f.l}</label><input id="rec_${f.k}" type="date" value="${esc(val)}"></div>`;
    return `<div class="field"><label>${f.l}</label><input id="rec_${f.k}" type="${f.num?'number':'text'}" value="${esc(val)}"></div>`;
  }).join("");
  document.getElementById("recDel").style.display=(idx!=null)?"inline-flex":"none";
  document.getElementById("recMsg").textContent="";
  document.getElementById("recordModal").classList.add("open");
}
function closeRecord(){ document.getElementById("recordModal").classList.remove("open"); recordCtx=null; }
async function saveRecord(){
  if(!recordCtx) return; const {kind,idx}=recordCtx; const cfg=EDITORS[kind]; const a=me();
  const v={}; cfg.fields.forEach(f=>{ const el=document.getElementById("rec_"+f.k); v[f.k]=f.num?(+el.value||0):el.value; });
  const first=cfg.fields[0];
  if(first && !String(v[first.k]).trim()){ document.getElementById("recMsg").textContent="Completa: "+first.l; return; }
  const arr=cfg.get(a);
  // Límite de obras por nivel (Alpha 2026): la nueva huella no excede el umbral.
  if(kind==="obra" && idx==null){
    const lim = storageLimit(a.level).images;
    if((a.portfolio||[]).length >= lim){
      document.getElementById("recMsg").textContent = `Límite de ${lim} obras para tu nivel (${levelByKey(a.level).label}). Sube de nivel para guardar más.`;
      return;
    }
  }
  try{
    if(idx==null){
      const item={...v};
      if(a.live){ const row=await Cloud.insertRow(cfg.table, {...cfg.toRow(v), alma_id:a.almaId}); item._id=row.id; }
      arr[cfg.push==="push"?"push":"unshift"](item);
      if(cfg.xp){ a.xp=(a.xp||0)+cfg.xp; if(a.live){ try{await Cloud.setXP(a.almaId,a.xp);}catch(e){} } await syncLevel(a); }
      if(a.live) recordAlphaEvents(kind, v, arr);
      if(kind==="proyecto") await interconnectProject(a, v);   // Proyecto ↔ Cliente ↔ Raíz ↔ Flujo
    }else{
      const item=arr[idx]; Object.assign(item,v);
      if(a.live && item._id){ await Cloud.updateRow(cfg.table,item._id,cfg.toRow(v)); }
    }
    save(); closeRecord(); renderAll();
  }catch(e){ document.getElementById("recMsg").textContent="No se pudo guardar: "+(e.message||e); }
}

/* ===========================================================
   EVENTOS ALPHA 2026 — log + cronología + insignias + ecos.
   Se dispara al crear algo en la nube. Silencioso (fire-and-forget).
   =========================================================== */
function recordAlphaEvents(kind, v, arr){
  try{
    const a=me(); const nick=(a.name||"Alma").split(" ")[0];
    Cloud.log(kind+"_creado", { titulo: v.t || v.name || v.title || "" });
    if(kind==="obra"){
      const first = (arr||[]).length===1;
      Cloud.log("obra_subida", { titulo:v.t||"" });
      Cloud.logTimeline("obra", first?"Dejaste tu primera huella":"Dejaste una nueva huella", v.t||"");
      if(first) Cloud.awardBadge("primer_latido");
      Cloud.emitEcho("huella", "✦ "+nick+(first?" dejó su primera huella":" dejó una nueva huella")).catch(()=>{});
      if(window.WorldTree) WorldTree.onHuella({ almaName:a.name, branch:branchOf(a), country:a.country });
    } else if(kind==="memoria"){
      if(window.WorldTree) WorldTree.onMemoria({ almaName:a.name, country:a.country });
    } else if(kind==="hito"){
      Cloud.logTimeline("nivel", "Sumaste un hito a tu trayectoria", v.t||"");
    }
    // Invalida cachés para que Cronología e Insignias se refresquen al entrar.
    state.cloudTimeline=null; state.cloudBadges=null;
  }catch(e){}
}
/* ===========================================================
   INTERCONEXIÓN — al crear un Proyecto, ANIMA enlaza todo:
   · Vínculo (cliente): se crea si es nuevo, o se enlaza el existente.
   · Raíz (finanzas): si hay Valor, nace un ingreso estimado del proyecto.
   · Flujo de trabajo: el proyecto entra a tu kanban (su estado).
   Reusa tablas existentes (clients, finance_entries). Sin tocar esquema.
   =========================================================== */
async function interconnectProject(a, v){
  const notes=[];
  // 1 · Vínculo (cliente)
  const cname=(v.client||"").trim();
  if(cname){
    a.clients=a.clients||[];
    const exists=a.clients.some(c=>String(c.name||"").trim().toLowerCase()===cname.toLowerCase());
    if(!exists){
      const item={ name:cname };
      if(a.live){ try{ const row=await Cloud.insertRow("clients",{ name:cname, alma_id:a.almaId }); item._id=row.id; }catch(e){} }
      a.clients.unshift(item); notes.push("Vínculo creado");
    } else { notes.push("Vínculo enlazado"); }
  }
  // 2 · Raíz (ingreso estimado del proyecto)
  const budget=+v.budget||0;
  if(budget>0){
    const per=new Date().toISOString().slice(0,7);
    const inc={ t:"Proyecto: "+(v.t||""), a:budget, d:per, cat:"Proyecto"+(cname?(" · "+cname):"") };
    if(a.live){ try{ const row=await Cloud.insertRow("finance_entries",{ title:inc.t, amount:budget, period:per, kind:"income", category:inc.cat, alma_id:a.almaId }); inc._id=row.id; }catch(e){} }
    a.finance.income.unshift(inc); notes.push("Ingreso estimado en tu Raíz");
  }
  // 3 · Flujo de trabajo: ya entró a tu kanban.
  notes.push("En tu Flujo de trabajo");
  save();
  animaToast("Proyecto creado · " + notes.join(" · "));
}
async function deleteRecord(kind,idx){
  const cfg=EDITORS[kind]; const a=me(); const arr=cfg.get(a); const item=arr[idx];
  if(!confirm("¿Eliminar este elemento?")) return;
  try{
    if(a.live && item && item._id){ await Cloud.deleteRow(cfg.table,item._id); }
    arr.splice(idx,1); save(); closeRecord(); renderAll();
  }catch(e){ alert("No se pudo eliminar: "+(e.message||e)); }
}
async function syncLevel(a){
  const cur=levelProgress(a.xp).cur.key;
  if(cur!==a.level){
    a.level=cur;
    if(window.WorldTree){ const lvUp=levelByKey(cur); WorldTree.onLevelUp({ almaName:a.name, level:(lvUp&&lvUp.label)||cur, country:a.country }); }
    if(a.live){
      try{await Cloud.updateAlma(a.almaId,{level:cur});}catch(e){}
      // Alpha 2026: el nivel desbloqueado deja huella en log, cronología y ecos.
      try{
        const lv=levelByKey(cur), nick=(a.name||"Alma").split(" ")[0];
        Cloud.log("nivel_desbloqueado", { level:cur });
        Cloud.logTimeline("nivel", "Alcanzaste "+lv.label, lv.name);
        Cloud.emitEcho("nivel", "✦ "+nick+" alcanzó "+lv.label).catch(()=>{});
        state.cloudTimeline=null;
      }catch(e){}
    }
    save(); setTimeout(()=>alert("✦ Tu Alma evolucionó a nivel "+cur),60);
  }
}

/* ===========================================================
   EXPORTAR PDF — Dossier del Alma
   =========================================================== */
function exportPDF(){
  const a=me(), lv=levelByKey(a.level), inc=sum(a.finance.income), exp=sum(a.finance.expense);
  document.getElementById("printArea").innerHTML=`
    <div class="p-head"><div class="brand"><span class="mark"><svg viewBox="0 0 100 100" fill="none"><path d="M50 7 89 91H72L61 66H39L28 91H11L50 7Z" stroke="#111" stroke-width="6.5" stroke-linejoin="round"/><circle cx="50" cy="49" r="5.5" fill="#111"/></svg></span>ANIMA TSC</div><small>Dossier de Alma · ${new Date().toLocaleDateString("es-CL")}</small></div>
    <h1 class="p-name">${esc(a.name)}</h1>
    <div class="p-sub">${lv.emoji} ${a.level} · ${lv.name} · ${a.xp.toLocaleString("es-CL")} Esencia — ${esc(a.role||"")} · ${esc(a.country||"")}</div>
    <p>${esc(a.bio||"")}</p>
    <div class="p-tags">${(a.tags||[]).map(t=>`<span>${esc(t)}</span>`).join("")}</div>
    <h2>Trayectoria</h2>${a.trajectory.map(n=>`<p><b>${esc(n.y)} · ${esc(n.t)}</b> — ${esc(n.d)}</p>`).join("")||"<p>—</p>"}
    <h2>Proyectos</h2>${a.projects.map(p=>`<p><b>${esc(p.t)}</b> (${esc(p.st)}, ${p.pct}%) — ${esc(p.client)}</p>`).join("")||"<p>—</p>"}
    <h2>Portafolio</h2><p>${a.portfolio.map(p=>esc(p.t)+" ("+esc(p.k)+")").join(" · ")||"—"}</p>
    <h2>Raíz</h2><p>Ingresos: ${money(inc)} · Egresos: ${money(exp)} · <b>Ganancia: ${money(inc-exp)}</b></p>
    <div class="p-foot">ANIMA TSC — The Soul of Creativity · The Founding Era</div>`;
  window.print();
}

/* ===========================================================
   LUMBRE — motor agente local
   =========================================================== */
function renderLumbre(){
  const a=me();
  document.getElementById("lumbreMode").innerHTML=LUMBRE_MODES.map(m=>`<div class="mode ${state.lumbreMode===m.key?'on':''}" data-mode="${m.key}"><b>${m.name}</b><small>${m.desc}</small></div>`).join("");
  const body=document.getElementById("lumbreChat");
  const intro=`<div class="msg lum"><b>LUMBRE</b><br>Soy el motor de ANIMA para <b>${esc(a.name)}</b>. Modo: <b>${modeName()}</b>. Pregúntame por Raíz, proyectos, trayectoria o pídeme sugerencias.</div>`;
  body.innerHTML=intro+state.chat.map(m=>`<div class="msg ${m.role==='you'?'you':'lum'}">${m.role==='lum'?'<b>LUMBRE</b><br>':''}${m.text}</div>`).join("");
  body.scrollTop=body.scrollHeight;
}
const modeName=()=>(LUMBRE_MODES.find(m=>m.key===state.lumbreMode)||{}).name;
function lumbreAsk(q){ state.chat.push({role:"you",text:esc(q)}); state.chat.push({role:"lum",text:lumbreThink(q)}); save(); renderLumbre(); }
function lumbreThink(q){
  const a=me(), t=q.toLowerCase();
  if(state.lumbreMode==="OFF") return "Estoy en modo <b>OFF</b>: solo organización manual. Actívame en Básico, IA Local o IA Conectada.";
  const inc=sum(a.finance.income), exp=sum(a.finance.expense), ai=(state.lumbreMode==="LOCAL"||state.lumbreMode==="CLOUD");
  if(/finanz|ingreso|egreso|ganan|plata|dinero|gast|ra[ií]z/.test(t)){ const m=exp>inc*0.7?" Tus egresos son altos respecto a tus ingresos.":" Tu margen está sano."; return `Raíz: ingresos ${money(inc)}, egresos ${money(exp)}, <b>ganancia ${money(inc-exp)}</b>.${ai?m:""}`; }
  if(/cotiz|presupuesto|precio/.test(t)) return `Abre el <b>Cotizador</b> para armar un presupuesto profesional y exportarlo en PDF. ${ai?"Puedo sugerir precios según tus proyectos anteriores.":""}`;
  if(/proyect|trabajo|encargo/.test(t)){ const act=a.projects.filter(p=>p.st==="En curso"); const s=ai&&act[0]?` Enfócate en "${esc(act[0].t)}" (${act[0].pct}%).`:""; return `Tienes ${act.length} proyecto(s) en curso de ${a.projects.length}.${s}`; }
  if(/trayectoria|historia|hito/.test(t)){ const l=a.trajectory[a.trajectory.length-1]; return l?`Tu último hito: <b>${esc(l.t)}</b> (${esc(l.y)}).`:"Aún no tienes hitos. Agrega el primero en Trayectoria."; }
  if(/portafolio|obra/.test(t)) return `Tu portafolio tiene ${a.portfolio.length} obras.`;
  if(/nivel|xp|esencia|sube|progreso/.test(t)){ const lp=levelProgress(a.xp); return lp.next?`Estás en <b>${a.level}</b> con ${a.xp.toLocaleString("es-CL")} Esencia. Te faltan ${(lp.next.xp-a.xp).toLocaleString("es-CL")} para <b>${lp.next.key}</b>.`:`Eres <b>ANIMA</b>. Nivel máximo. ∞`; }
  if(/resumen|reporte/.test(t)) return `Resumen: ${a.projects.filter(p=>p.st==="En curso").length} proyectos activos · ganancia ${money(inc-exp)} · nivel ${a.level} · ${a.memories.length} memorias.`;
  if(/hola|hey|buenas/.test(t)) return `Hola, ${esc(a.name.split(" ")[0])}. ¿Reviso tu Raíz, proyectos o tu siguiente nivel?`;
  return ai?`Puedo ayudarte con Raíz, cotizaciones, proyectos, trayectoria, niveles y reportes.`:"En modo Básico organizo Raíz, proyectos, documentos y portafolio.";
}

/* ===========================================================
   AUTH (Supabase)
   =========================================================== */
async function refreshAuth(){
  if(!Cloud.enabled){ updateAuthUI(null); return; }
  try{ state.cloudAlmas=await Cloud.allAlmas(); }catch(e){}
  const s=await Cloud.session();
  isCreator = !!(s && s.user && (s.user.email||"").toLowerCase() === CREATOR_EMAIL);
  if(s){ const pend=localStorage.getItem("anima_pending_invite"); if(pend){ try{await Cloud.redeemInvite(pend);}catch(e){} localStorage.removeItem("anima_pending_invite"); }
    await loadMyAlma(); updateAuthUI(s);
  }else{ if(state.almas.some(x=>x.live)){ state.almas=JSON.parse(JSON.stringify(SEED_ALMAS)); state.currentId="guest"; } updateAuthUI(null); renderAll(); }
}
async function loadMyAlma(){
  const row=await Cloud.myAlma(); if(!row) return;
  /* Todos cruzan el Umbral: si esta Alma aún no completó su Primer Despertar
     (campo en la nube), la enviamos al rito. Solo redirige cuando el flag es
     explícitamente false → sin bucles (el rito lo deja en true antes de volver). */
  if(row.awakening_completed === false){ location.replace("despertar.html"); return; }
  const mods=await Cloud.loadModules(row.id); const a=dbAlmaToState(row,mods);
  try{ a.clients=(await Cloud.clients(row.id)).map(c=>({_id:c.id,name:c.name,email:c.email,phone:c.phone,notes:c.notes})); }catch(e){ a.clients=[]; }
  try{ state.cloudQuotes=await Cloud.quotes(row.id); }catch(e){ state.cloudQuotes=[]; }
  try{ const p=await Cloud.getPrefs(row.id); if(p) localStorage.setItem("anima_cfg_"+row.id, JSON.stringify(p)); }catch(e){}
  state.almas=[a];   // tu Alma viva, limpia (las de muestra no se mezclan)
  state.currentId=a.id; state.view="mialma"; state.chat=[]; renderAll();
  // Sistema de logs (Alpha 2026): registra el inicio de sesión una vez por sesión.
  try{ if(!sessionStorage.getItem("anima_logged_login")){ Cloud.log("login"); sessionStorage.setItem("anima_logged_login","1"); } }catch(e){}
  // Insignia Persistencia: 30 días habitando ANIMA (best-effort).
  try{ Cloud.claimTimeBadges().then(g=>{ if(g) state.cloudBadges=null; }); }catch(e){}
  // Puente con el camino ceremonial (Esencia + Afinidad del rito de entrada)
  if(window.AnimaState){ try{
    const st=AnimaState.get(); if(a.name) st.name=a.name; if(a.affinity) st.affinity=a.affinity; AnimaState.save(st);
    AnimaState.syncCloud(row);   // sube/reconciliar Esencia y Afinidad (best-effort)
    maybeLevelGuide();           // LUMBRE guía si el Alma despertó un nuevo nivel
  }catch(e){} }
  applyHashView();               // entrada directa a Clan/Santuario desde el Home
  ensureLocation(a);             // sincroniza la ubicación del Alma (automática)
  maybeAutoTour();               // tutorial único por Alma (solo la primera vez)
}
/* ===========================================================
   UBICACIÓN AUTOMÁTICA DEL ALMA
   Cada Alma aparece en el Mundo según su ubicación. Si todavía no
   tiene país, lo detectamos una vez (por IP, en el navegador del Alma)
   y lo guardamos. Es editable en Identidad y se puede ocultar en la
   Vista pública. Best-effort: si la red lo bloquea, no pasa nada.
   =========================================================== */
async function ensureLocation(a){
  if(!a || !a.live || !a.almaId) return;
  if(a.country && String(a.country).trim()) return;
  if(localStorage.getItem("anima_geo_"+a.almaId)) return;   // ya intentado
  try{
    let country="", city="";
    try{ const r=await fetch("https://ipapi.co/json/"); if(r.ok){ const j=await r.json(); country=j.country_name||""; city=j.city||""; } }catch(_){}
    if(!country){ try{ const r2=await fetch("https://ipwho.is/"); if(r2.ok){ const j2=await r2.json(); if(j2 && j2.success!==false){ country=j2.country||""; city=j2.city||""; } } }catch(_){}}
    localStorage.setItem("anima_geo_"+a.almaId,"1");
    if(country){
      const patch={ country }; if(city && !a.city) patch.city=city;
      try{ await Cloud.updateAlma(a.almaId, patch); }catch(_){}
      Object.assign(a, patch);
      // Registrar en el Mundo el país que ingresa (visible en los Ecos, sin
      // afectar el conteo de Almas). Una sola vez, al detectar la ubicación.
      try{ const nick=(a.name||"Alma").split(" ")[0]; await Cloud.emitEcho("senal","➶ "+nick+" se suma desde "+countryLabel(country)); }catch(_){}
      try{ state.cloudAlmas=await Cloud.allAlmas(); }catch(_){}
      renderAll();
    }
  }catch(e){}
}
function updateAuthUI(session){
  const btn=document.getElementById("authBtn"); if(!btn) return;
  if(session){ const a=state.almas.find(x=>x.live); btn.textContent=a?("● "+a.name.split(" ")[0]):"● Mi cuenta"; btn.dataset.in="1"; }
  else { btn.textContent=Cloud.enabled?"Entrar":"Modo local"; btn.dataset.in=""; }
}
function openAuth(){ if(!Cloud.enabled){ alert("Conexión a la nube no disponible. ANIMA funciona en modo Fundadores local."); return; }
  document.getElementById("authModal").classList.add("open"); document.getElementById("authMsg").textContent=""; }
function closeAuth(){ document.getElementById("authModal").classList.remove("open"); }

/* ---------- Menú del Alma (cabecera, junto a LUMBRE) ---------- */
function renderAlmaMenu(){
  const pop=document.getElementById("almaPop"); if(!pop) return;
  const items=[`<button class="apop-item" data-almago="mialma">✦ Mi Alma</button>`];
  if(planAllows("clanpanel")) items.push(`<button class="apop-item" data-almago="clanpanel">❂ Mi Clan</button>`);
  if(planAllows("santuario")) items.push(`<button class="apop-item" data-almago="santuario">🜁 Santuario</button>`);
  items.push(`<div class="apop-sep"></div>`);
  // En móvil el menú lateral está oculto: sus acciones secundarias (tutorial,
  // feedback y, para el Creador, Consola/Personalizar) viven aquí, en el menú
  // del Alma, para mantener la app limpia sin perder el acceso.
  if(window.innerWidth<=960){
    items.push(`<button class="apop-item" id="almaTour">✦ Ver tutorial</button>`);
    items.push(`<button class="apop-item" id="almaFeedback">✦ Enviar feedback</button>`);
    items.push(`<button class="apop-item" id="almaCodice">❏ El Códice</button>`);
    if(isCreator && !state.viewAs){
      items.push(`<button class="apop-item" data-almago="consola">⬡ Consola</button>`);
      items.push(`<button class="apop-item" data-almago="config">⚙ Personalizar</button>`);
    }
    items.push(`<div class="apop-sep"></div>`);
  }
  if(me().live) items.push(`<button class="apop-item" id="almaPass">🔑 Cambiar contraseña</button>`);
  items.push(`<button class="apop-item" id="almaSwitch">⤿ Cambiar de Alma</button>`);
  items.push(`<button class="apop-item danger" id="almaLogout">⏻ Cerrar sesión</button>`);
  pop.innerHTML=items.join("");
}
function toggleAlmaMenu(){ const pop=document.getElementById("almaPop"); if(!pop) return;
  if(pop.classList.contains("open")){ pop.classList.remove("open"); return; }
  renderAlmaMenu(); pop.classList.add("open"); }
function closeAlmaMenu(){ const pop=document.getElementById("almaPop"); if(pop) pop.classList.remove("open"); }

/* ---------- Entrada directa a una vista desde el Home (#go=vista) ---------- */
function applyHashView(){
  const m=(location.hash||"").match(/go=([a-z_]+)/i); if(!m) return;
  const v=m[1]; history.replaceState(null,"",location.pathname+location.search);
  if(planAllows(v)) go(v);
}

/* ---------- LUMBRE: guía contextual en cada nivel desbloqueado ---------- */
function lumbreLevelTip(l){
  const u=(l.unlocks||[]).join(", ");
  const map={
    CHISPA:`Encendiste tu <b>Chispa</b> ✨. Empieza por <b>Mi Alma</b>: completa tu identidad y sube tu primera obra. Cada acción te da Esencia y te acerca al siguiente nivel.`,
    RAIZ:`¡Subiste a <b>Raíz</b> 🌱! Desbloqueaste <b>${u}</b>. Guarda tus vínculos y contactos aquí para no perder ninguna conexión.`,
    PULSO:`Tu Alma late: nivel <b>Pulso</b> 💓. Ahora tienes <b>${u}</b>. Crea tu primer proyecto y muévele los estados a medida que avanza.`,
    HUELLA:`Dejas <b>Huella</b> 📜. Se abrió tu <b>${u}</b>. Sube PDFs e imágenes y arma tu portafolio para mostrar al mundo.`,
    TOTEM:`Despertó <b>Tótem</b> 🔥… y conmigo, <b>LUMBRE</b>, como tu IA. Pídeme leer archivos y ordenar ideas. Desbloqueaste: <b>${u}</b>.`,
    AURA:`Tu <b>Aura</b> 🜂 irradia. Activaste <b>${u}</b>: deja que ANIMA trabaje por ti con recordatorios, flujos y automatizaciones.`,
    ANIMA:`Eres <b>ANIMA</b> ∞. El ecosistema completo es tuyo: <b>${u}</b>. Gracias por llegar hasta aquí — esto apenas empieza.`
  };
  return map[l.key]||`Nuevo nivel: <b>${esc(l.name)}</b>. Desbloqueaste: ${esc(u)}.`;
}
function maybeLevelGuide(){
  if(!window.AnimaState) return;
  const p=AnimaState.progress(), key=p.level.key;
  const order=AnimaState.LEVELS.map(l=>l.key);
  const seen=localStorage.getItem("anima_lumbre_level_seen");
  if(seen===key) return;
  // Guiar solo al AVANZAR (no al retroceder); sembrar 'seen' sin molestar si baja.
  if(seen && order.indexOf(key)<=order.indexOf(seen)){ localStorage.setItem("anima_lumbre_level_seen",key); return; }
  localStorage.setItem("anima_lumbre_level_seen",key);
  state.chat=state.chat||[]; state.chat.push({role:"lum",text:lumbreLevelTip(p.level)}); save();
  // LUMBRE aún no despierta: guardamos el mensaje para cuando vuelva, sin abrir el chat.
  if(LUMBRE_AWAKE) openLumbre();
}
/* El Códice — mini libro con el glosario y los conceptos del mundo ANIMA. */
function openCodice(){ const m=document.getElementById("codiceModal"); if(m) m.classList.add("open"); }
function closeCodice(){ const m=document.getElementById("codiceModal"); if(m) m.classList.remove("open"); }

/* ---------- Tirar para refrescar (móvil) ---------- */
function setupPullToRefresh(){
  if(document.querySelector(".ptr")) return;
  const ind=document.createElement("div"); ind.className="ptr";
  ind.innerHTML='<div style="display:grid;place-items:center"><span class="ring"></span><span class="lbl">Tira para actualizar</span></div>';
  document.body.appendChild(ind); const lbl=ind.querySelector(".lbl");
  let startY=0,pulling=false,dist=0; const TRIG=70;
  const view=()=>document.getElementById("view");
  const atTop=()=>{ const v=view(); return (window.scrollY||0)<=0 && (!v||v.scrollTop<=0); };
  window.addEventListener("touchstart",e=>{ if(!atTop()){pulling=false;return;} startY=e.touches[0].clientY; pulling=true; dist=0; },{passive:true});
  window.addEventListener("touchmove",e=>{ if(!pulling) return; dist=e.touches[0].clientY-startY;
    if(dist<=0){ ind.style.height="0px"; return; } const h=Math.min(90,dist*0.5); ind.style.height=h+"px";
    if(lbl) lbl.textContent=h>=TRIG*0.5?"Suelta para actualizar":"Tira para actualizar"; },{passive:true});
  window.addEventListener("touchend",()=>{ if(!pulling) return; pulling=false;
    if(ind.offsetHeight>=TRIG*0.5){ ind.classList.add("spin"); ind.style.height="52px"; if(lbl) lbl.textContent="Actualizando…";
      setTimeout(()=>location.reload(),450); } else { ind.style.height="0px"; } });
}
async function doAuth(mode){
  const g=id=>document.getElementById(id).value, email=g("authEmail").trim(), pass=g("authPass"),
    name=g("authName").trim(), code=(g("authCode")||"").trim().toUpperCase(), msg=document.getElementById("authMsg");
  if(!email||!pass){ msg.textContent="Ingresa correo y contraseña."; return; }
  msg.textContent="…";
  try{
    if(mode==="up"){
      if(!code){ msg.textContent="Necesitas un código de invitación (beta cerrada)."; return; }
      if(!await Cloud.checkInvite(code)){ msg.textContent="Código de invitación inválido o ya usado."; return; }
      localStorage.setItem("anima_pending_invite",code);
      const {data,error}=await Cloud.signUp(email,pass,name||email.split("@")[0]); if(error) throw error;
      if(!data.session){ msg.textContent="Alma creada. Revisa tu correo para confirmar y vuelve a entrar."; return; }
    }else{ const {error}=await Cloud.signIn(email,pass); if(error) throw error; }
    closeAuth(); await refreshAuth();
  }catch(e){ msg.textContent=e.message||"No se pudo completar."; }
}
/* Cambiar contraseña (sesión iniciada) — usa updateUser. */
function openChangePass(){
  if(!me().live){ alert("Entra a tu Alma para cambiar la contraseña."); return; }
  const m=document.getElementById("cpModal"); if(!m) return;
  document.getElementById("cpMsg").textContent="";
  document.getElementById("cpP1").value=""; document.getElementById("cpP2").value="";
  m.classList.add("open");
}
function closeChangePass(){ const m=document.getElementById("cpModal"); if(m) m.classList.remove("open"); }
async function doChangePass(){
  const msg=document.getElementById("cpMsg");
  const p1=document.getElementById("cpP1").value, p2=document.getElementById("cpP2").value;
  if(p1.length<6){ msg.textContent="La contraseña debe tener al menos 6 caracteres."; return; }
  if(p1!==p2){ msg.textContent="Las contraseñas no coinciden."; return; }
  msg.textContent="Guardando…";
  try{
    const { error }=await Cloud.updatePassword(p1); if(error) throw error;
    try{ Cloud.log("cambio_contrasena"); Cloud.logTimeline("seguridad","Cambiaste tu contraseña"); }catch(e){}
    msg.textContent="✦ Contraseña actualizada.";
    setTimeout(closeChangePass, 900);
  }catch(e){ msg.textContent=e.message||"No se pudo cambiar la contraseña."; }
}

/* Recuperar contraseña desde el modal: usa el correo escrito (si lo hay)
   y envía el enlace; si no, lleva a la página de recuperación. */
async function doForgot(){
  const msg=document.getElementById("authMsg");
  const email=(document.getElementById("authEmail").value||"").trim();
  if(!email){ location.href="recuperar.html"; return; }
  if(!Cloud.enabled){ msg.textContent="No hay conexión con la nube."; return; }
  msg.textContent="Enviando enlace de recuperación…";
  try{
    const redirect=location.origin + location.pathname.replace(/[^/]*$/, "") + "recuperar.html";
    const { error }=await Cloud.resetPassword(email, redirect); if(error) throw error;
    msg.textContent="✦ Te enviamos un enlace para crear una contraseña nueva. Revisa tu correo.";
  }catch(e){ msg.textContent=e.message||"No se pudo enviar el enlace."; }
}
/* Cerrar sesión → vuelve al Home de ANIMA (la página principal por defecto). */
async function logout(){ if(!confirm("¿Cerrar sesión de tu Alma?"))return; try{await Cloud.log("logout");}catch(e){} try{await Cloud.signOut();}catch(e){} try{sessionStorage.removeItem("anima_logged_login");}catch(e){} try{localStorage.removeItem("anima_awakened");}catch(e){} location.href="home.html"; }
/* Cambiar de Alma → cierra sesión y abre el acceso para entrar con otra. */
async function switchAlmaSession(){ try{await Cloud.signOut();}catch(e){}
  isCreator=false; state.viewAs=null; state.almas=JSON.parse(JSON.stringify(SEED_ALMAS)); state.currentId="guest"; state.view="mialma"; save(); renderAll(); updateAuthUI(null); openAuth(); }

/* --- Editar perfil --- */
function openEdit(){ const a=me(); if(!a.live){ if(Cloud.enabled){ openAuth(); } else { alert("Entra a tu Alma para editar."); } return; }
  const s=(id,v)=>document.getElementById(id).value=v||"";
  s("edName",a.name);s("edRole",a.role);s("edCity",a.city);s("edCountry",a.country);s("edBio",a.bio);s("edTags",(a.tags||[]).join(", "));
  document.getElementById("editModal").classList.add("open"); }
function closeEdit(){ document.getElementById("editModal").classList.remove("open"); }
async function saveEdit(){ const a=me(); const g=id=>document.getElementById(id).value.trim();
  const patch={name:g("edName"),role:g("edRole"),city:g("edCity"),country:g("edCountry"),bio:g("edBio"),tags:g("edTags").split(",").map(s=>s.trim()).filter(Boolean)};
  try{ await Cloud.updateAlma(a.almaId,patch); Object.assign(a,patch); closeEdit(); renderAll(); updateAuthUI(await Cloud.session()); }
  catch(e){ alert("No se pudo guardar: "+(e.message||e)); } }

/* --- Visitar otra Alma: solo sus ventanas públicas ---
   Resumen general (nivel, ubicación, oficio, desde cuándo) + portafolio +
   trayectoria, respetando lo que cada Alma decidió hacer público en su
   Vista pública. La Raíz, agenda, memorias y vínculos NUNCA se muestran. */
async function openPublic(id){
  const row=(state.cloudAlmas||[]).find(x=>x.id===id); if(!row) return;
  const lv=levelByKey(row.level); const vis=row.visibility||{}; const show=k=>vis[k]!==false;
  const av=row.avatar_url?`background-image:url('${esc(row.avatar_url)}');background-size:cover;background-position:center`:`background:linear-gradient(145deg,${row.color},${shade(row.color,-22)})`;
  const loc=show("location")?(row.territory||(row.city&&row.country?row.city+", "+row.country:(row.country||row.city||""))):"";
  const since=row.created_at?new Date(row.created_at).toLocaleDateString("es-CL",{month:"long",year:"numeric"}):"";
  const summary=`<div class="pub-summary">
      ${loc?`<span class="chip">📍 ${esc(loc)}</span>`:""}
      <span class="chip">${lv.emoji} ${esc(lv.label)} · ${esc(lv.name)}</span>
      ${row.sparks?`<span class="chip">✦ ${row.sparks} Chispas</span>`:""}
      ${since?`<span class="chip">Alma desde ${esc(since)}</span>`:""}
    </div>`;
  document.getElementById("publicModal").classList.add("open");
  document.getElementById("pubBody").innerHTML=`<div style="text-align:center">
      <span class="avatar lg" style="margin:0 auto 10px;${av}">${row.avatar_url?"":initials(row.name)}</span>
      <h2 style="margin:0;letter-spacing:-.04em">${esc(row.name)}</h2><div class="muted">${esc([row.discipline||row.role,row.specialty].filter(Boolean).join(" · "))}${loc?" · "+esc(loc):""}</div>
      ${summary}
      <div style="margin-top:12px"><a class="btn sm" href="portfolio.html?alma=${id}" target="_blank" rel="noopener">Ver portafolio completo →</a></div></div>
    ${show("bio")&&row.bio?`<p style="margin-top:14px">${esc(row.bio||"")}</p>`:""}${show("tags")?`<div>${(row.tags||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}</div>`:""}
    <div id="pubExtra" class="muted" style="font-size:12.5px;margin-top:12px">Cargando…</div>`;
  try{ const m=await Cloud.loadModules(id);
    const tj=show("trajectory")?(m.trajectory||[]).map(x=>`<div class="node"><div class="yr">${esc(x.year)}</div><b>${esc(x.title)}</b><p class="muted" style="margin:2px 0 0">${esc(x.detail||"")}</p></div>`).join(""):"";
    const pf=show("portfolio")?(m.portfolio||[]).map(x=>`<span class="chip">${esc(x.title)} · ${esc(x.kind)}</span>`).join(""):"";
    document.getElementById("pubExtra").innerHTML=(tj?`<h3 style="font-size:15px;margin:8px 0 4px">Trayectoria</h3><div class="tl">${tj}</div>`:"")+(pf?`<h3 style="font-size:15px;margin:14px 0 6px">Portafolio</h3><div>${pf}</div>`:"")||"Esta Alma aún no ha hecho público su portafolio.";
  }catch(e){ document.getElementById("pubExtra").textContent=""; }
}
function closePublic(){ document.getElementById("publicModal").classList.remove("open"); }

/* --- Feedback --- */
let _fbRating=0;
function openFeedback(){ if(!Cloud.enabled||!me().live){ alert("Entra a tu Alma para enviar feedback."); return; }
  _fbRating=0; document.getElementById("fbMsg").value=""; document.getElementById("fbStatus").textContent=""; renderStars();
  document.getElementById("feedbackModal").classList.add("open"); }
function closeFeedback(){ document.getElementById("feedbackModal").classList.remove("open"); }
function renderStars(){ document.getElementById("fbStars").innerHTML=[1,2,3,4,5].map(n=>`<span data-star="${n}" style="cursor:pointer;font-size:26px;color:${n<=_fbRating?'#d0aa63':'#ccc'}">★</span>`).join(""); }
async function sendFeedback(){ const message=document.getElementById("fbMsg").value.trim(), st=document.getElementById("fbStatus");
  if(!message&&!_fbRating){ st.textContent="Escribe algo o deja una estrella."; return; } st.textContent="Enviando…";
  try{ await Cloud.sendFeedback({rating:_fbRating||null,message,context:state.view,almaName:me().name}); st.textContent="¡Gracias! Tu voz construye ANIMA. 🜂"; setTimeout(closeFeedback,1100); }
  catch(e){ st.textContent="No se pudo enviar: "+(e.message||e); } }

/* ===========================================================
   RENDER + EVENTOS
   =========================================================== */
function renderAll(){ renderNav(); renderWho(); renderTop(); renderView(); }
function go(view){ state.view=view; if(view==="cotizador") state.cotMode="galeria"; state.pfEdit=false; save(); renderAll(); document.getElementById("view").scrollTop=0; closeSide(); closeAlmaMenu(); if(view==="comunidad") loadPosts(); if(view==="sant_plan") loadSant(me().santuario); if(["equipo","recordatorios","calendario","proyectos_clan","clanpanel"].includes(view)){ syncTeam(me().clan); if(view==="clanpanel") loadInvites(me().clan); } }
function switchAlma(id){ state.currentId=id; state.view="mialma"; state.chat=[]; save(); renderAll(); renderLumbre(); }
const drawer=()=>document.getElementById("drawer"), dbg=()=>document.getElementById("drawerBg");
/* LUMBRE aún no despierta: el chat permanece desactivado. Al tocarla, en vez de
   desplegar el panel, avisa con serenidad. Despertará cuando el mundo (y el Alma)
   reúnan más Esencia. Cambiar a true para reactivar el chat. */
const LUMBRE_AWAKE=false;
function openLumbre(){
  if(!LUMBRE_AWAKE){ toast("✦ LUMBRE aún no despierta. Junta más Esencia…"); return; }
  drawer().classList.add("open"); dbg().classList.add("open"); renderLumbre();
}
function closeLumbre(){ drawer().classList.remove("open"); dbg().classList.remove("open"); }
function closeSide(){ document.getElementById("side").classList.remove("open"); }
/* El logo (arriba a la izquierda): cierra la ventana/menú abierto si lo hay
   (actúa como "atrás"); si no, vuelve al HOME. */
function homeOrBack(){
  const m=document.querySelector(".auth-modal.open"); if(m){ m.classList.remove("open"); return; }
  if(drawer().classList.contains("open")){ closeLumbre(); return; }
  const pop=document.getElementById("almaPop"); if(pop && pop.classList.contains("open")){ closeAlmaMenu(); return; }
  if(state.view!=="mialma"){ go("mialma"); return; }
  document.getElementById("view").scrollTop=0;
}

/* ===========================================================
   CIERRE DE MODALES SIN BUGS
   El click sobre el fondo cierra el modal, pero SOLO si el gesto empezó
   en el fondo. Antes, al rellenar un campo y arrastrar el cursor fuera
   (p. ej. seleccionando texto) el "click" caía sobre el fondo y cerraba
   la ventana perdiendo lo escrito. Ahora recordamos dónde empezó el gesto.
   =========================================================== */
let _downTarget=null;
document.addEventListener("mousedown", e=>{ _downTarget=e.target; }, true);
document.addEventListener("touchstart", e=>{ _downTarget=(e.touches&&e.touches[0])?document.elementFromPoint(e.touches[0].clientX,e.touches[0].clientY):e.target; }, true);
/* ¿Click legítimo sobre el fondo del modal `id`? (empezó y terminó en el fondo) */
function bdClose(e, id){ return e.target.id===id && (!_downTarget || _downTarget===e.target || _downTarget.id===id); }

document.addEventListener("click", e=>{
  if(e.target.closest("[data-reveal]")){ revealNext(); return; }
  // Visitar otra Alma tiene prioridad (p. ej. el avatar dentro de una Huella).
  const pvEarly=e.target.closest("[data-pub]"); if(pvEarly){ openPublic(pvEarly.dataset.pub); return; }
  const rn=e.target.closest("[data-reino]"); if(rn){ toggleReino(rn.dataset.reino); return; }
  const va=e.target.closest("[data-viewas]"); if(va){ setViewAs(va.dataset.viewas); return; }
  const cs=e.target.closest("[data-cssave]"); if(cs){ consolaSave(cs.dataset.cssave); return; }
  if(e.target.closest("[data-teamadd]")){ addTeamTask(); return; }
  const tcy=e.target.closest("[data-taskcycle]"); if(tcy){ cycleTask(tcy.dataset.taskcycle); return; }
  const tdl=e.target.closest("[data-taskdel]"); if(tdl){ delTeamTask(tdl.dataset.taskdel); return; }
  const pkp=e.target.closest("[data-pickplan]"); if(pkp){ pickPlan(pkp.dataset.pickplan); return; }
  if(e.target.closest("#joinBtn")){ joinClanCode(); return; }
  if(e.target.closest("#genInvite")){ genInvite(); return; }
  const cpc=e.target.closest("[data-copycode]"); if(cpc){ copyCode(cpc.dataset.copycode); return; }
  const din=e.target.closest("[data-delinvite]"); if(din){ delInvite(din.dataset.delinvite); return; }
  if(e.target.closest("[data-eventadd]")){ addClanEvent(); return; }
  const evd=e.target.closest("[data-eventdel]"); if(evd){ delClanEvent(evd.dataset.eventdel); return; }
  if(e.target.closest("[data-cprojadd]")){ addClanProject(); return; }
  const cpcy=e.target.closest("[data-cprojcycle]"); if(cpcy){ cycleClanProject(cpcy.dataset.cprojcycle); return; }
  const cpd=e.target.closest("[data-cprojdel]"); if(cpd){ delClanProject(cpd.dataset.cprojdel); return; }
  if(e.target.closest("[data-remadd]")){ addReminder(); return; }
  const rtg=e.target.closest("[data-remtoggle]"); if(rtg){ toggleReminder(rtg.dataset.remtoggle); return; }
  const rdl=e.target.closest("[data-remdel]"); if(rdl){ delReminder(rdl.dataset.remdel); return; }
  // Planificación del Santuario
  if(e.target.closest("[data-santtaskadd]")){ addSantTask(); return; }
  const stc=e.target.closest("[data-santtaskcycle]"); if(stc){ cycleSantTask(stc.dataset.santtaskcycle); return; }
  const std=e.target.closest("[data-santtaskdel]"); if(std){ delSantTask(std.dataset.santtaskdel); return; }
  if(e.target.closest("[data-santprojadd]")){ addSantProject(); return; }
  const spc=e.target.closest("[data-santprojcycle]"); if(spc){ cycleSantProject(spc.dataset.santprojcycle); return; }
  const spd=e.target.closest("[data-santprojdel]"); if(spd){ delSantProject(spd.dataset.santprojdel); return; }
  if(e.target.closest("[data-santeventadd]")){ addSantEvent(); return; }
  const sed=e.target.closest("[data-santeventdel]"); if(sed){ delSantEvent(sed.dataset.santeventdel); return; }
  const vtg=e.target.closest("[data-vistoggle]"); if(vtg){ toggleVisibility(vtg.dataset.vistoggle); return; }
  const ed=e.target.closest("[data-edit]"); if(ed){ const [k,i]=ed.dataset.edit.split(":"); openRecord(k,+i); return; }
  const dl=e.target.closest("[data-del]"); if(dl){ const [k,i]=dl.dataset.del.split(":"); deleteRecord(k,+i); return; }
  const st=e.target.closest("[data-star]"); if(st){ _fbRating=+st.dataset.star; renderStars(); return; }
  const cf=e.target.closest("[data-cfg]"); if(cf){ toggleCfg(cf.dataset.cfg); return; }
  const tb=e.target.closest("[data-tab]"); if(tb){ state.almaTab=tb.dataset.tab; state.view="mialma"; renderAll(); return; }
  const pcf=e.target.closest("[data-pubcfg]"); if(pcf){ togglePublic(pcf.dataset.pubcfg); return; }
  const mz=e.target.closest("[data-mapsize]"); if(mz){ setMapSize(mz.dataset.mapsize); return; }
  const rit=e.target.closest("[data-ritual]"); if(rit){ doRitual(rit.dataset.ritual); return; }
  const op=e.target.closest("[data-openpost]"); if(op){ openPost(op.dataset.openpost); return; }
  if(e.target.closest("[data-pfedit]")){ portfolioEdit(); return; }
  if(e.target.closest("[data-pfcancel]")){ portfolioCancel(); return; }
  if(e.target.closest("[data-pfpublic]")){ togglePortfolioPublic(); return; }
  const cfmt=e.target.closest("[data-cotfmt]"); if(cfmt){ cotUseFormat(cfmt.dataset.cotfmt); return; }
  const ctd=e.target.closest("[data-cottpldel]"); if(ctd){ cotDelTemplate(ctd.dataset.cottpldel); return; }
  const ctp=e.target.closest("[data-cottpl]"); if(ctp){ cotUseTemplate(ctp.dataset.cottpl); return; }
  if(e.target.closest("[data-cotblank]")){ cotBlank(); return; }
  if(e.target.closest("[data-cotback]")){ cotGallery(); return; }
  const ql=e.target.closest("[data-qload]"); if(ql){ qLoad(ql.dataset.qload); return; }
  const qx=e.target.closest("[data-qdelete]"); if(qx){ qDeleteSaved(qx.dataset.qdelete); return; }
  const qd=e.target.closest("[data-qdel]"); if(qd){ qDelItem(+qd.dataset.qdel); return; }
  if(e.target.closest("[data-qadd]")){ qAddItem(); return; }
  const t=e.target.closest("[data-view],[data-alma],[data-pub],[data-go],[data-add],[data-mode]");
  if(t){ if(t.dataset.view) go(t.dataset.view);
    else if(t.dataset.go) go(t.dataset.go);
    else if(t.dataset.alma) switchAlma(t.dataset.alma);
    else if(t.dataset.pub) openPublic(t.dataset.pub);
    else if(t.dataset.add) openRecord(t.dataset.add,null);
    else if(t.dataset.mode){ state.lumbreMode=t.dataset.mode; save(); renderLumbre(); }
    return; }
  if(e.target.closest("#q_new")) qNew();
  if(e.target.closest("#pfSave")) savePortfolioProfile();
  if(e.target.closest("#q_tpl")) cotSaveTemplate();
  if(e.target.closest("#q_save")) qSave();
  if(e.target.closest("#q_export")) qExport();
  if(e.target.closest("#createAlmaBtn")) openAuth();
  if(e.target.closest("#idSave")) saveIdentity();
  if(e.target.closest("#edSave")) saveEdit();
  if(e.target.closest("#edClose")||bdClose(e,"editModal")) closeEdit();
  if(e.target.closest("#recSave")) saveRecord();
  if(e.target.closest("#recDel")){ if(recordCtx) deleteRecord(recordCtx.kind,recordCtx.idx); }
  if(e.target.closest("#recClose")||bdClose(e,"recordModal")) closeRecord();
  if(e.target.closest("#pubClose")||bdClose(e,"publicModal")) closePublic();
  if(e.target.closest("#postSend")) sendPost();
  if(e.target.closest("#propSend")) sendProposal();
  const vt=e.target.closest("[data-vote]"); if(vt){ vote(vt.dataset.vote, +vt.dataset.val||1); return; }
  if(e.target.closest("#commentSend")){ const b=e.target.closest("#commentSend"); sendComment(b.dataset.post); }
  if(e.target.closest("#postClose")||bdClose(e,"postModal")) closePost();
  if(e.target.closest("#ritualSend")) sendRitual();
  if(e.target.closest("#ritualClose")||bdClose(e,"ritualModal")) closeRitual();
  if(e.target.closest("#feedbackBtn")) openFeedback();
  if(e.target.closest("#codiceBtn")) openCodice();
  if(e.target.closest("#codiceClose")||bdClose(e,"codiceModal")) closeCodice();
  if(e.target.closest("#homeLogo")||e.target.closest("#brandHome")){ homeOrBack(); return; }
  if(e.target.closest("#fbSend")) sendFeedback();
  if(e.target.closest("#fbClose")||bdClose(e,"feedbackModal")) closeFeedback();
  if(e.target.closest("#lumbreOpen")) openLumbre();
  if(e.target.closest("#lumbreClose")||bdClose(e,"drawerBg")) closeLumbre();
  if(e.target.closest("#whoBox")) go("mialma");
  if(e.target.closest("#installBtn")) installApp();
  if(e.target.closest("#lumbreFab")) openLumbre();
  if(e.target.closest("#botLumbre")) openLumbre();
  if(e.target.closest("#tourBtn")) startTour();
  if(e.target.closest("#tourNext")) tourNext();
  if(e.target.closest("#tourSkip")) endTour();
  if(e.target.closest("#levelsInfo")) openLevels();
  if(e.target.closest("#levelClose")||bdClose(e,"levelModal")) closeLevels();
  if(e.target.closest("#sharePf")) sharePortfolio();
  if(e.target.closest("[data-export]")) exportPDF();
  const ag=e.target.closest("[data-almago]"); if(ag){ closeAlmaMenu(); go(ag.dataset.almago); return; }
  if(e.target.closest("#almaTour")){ closeAlmaMenu(); startTour(); return; }
  if(e.target.closest("#almaFeedback")){ closeAlmaMenu(); openFeedback(); return; }
  if(e.target.closest("#almaCodice")){ closeAlmaMenu(); openCodice(); return; }
  if(e.target.closest("#almaPass")){ closeAlmaMenu(); openChangePass(); return; }
  if(e.target.closest("#almaSwitch")){ closeAlmaMenu(); switchAlmaSession(); return; }
  if(e.target.closest("#almaLogout")){ closeAlmaMenu(); logout(); return; }
  if(e.target.closest("#cpSave")) doChangePass();
  if(e.target.closest("#cpClose")||bdClose(e,"cpModal")) closeChangePass();
  if(e.target.closest("#authBtn")){ const b=e.target.closest("#authBtn"); b.dataset.in?toggleAlmaMenu():openAuth(); return; }
  else if(!e.target.closest("#almaPop")) closeAlmaMenu();
  if(e.target.closest("#authClose")||bdClose(e,"authModal")) closeAuth();
  if(e.target.closest("#authSignIn")) doAuth("in");
  if(e.target.closest("#authSignUp")) doAuth("up");
  if(e.target.closest("#authForgot")) doForgot();
  if(e.target.closest("#lumbreSend")) sendLumbre();
});
document.addEventListener("keydown", e=>{
  if(e.key==="Enter" && e.target.id==="joinCode") joinClanCode();
  if(e.key==="Enter" && e.target.id==="lumbreInput") sendLumbre();
  if(e.key==="Enter" && e.target.id==="commentInput"){ const b=document.getElementById("commentSend"); if(b) sendComment(b.dataset.post); }
});
document.addEventListener("change", e=>{
  const ks=e.target.closest(".kstatus"); if(ks){ setProjectStatus(+ks.dataset.pstatus, ks.value); return; }
  const qf=e.target.closest("#q_fmt"); if(qf){ readQuoteForm(); renderView(); return; }
  const fu=e.target.closest("input[type=file][data-imgfield]"); if(fu){ uploadImgField(fu); return; }
  const rs=e.target.closest("[data-roleset]"); if(rs){ setMemberRole(rs.dataset.roleset, rs.value); return; }
});
document.addEventListener("input", e=>{
  const iu=e.target.closest("input[data-imgurl]"); if(!iu) return;
  const prev=document.getElementById(iu.dataset.imgurl); if(!prev) return;
  if(isImgUrl(iu.value)){ prev.style.backgroundImage=`url('${iu.value}')`; prev.textContent=""; prev.classList.add("has"); }
  else { prev.style.backgroundImage=""; prev.textContent="Sin imagen"; prev.classList.remove("has"); }
});
function sendLumbre(){ const i=document.getElementById("lumbreInput"), v=i.value.trim(); if(!v)return; i.value=""; lumbreAsk(v); }

/* ---------- Compartir portafolio ---------- */
function portfolioURL(a){ const base=location.origin+location.pathname.replace(/[^/]*$/,""); return base+"portfolio.html?alma="+a.almaId; }
function sharePortfolio(){ const a=me(); if(!a.live){ alert("Crea tu Alma para tener tu portafolio público compartible."); return; }
  const url=portfolioURL(a);
  if(navigator.share){ navigator.share({title:"Portafolio · "+a.name, url}).catch(()=>{}); }
  else if(navigator.clipboard){ navigator.clipboard.writeText(url).then(()=>alert("Enlace de tu portafolio copiado:\n"+url)); }
  else prompt("Tu portafolio:",url);
}

/* ---------- Tutorial guiado por LUMBRE ---------- */
const TOUR=[
  {sel:"#nav", selMobile:".botnav", title:"Tu menú", text:"Aquí cambias de morada. En el celular vive abajo (como Instagram): Mi Alma, Taller y Mundo. Cada una guarda sus pestañas dentro."},
  {sel:".tabbar", title:"Tu Alma", text:"Mi Alma tiene pestañas: Resumen, Identidad (tu foto y datos), Vista pública (qué muestras) y Ajustes."},
  {sel:".camino-card", title:"Tu camino", text:"Subes de nivel creando. Cada nivel desbloquea nuevas ventanas. Toca la ⓘ para ver el mapa de niveles."},
  {sel:'[data-view="comunidad"]', selMobile:'.botnav [data-view="comunidad"]', title:"El mundo", text:"En Mundo vive el Árbol de Almas: el mapa de quienes habitan ANIMA, los Ecos en vivo, el Ritual del día y el conteo por país. Toca una Alma para visitarla."},
  {sel:"#lumbreFab", selMobile:"#botLumbre", title:"LUMBRE ✦", text:"Tu chispa compañera. Aún está despertando: reunirá voz cuando el mundo y tu Alma junten más Esencia. ¡Bienvenida a ANIMA!"}
];
function startTour(){ closeLumbre(); closeSide(); state.view="mialma"; state.almaTab="resumen"; renderAll(); setTimeout(()=>tourStep(0),360); }
function tourStep(i){
  if(i>=TOUR.length) return endTour();
  state.tourI=i; const step=TOUR[i];
  const isMob=window.innerWidth<=960;
  const sel=(isMob && step.selMobile)?step.selMobile:step.sel;
  let el=document.querySelector(sel);
  if((!el || el.getBoundingClientRect().width===0) && step.selMobile && step.selMobile!==sel) el=document.querySelector(step.selMobile);
  if((!el || el.getBoundingClientRect().width===0) && sel!==step.sel) el=document.querySelector(step.sel);
  document.getElementById("tour").classList.add("open");
  if(!el){ return tourStep(i+1); }
  el.scrollIntoView({block:"center",behavior:"smooth"});
  setTimeout(()=>{
    const r=el.getBoundingClientRect();
    const ring=document.getElementById("tourRing");
    ring.style.cssText=`top:${r.top-6}px;left:${Math.max(6,r.left-6)}px;width:${Math.min(r.width+12,window.innerWidth-12)}px;height:${r.height+12}px`;
    const bub=document.getElementById("tourBub");
    bub.innerHTML=`<img class="lumbre" src="assets/img/lumbre.svg" width="42" height="50" alt="">
      <div style="flex:1"><b>${step.title}</b><p>${step.text}</p>
      <div class="trow"><span class="muted" style="font-size:11px">${i+1}/${TOUR.length}</span><span style="flex:1"></span>
      <button class="btn ghost sm" id="tourSkip">Saltar</button><button class="btn sm" id="tourNext">${i===TOUR.length-1?"¡Listo!":"Siguiente"}</button></div></div>`;
    let top=r.bottom+12; if(top> window.innerHeight-170) top=Math.max(12,r.top-170);
    let left=Math.max(12,Math.min(window.innerWidth-330, r.left));
    bub.style.cssText=`top:${top}px;left:${left}px`;
  },380);
}
function tourNext(){ tourStep((state.tourI||0)+1); }
/* El tutorial es ÚNICO POR ALMA: se descubre una sola vez y no se repite al
   volver a entrar. La marca se guarda por almaId (o "guest" si no hay sesión). */
function tourKey(){ return "anima_tour_done_"+(me().almaId||me().id||"guest"); }
function tourDone(){ try{ return localStorage.getItem(tourKey())==="1"; }catch(e){ return false; } }
function endTour(){ document.getElementById("tour").classList.remove("open"); try{ localStorage.setItem(tourKey(),"1"); }catch(e){} }
/* Lanza el tutorial automáticamente solo si esta Alma no lo ha visto nunca. */
function maybeAutoTour(){
  if(tourDone()) return;
  const tEl=document.getElementById("tour"); if(tEl && tEl.classList.contains("open")) return;
  setTimeout(()=>{ if(!tourDone()){ const t=document.getElementById("tour"); if(t && !t.classList.contains("open")) startTour(); } }, 900);
}

/* ---------- PWA (instalable) ---------- */
let deferredPrompt=null;
window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); deferredPrompt=e; const b=document.getElementById("installBtn"); if(b) b.hidden=false; });
window.addEventListener("appinstalled", ()=>{ deferredPrompt=null; const b=document.getElementById("installBtn"); if(b) b.hidden=true; });
async function installApp(){
  if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; const b=document.getElementById("installBtn"); if(b) b.hidden=true; }
  else { alert("Para instalar ANIMA:\n\n• iPhone/iPad (Safari): botón Compartir → \"Agregar a inicio\".\n• Android (Chrome): menú ⋮ → \"Instalar app\".\n• Computador (Chrome/Edge): ícono de instalar en la barra de direcciones."); }
}

/* ---------- Boot ---------- */
renderAll();
setupPullToRefresh();
refreshAuth();
if("serviceWorker" in navigator){ window.addEventListener("load", ()=>navigator.serviceWorker.register("sw.js").catch(()=>{})); }
/* Auto-tutorial: una sola vez por Alma. Si hay sesión, loadMyAlma() lo dispara
   con el Alma real ya cargada; aquí cubrimos el caso Invitada / sin nube. */
setTimeout(()=>{ if(!(Cloud.enabled)) maybeAutoTour(); else Cloud.session().then(s=>{ if(!s) maybeAutoTour(); }).catch(()=>maybeAutoTour()); }, 1400);
