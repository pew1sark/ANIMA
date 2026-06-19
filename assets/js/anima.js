/* ===========================================================
   ANIMA Studio — App logic (Beta · Founding Era)
   Sistema vivo: Almas editables, niveles, módulos, LUMBRE,
   personalización y Cotizador. Local + nube (Supabase).
   =========================================================== */

const STORAGE = "anima_alpha_state_v1";

/* ---------- Estado ---------- */
let state = load();
function load(){
  try{ const s = JSON.parse(localStorage.getItem(STORAGE)); if(s && s.almas && s.almas.length) return s; }catch(e){}
  return { almas: JSON.parse(JSON.stringify(SEED_ALMAS)), currentId:"sark", view:"mialma", lumbreMode:"LOCAL", chat:[] };
}
function save(){ localStorage.setItem(STORAGE, JSON.stringify(state)); }
function reset(){ if(confirm("¿Restaurar ANIMA a las 10 Almas fundadoras? Se borrarán tus cambios locales.")){ localStorage.removeItem(STORAGE); location.reload(); } }

const me = () => state.almas.find(a => a.id === state.currentId) || state.almas[0];
const sum = arr => arr.reduce((t,x)=>t+x.a,0);
const esc = s => String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

/* ---------- Avatar ---------- */
function initials(name){ return (name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase(); }
function avatarHTML(a, cls=""){ return `<span class="avatar ${cls}" style="background:linear-gradient(145deg,${a.color},${shade(a.color,-22)})">${initials(a.name)}</span>`; }
function shade(hex,p){ hex=hex||"#111111"; const n=parseInt(hex.slice(1),16); let r=(n>>16)+p,g=(n>>8&255)+p,b=(n&255)+p;
  r=Math.max(0,Math.min(255,r));g=Math.max(0,Math.min(255,g));b=Math.max(0,Math.min(255,b));
  return "#"+(0x1000000+(r<<16)+(g<<8)+b).toString(16).slice(1); }

/* ---------- Personalización (mostrar/ocultar) ---------- */
const cfgKey = a => "anima_cfg_"+(a.almaId||a.id);
function getCfg(a){
  const def={ modules:{trayectoria:true,portafolio:true,proyectos:true,finanzas:true,cotizador:true,agenda:true,memoria:true,biblioteca:true},
              cards:{constelacion:true,kpis:true,camino:true,hoy:true,memoria:true} };
  try{ const c=JSON.parse(localStorage.getItem(cfgKey(a))); if(c){ return { modules:{...def.modules,...c.modules}, cards:{...def.cards,...c.cards} }; } }catch(e){}
  return def;
}
function setCfg(a,c){ localStorage.setItem(cfgKey(a), JSON.stringify(c)); }
function toggleCfg(path){ const a=me(); const c=getCfg(a); const [g,k]=path.split(":"); c[g][k]=(c[g][k]===false); setCfg(a,c); renderAll(); }

/* ---------- Navegación ---------- */
const MODULES = [
  {v:"trayectoria",ico:"⤴",t:"Trayectoria"},
  {v:"portafolio", ico:"▦",t:"Portafolio"},
  {v:"proyectos",  ico:"◷",t:"Proyectos"},
  {v:"finanzas",   ico:"$",t:"Finanzas"},
  {v:"cotizador",  ico:"₵",t:"Cotizador"},
  {v:"agenda",     ico:"☰",t:"Agenda"},
  {v:"memoria",    ico:"✦",t:"Memorias"},
  {v:"biblioteca", ico:"❏",t:"Biblioteca"}
];
function navItem(n){ return `<div class="nav-item ${state.view===n.v?'active':''}" data-view="${n.v}"><span class="ico">${n.ico}</span>${n.t}</div>`; }
function renderNav(){
  const cfg=getCfg(me());
  let h=`<div class="nav-label">Mi Alma</div>`+navItem({v:"mialma",ico:"◆",t:"Mi Alma"});
  MODULES.forEach(m=>{ if(cfg.modules[m.v]!==false) h+=navItem(m); });
  h+=navItem({v:"config",ico:"⚙",t:"Personalizar"});
  h+=`<div class="nav-label">Mundo</div>`+navItem({v:"comunidad",ico:"❂",t:"Comunidad"})+navItem({v:"santuario",ico:"🜁",t:"Santuario"});
  document.getElementById("nav").innerHTML=h;
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
  finanzas:["Finanzas","Ingresos, egresos y ganancia — privado."],
  cotizador:["Cotizador","Crea presupuestos profesionales y expórtalos en PDF."],
  agenda:["Agenda","Tu día, ordenado."],
  memoria:["Memorias","Ideas, frases y referencias que no quieres perder."],
  biblioteca:["Biblioteca","Tus documentos y archivos."],
  config:["Personalizar","Tú decides qué muestra tu Alma."],
  comunidad:["Comunidad","Tu Clan y la constelación de Almas."],
  santuario:["Santuario","Nivel 3: la organización completa de ANIMA."]
};
function renderTop(){ const [t,s]=TITLES[state.view]||["ANIMA",""]; document.getElementById("topTitle").innerHTML=`<h1>${t}</h1><div class="sub">${s}</div>`; }

/* ---------- Constelación (mapa de Almas entrando al mundo) ---------- */
function hashStr(s){ s=String(s||""); let h=0; for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))>>>0; } return h; }
function timeAgo(iso){ if(!iso) return ""; const d=(Date.now()-new Date(iso).getTime())/1000;
  if(isNaN(d)) return ""; if(d<60) return "ahora"; if(d<3600) return Math.floor(d/60)+" min"; if(d<86400) return Math.floor(d/3600)+" h"; return Math.floor(d/86400)+" d"; }
function constelacionHTML(){
  const list = roster();
  const byNew = [...list].sort((a,b)=> new Date(b.created_at||0).getTime() - new Date(a.created_at||0).getTime());
  const recent = byNew.slice(0,5);
  const nodes = list.map(m=>{
    const h=hashStr(m.id||m.slug||m.name); const x=7+(h%86), y=12+((h>>4)%74);
    const isNew = liveMode() && recent.indexOf(m)>-1;
    const act = (liveMode()&&!m.live)?`data-pub="${m.id}"`:`data-alma="${m.id}"`;
    return `<button class="cn ${isNew?'new':''}" ${act} style="left:${x}%;top:${y}%;--c:${m.color}" title="${esc(m.name)} · ${m.level}">${initials(m.name)}</button>`;
  }).join("");
  const chips = recent.map(m=>`<span class="chip"><b style="color:${m.color}">●</b> ${esc(m.name)} · ${m.created_at?timeAgo(m.created_at):m.level}</span>`).join("");
  return `<div class="card s12">
    <div class="section-title"><h2>Mapa Constelación</h2><div class="spacer"></div>
      <span class="pill ${liveMode()?'gold':''}">${liveMode()?'🜂 En vivo':'Demo'} · ${list.length} Almas</span></div>
    <div class="constel">${nodes}</div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap">
      <small class="muted" style="font-weight:850;text-transform:uppercase;letter-spacing:.05em;font-size:10.5px">Entrando al mundo</small>
      ${chips}
    </div>
  </div>`;
}

/* ---------- Acciones de ítem (editar/eliminar) ---------- */
function acts(kind,i){ return `<span class="acts"><button class="ia" data-edit="${kind}:${i}" title="Editar">✎</button><button class="ia danger" data-del="${kind}:${i}" title="Eliminar">✕</button></span>`; }

/* ===========================================================
   VISTAS
   =========================================================== */
function renderView(){
  const fn = { mialma:vMiAlma, trayectoria:vTrayectoria, portafolio:vPortafolio, proyectos:vProyectos,
    finanzas:vFinanzas, cotizador:vCotizador, agenda:vAgenda, memoria:vMemoria, biblioteca:vBiblioteca,
    config:vConfig, comunidad:vComunidad, santuario:vSantuario }[state.view] || vMiAlma;
  document.getElementById("view").innerHTML = fn(me());
}

/* --- Mi Alma --- */
function vMiAlma(a){
  const lp=levelProgress(a.xp), lv=levelByKey(a.level), cfg=getCfg(a);
  const inc=sum(a.finance.income), exp=sum(a.finance.expense);
  const active=a.projects.filter(p=>p.st==="En curso").length;
  const createCTA = (!a.live && Cloud.enabled) ? `
    <div class="card s12" style="background:linear-gradient(145deg,rgba(208,170,99,.16),rgba(255,255,255,.7))">
      <span class="pill gold">Estás viendo una Alma de muestra</span>
      <p style="margin:8px 0 0">Crea tu propia Alma para empezar a construir tu trayectoria real y aparecer en la constelación.</p>
      <div style="margin-top:12px"><button class="btn" id="createAlmaBtn">✦ Crear mi Alma</button></div>
    </div>`:``;
  const onboarding = (a.live && a.memories.length===0 && a.projects.length===0) ? `
    <div class="card s12" style="background:linear-gradient(145deg,rgba(208,170,99,.14),rgba(255,255,255,.7))">
      <span class="pill gold">Bienvenida, Alma nueva</span>
      <p style="margin:8px 0 0">Tu Alma nació en <b>EMBER</b>. Dale vida: edita tu perfil, crea tu primer proyecto o una memoria. Cada acción te da XP.</p>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn sm" id="editBtn">✎ Editar mi perfil</button>
        <button class="btn secondary sm" data-add="proyecto">+ Primer proyecto</button>
        <button class="btn secondary sm" data-add="memoria">+ Primera memoria</button>
      </div></div>`:``;
  return `<div class="grid">
    <div class="card s8">
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        ${avatarHTML(a,"lg")}
        <div style="flex:1;min-width:200px">
          <span class="level-badge" style="border-color:${lv.color}55;color:${lv.color}">${lv.emoji} ${a.level} · ${lv.name}</span>
          <h2 style="font-size:30px;letter-spacing:-.05em;margin:10px 0 2px">${esc(a.name)}</h2>
          <div class="muted">${esc(a.role||"")} · ${esc(a.country||"")}</div>
        </div>
      </div>
      <p style="margin:16px 0 0">${esc(a.bio||"")}</p>
      <div style="margin-top:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        ${(a.tags||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}
        <span style="flex:1"></span>
        <button class="btn ghost sm" id="editBtn">✎ Editar Alma</button>
        <button class="btn ghost sm" data-export>⤓ Exportar PDF</button>
      </div>
    </div>

    <div class="card s4">
      <span class="pill gold">Camino del creador</span>
      <div class="kpi">${a.xp.toLocaleString("es-CL")} XP</div>
      <div class="bar"><span style="width:${lp.pct}%"></span></div>
      <div class="muted" style="font-size:12.5px;margin-top:8px">${lp.next?`${lp.pct}% hacia <b>${lp.next.key}</b> · ${lp.next.name}`:"Nivel máximo: Alma Despierta ∞"}</div>
      <p class="muted" style="font-size:12.5px;margin-top:12px">${lv.desc}</p>
    </div>

    ${createCTA}${onboarding}

    ${cfg.cards.constelacion!==false?constelacionHTML():``}

    ${cfg.cards.kpis!==false?`
    <div class="card s3"><div class="stat"><span class="num">${active}</span><span class="lbl">Proyectos en curso</span></div></div>
    <div class="card s3"><div class="stat"><span class="num" style="color:var(--ok)">${money(inc)}</span><span class="lbl">Ingresos</span></div></div>
    <div class="card s3"><div class="stat"><span class="num">${money(inc-exp)}</span><span class="lbl">Ganancia</span></div></div>
    <div class="card s3"><div class="stat"><span class="num">${a.clan?esc(a.clan):"—"}</span><span class="lbl">${a.clan?"Tu Clan":"Sin Clan aún"}</span></div></div>`:``}

    ${cfg.cards.camino!==false?`
    <div class="card s12">
      <div class="section-title"><h2>Tu camino</h2><div class="spacer"></div><span class="muted" style="font-size:12.5px">FOUNDING → ANIMA</span></div>
      <div class="path">${LEVELS.map((l,i)=>`<div class="lv ${i===lp.idx?'cur':''} ${i<lp.idx?'passed':''}"><div class="e">${l.emoji}</div><b>${l.key}</b><small>${l.name}</small></div>`).join("")}</div>
    </div>`:``}

    ${cfg.cards.hoy!==false?`
    <div class="card s6"><div class="section-title"><h2>Hoy</h2><div class="spacer"></div><button class="btn sm" data-add="cita">+ Cita</button></div>
      ${a.agenda.map((x,i)=>`<div class="row"><b style="color:var(--gold);width:60px">${esc(x.h)}</b><div class="grow">${esc(x.t)}</div>${acts("cita",i)}</div>`).join("")||`<p class="muted">Sin agenda hoy.</p>`}</div>`:``}

    ${cfg.cards.memoria!==false?`
    <div class="card s6"><div class="section-title"><h2>Última memoria</h2><div class="spacer"></div><button class="btn sm" data-add="memoria">+ Memoria</button></div>
      ${a.memories[0]?`<b>${esc(a.memories[0].t)}</b><p class="muted" style="margin:6px 0 0">${esc(a.memories[0].d)}</p>`:`<p class="muted">Aún no hay memorias.</p>`}
      <div style="margin-top:16px"><button class="btn ghost sm" data-go="memoria">Ver memorias →</button></div></div>`:``}
  </div>`;
}

/* --- Trayectoria --- */
function vTrayectoria(a){
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Trayectoria</h2><div class="spacer"></div><button class="btn sm" data-add="hito">+ Hito</button></div>
    <div class="tl">${a.trajectory.map((n,i)=>`<div class="node"><div style="display:flex;align-items:flex-start"><div class="grow"><div class="yr">${esc(n.y)}</div><b>${esc(n.t)}</b><p class="muted" style="margin:4px 0 0">${esc(n.d)}</p></div>${acts("hito",i)}</div></div>`).join("")||`<p class="muted">Aún no hay hitos.</p>`}</div>
  </div></div>`;
}

/* --- Portafolio --- */
function vPortafolio(a){
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Portafolio</h2><div class="spacer"></div><button class="btn sm" data-add="obra">+ Obra</button></div>
    <div class="thumbs">${a.portfolio.map((p,i)=>`<div class="thumb">
      <div class="ph" style="background:linear-gradient(145deg,${p.c},${shade(p.c,-25)})">${initials(p.t)}</div>
      <div class="cap"><div style="display:flex;align-items:center"><div class="grow"><b>${esc(p.t)}</b><small>${esc(p.k)}</small></div>${acts("obra",i)}</div></div></div>`).join("")||`<p class="muted">Aún no hay obras.</p>`}</div>
  </div></div>`;
}

/* --- Proyectos --- */
function vProyectos(a){
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Proyectos</h2><div class="spacer"></div><button class="btn sm" data-add="proyecto">+ Nuevo proyecto</button></div>
    ${a.projects.map((p,i)=>{ const cls=p.st==="En curso"?"ok":(p.st==="Planificado"?"warn":""); return `<div class="row">
      <div class="grow"><b>${esc(p.t)}</b><br><small>${esc(p.client)}</small></div>
      <div style="width:160px"><div class="bar"><span style="width:${p.pct}%"></span></div><small class="muted">${p.pct}%</small></div>
      <span class="pill ${cls}">${esc(p.st)}</span>${acts("proyecto",i)}</div>`; }).join("")||`<p class="muted">Aún no hay proyectos. Crea el primero.</p>`}
  </div></div>`;
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
    <div class="card s12 muted" style="font-size:12.5px">🔒 Tus finanzas son privadas. Mi Alma ≠ Mi Clan. Nada se comparte automáticamente.</div>
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
function vConfig(a){
  const cfg=getCfg(a);
  const mod=[["trayectoria","Trayectoria"],["portafolio","Portafolio"],["proyectos","Proyectos"],["finanzas","Finanzas"],["cotizador","Cotizador"],["agenda","Agenda"],["memoria","Memorias"],["biblioteca","Biblioteca"]];
  const card=[["constelacion","Mapa Constelación"],["kpis","Indicadores rápidos"],["camino","Camino del creador (XP y nivel)"],["hoy","Agenda de hoy"],["memoria","Última memoria"]];
  const tg=(g,k,l,on)=>`<div class="row"><div class="grow"><b>${l}</b></div><button class="toggle ${on?'on':''}" data-cfg="${g}:${k}"><span></span></button></div>`;
  return `<div class="grid">
    <div class="card s12"><span class="pill gold">Personalización</span>
      <p class="muted" style="max-width:640px">Aquí configuras tu Alma: qué módulos aparecen en tu menú y qué secciones se muestran en tu panel. Lo que no necesitas, lo ocultas. Es tu espacio.</p></div>
    <div class="card s6"><div class="section-title"><h2>Módulos del menú</h2></div>${mod.map(([k,l])=>tg("modules",k,l,cfg.modules[k]!==false)).join("")}</div>
    <div class="card s6"><div class="section-title"><h2>Secciones de Mi Alma</h2></div>${card.map(([k,l])=>tg("cards",k,l,cfg.cards[k]!==false)).join("")}</div>
  </div>`;
}

/* ===========================================================
   COTIZADOR — presupuestos profesionales + PDF
   =========================================================== */
const CURRENCIES={CLP:"$",USD:"US$",EUR:"€",MXN:"MX$",ARS:"AR$",COP:"CO$",PEN:"S/"};
const fmtq=(n,c)=>(CURRENCIES[c]||"$")+Number(n||0).toLocaleString("es-CL");
function blankQuote(){ return { id:null, title:"Cotización", client:"", date:new Date().toISOString().slice(0,10),
  discipline:"", currency:"CLP", taxPct:0, notes:"", items:[{desc:"",qty:1,price:0,unit:"unidad"}] }; }
let quoteDraft = blankQuote();
const quotesKey = a => "anima_quotes_"+(a.almaId||a.id);
function loadQuotes(a){ try{ return JSON.parse(localStorage.getItem(quotesKey(a)))||[]; }catch(e){ return []; } }
function saveQuotes(a,q){ localStorage.setItem(quotesKey(a), JSON.stringify(q)); }
function quoteTotals(){ const sub=quoteDraft.items.reduce((t,it)=>t+(+it.qty||0)*(+it.price||0),0); const tax=sub*(+quoteDraft.taxPct||0)/100; return {sub,tax,total:sub+tax}; }
function readQuoteForm(){
  const g=id=>{const e=document.getElementById(id);return e?e.value:"";};
  quoteDraft.title=g("q_title"); quoteDraft.client=g("q_client"); quoteDraft.date=g("q_date");
  quoteDraft.discipline=g("q_disc"); quoteDraft.currency=g("q_cur"); quoteDraft.taxPct=+g("q_tax")||0; quoteDraft.notes=g("q_notes");
  quoteDraft.items=quoteDraft.items.map((it,i)=>({ desc:g("qi_desc_"+i), qty:+g("qi_qty_"+i)||0, price:+g("qi_price_"+i)||0, unit:g("qi_unit_"+i)||"unidad" }));
}
function vCotizador(a){
  const t=quoteTotals(), cur=quoteDraft.currency, saved=loadQuotes(a);
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
      <div class="section-title"><h2>Editor de cotización</h2><div class="spacer"></div>
        <button class="btn ghost sm" id="q_new">＋ Nueva</button>
        <button class="btn secondary sm" id="q_save">Guardar</button>
        <button class="btn sm" id="q_export">⤓ Exportar PDF</button>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div class="field" style="flex:2;min-width:180px"><label>Título</label><input id="q_title" value="${esc(quoteDraft.title)}"></div>
        <div class="field" style="flex:1;min-width:120px"><label>Fecha</label><input id="q_date" type="date" value="${esc(quoteDraft.date)}"></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div class="field" style="flex:2;min-width:180px"><label>Cliente</label><input id="q_client" placeholder="Nombre del cliente" value="${esc(quoteDraft.client)}"></div>
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
      <p class="muted" style="font-size:12px;margin-top:8px">Editor adaptable a cualquier rama de arte. Exporta un PDF limpio listo para enviar al cliente.</p>
    </div>

    <div class="card s12">
      <div class="section-title"><h2>Cotizaciones guardadas</h2><div class="spacer"></div><span class="muted" style="font-size:12.5px">${saved.length}</span></div>
      ${saved.map(q=>`<div class="row"><div class="grow"><b>${esc(q.title)}</b><br><small>${esc(q.client||"—")} · ${esc(q.date)}</small></div>
        <button class="btn ghost sm" data-qload="${q.id}">Abrir</button><button class="ia danger" data-qdelete="${q.id}">✕</button></div>`).join("")||`<p class="muted">Aún no guardas cotizaciones.</p>`}
    </div>
  </div>`;
}
function qAddItem(){ readQuoteForm(); quoteDraft.items.push({desc:"",qty:1,price:0,unit:"unidad"}); renderView(); }
function qDelItem(i){ readQuoteForm(); quoteDraft.items.splice(i,1); if(!quoteDraft.items.length) quoteDraft.items.push({desc:"",qty:1,price:0,unit:"unidad"}); renderView(); }
function qNew(){ quoteDraft=blankQuote(); renderView(); }
function qSave(){ readQuoteForm(); const a=me(); const list=loadQuotes(a);
  if(!quoteDraft.id){ quoteDraft.id="q"+Date.now(); list.unshift(JSON.parse(JSON.stringify(quoteDraft))); }
  else { const i=list.findIndex(x=>x.id===quoteDraft.id); if(i>=0) list[i]=JSON.parse(JSON.stringify(quoteDraft)); else list.unshift(JSON.parse(JSON.stringify(quoteDraft))); }
  saveQuotes(a,list); renderView(); alert("Cotización guardada.");
}
function qLoad(id){ const q=loadQuotes(me()).find(x=>x.id===id); if(q){ quoteDraft=JSON.parse(JSON.stringify(q)); renderView(); } }
function qDeleteSaved(id){ if(!confirm("¿Eliminar esta cotización?"))return; const a=me(); saveQuotes(a,loadQuotes(a).filter(x=>x.id!==id)); renderView(); }
function qExport(){
  readQuoteForm(); const a=me(), t=quoteTotals(), cur=quoteDraft.currency;
  document.getElementById("printArea").innerHTML=`
    <div class="p-head"><div class="brand"><span class="mark"><svg viewBox="0 0 100 100" fill="none"><path d="M50 7 89 91H72L61 66H39L28 91H11L50 7Z" stroke="#111" stroke-width="6.5" stroke-linejoin="round"/><circle cx="50" cy="49" r="5.5" fill="#111"/></svg></span>ANIMA · ${esc(a.name)}</div><small>Cotización · ${esc(quoteDraft.date)}</small></div>
    <h1 class="p-name">${esc(quoteDraft.title)}</h1>
    <div class="p-sub">${esc(quoteDraft.discipline||a.role||"")} · Cliente: ${esc(quoteDraft.client||"—")}</div>
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
function vComunidad(a){
  const list=roster(); const clan=SEED_CLANS.find(c=>c.name===a.clan);
  const members=a.clan?list.filter(m=>m.clan===a.clan):[];
  const clanCard = a.clan ? `<div class="card s12"><div class="section-title"><h2>${clan?clan.emoji:"🖤"} ${esc(a.clan)}</h2><div class="spacer"></div><span class="pill">Clan · Nivel 2</span></div>
      <p class="muted">${clan?clan.desc:"Comunidad privada por invitación (2 a 8 Almas)."}</p>
      <div class="alma-grid" style="margin-top:14px">${members.map(almaMini).join("")}</div></div>`
    : `<div class="card s12"><div class="section-title"><h2>Sin Clan aún</h2></div><p class="muted">Un Clan es una comunidad privada por invitación (2 a 8 Almas).</p></div>`;
  return `<div class="grid">${clanCard}
    <div class="card s12"><div class="section-title"><h2>Constelación de Almas</h2><div class="spacer"></div>
      <span class="pill ${liveMode()?'gold':''}">${liveMode()?'🜂 En vivo · '+list.length+' Almas':'Founding · '+list.length+' Almas'}</span></div>
      <div class="alma-grid">${list.map(almaMini).join("")}</div></div></div>`;
}
function almaMini(m){
  const lv=levelByKey(m.level); const act=(liveMode()&&!m.live)?`data-pub="${m.id}"`:`data-alma="${m.id}"`;
  return `<div class="card alma-card" ${act}>${avatarHTML(m,"lg")}
    <b style="display:block;letter-spacing:-.02em">${esc(m.name)}</b><small class="muted">${esc(m.role||"")}</small><br>
    <span class="level-badge" style="margin-top:8px;border-color:${lv.color}55;color:${lv.color};font-size:11px">${lv.emoji} ${m.level}</span>
    <div class="muted" style="font-size:11px;margin-top:6px">${esc(m.country||"")}</div></div>`;
}

/* --- Santuario --- */
function vSantuario(a){
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
    <div class="card s7"><div class="section-title"><h2>Finanzas generales</h2><div class="spacer"></div><span class="pill">${live?'Privadas':'Agregado'}</span></div>
      ${live?`<p class="muted" style="font-size:13px">🔒 En el sistema vivo las finanzas de cada Alma son <b>privadas</b>. Estos números corresponden sólo a tu Alma.</p>`:``}
      <div class="grid" style="gap:14px;margin-top:${live?'10px':'0'}">
        <div class="s4"><div class="stat"><span class="num" style="color:var(--ok);font-size:22px">${money(totalInc)}</span><span class="lbl">Ingresos</span></div></div>
        <div class="s4"><div class="stat"><span class="num" style="color:var(--danger);font-size:22px">${money(totalExp)}</span><span class="lbl">Egresos</span></div></div>
        <div class="s4"><div class="stat"><span class="num" style="font-size:22px">${money(totalInc-totalExp)}</span><span class="lbl">Neto</span></div></div></div></div>
    <div class="card s5"><div class="section-title"><h2>Distribución por nivel</h2></div>
      ${dist.map(d=>`<div class="row"><span style="font-size:18px">${d.l.emoji}</span><div class="grow"><b>${d.l.key}</b></div><span class="chip">${d.n}</span></div>`).join("")}</div>
    <div class="card s12"><div class="section-title"><h2>Almas destacadas (XP)</h2></div>
      ${top.map((m,i)=>`<div class="row"><b style="color:var(--gold);width:24px">${i+1}</b>${avatarHTML(m,"sm")}<div class="grow"><b>${esc(m.name)}</b><br><small>${esc(m.role||"")}</small></div><span class="chip">${m.xp.toLocaleString("es-CL")} XP</span></div>`).join("")}</div>
  </div>`;
}

/* ===========================================================
   EDITOR UNIVERSAL DE REGISTROS (crear / editar / eliminar)
   =========================================================== */
const EDITORS = {
  proyecto:{ title:"Proyecto", table:"projects", get:a=>a.projects, push:"unshift", xp:60,
    fields:[{k:"t",l:"Nombre"},{k:"client",l:"Cliente"},{k:"st",l:"Estado",sel:["Planificado","En curso","Terminado"]},{k:"pct",l:"Avance %",num:true}],
    toRow:v=>({title:v.t,client:v.client,status:v.st,pct:+v.pct||0}) },
  memoria:{ title:"Memoria", table:"memories", get:a=>a.memories, push:"unshift", xp:40,
    fields:[{k:"t",l:"Título"},{k:"d",l:"Descripción",ta:true}], toRow:v=>({title:v.t,detail:v.d}) },
  ingreso:{ title:"Ingreso", table:"finance_entries", get:a=>a.finance.income, push:"unshift", xp:20,
    fields:[{k:"t",l:"Concepto"},{k:"a",l:"Monto",num:true},{k:"d",l:"Periodo (AAAA-MM)"}],
    toRow:v=>({title:v.t,amount:+v.a||0,period:v.d,kind:"income"}) },
  egreso:{ title:"Egreso", table:"finance_entries", get:a=>a.finance.expense, push:"unshift", xp:0,
    fields:[{k:"t",l:"Concepto"},{k:"a",l:"Monto",num:true},{k:"d",l:"Periodo (AAAA-MM)"}],
    toRow:v=>({title:v.t,amount:+v.a||0,period:v.d,kind:"expense"}) },
  hito:{ title:"Hito", table:"trajectory", get:a=>a.trajectory, push:"push", xp:50,
    fields:[{k:"y",l:"Año"},{k:"t",l:"Título"},{k:"d",l:"Descripción",ta:true}], toRow:v=>({year:v.y,title:v.t,detail:v.d}) },
  obra:{ title:"Obra", table:"portfolio", get:a=>a.portfolio, push:"push", xp:40,
    fields:[{k:"t",l:"Título"},{k:"k",l:"Tipo / técnica"},{k:"c",l:"Color",color:true}], toRow:v=>({title:v.t,kind:v.k,color:v.c}) },
  cita:{ title:"Cita", table:"agenda", get:a=>a.agenda, push:"push", xp:0,
    fields:[{k:"h",l:"Hora (ej: 15:00)"},{k:"t",l:"Actividad"}], toRow:v=>({at_time:v.h,title:v.t}) },
  doc:{ title:"Documento", table:"library", get:a=>a.library, push:"push", xp:0,
    fields:[{k:"t",l:"Nombre"},{k:"k",l:"Tipo (Contrato, Brief…)"}], toRow:v=>({title:v.t,kind:v.k}) }
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
  try{
    if(idx==null){
      const item={...v};
      if(a.live){ const row=await Cloud.insertRow(cfg.table, {...cfg.toRow(v), alma_id:a.almaId}); item._id=row.id; }
      arr[cfg.push==="push"?"push":"unshift"](item);
      if(cfg.xp){ a.xp=(a.xp||0)+cfg.xp; if(a.live){ try{await Cloud.setXP(a.almaId,a.xp);}catch(e){} } await syncLevel(a); }
    }else{
      const item=arr[idx]; Object.assign(item,v);
      if(a.live && item._id){ await Cloud.updateRow(cfg.table,item._id,cfg.toRow(v)); }
    }
    save(); closeRecord(); renderAll();
  }catch(e){ document.getElementById("recMsg").textContent="No se pudo guardar: "+(e.message||e); }
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
  if(cur!==a.level){ a.level=cur; if(a.live){ try{await Cloud.updateAlma(a.almaId,{level:cur});}catch(e){} } save(); setTimeout(()=>alert("✦ Tu Alma evolucionó a nivel "+cur),60); }
}

/* ===========================================================
   EXPORTAR PDF — Dossier del Alma
   =========================================================== */
function exportPDF(){
  const a=me(), lv=levelByKey(a.level), inc=sum(a.finance.income), exp=sum(a.finance.expense);
  document.getElementById("printArea").innerHTML=`
    <div class="p-head"><div class="brand"><span class="mark"><svg viewBox="0 0 100 100" fill="none"><path d="M50 7 89 91H72L61 66H39L28 91H11L50 7Z" stroke="#111" stroke-width="6.5" stroke-linejoin="round"/><circle cx="50" cy="49" r="5.5" fill="#111"/></svg></span>ANIMA TSC</div><small>Dossier de Alma · ${new Date().toLocaleDateString("es-CL")}</small></div>
    <h1 class="p-name">${esc(a.name)}</h1>
    <div class="p-sub">${lv.emoji} ${a.level} · ${lv.name} · ${a.xp.toLocaleString("es-CL")} XP — ${esc(a.role||"")} · ${esc(a.country||"")}</div>
    <p>${esc(a.bio||"")}</p>
    <div class="p-tags">${(a.tags||[]).map(t=>`<span>${esc(t)}</span>`).join("")}</div>
    <h2>Trayectoria</h2>${a.trajectory.map(n=>`<p><b>${esc(n.y)} · ${esc(n.t)}</b> — ${esc(n.d)}</p>`).join("")||"<p>—</p>"}
    <h2>Proyectos</h2>${a.projects.map(p=>`<p><b>${esc(p.t)}</b> (${esc(p.st)}, ${p.pct}%) — ${esc(p.client)}</p>`).join("")||"<p>—</p>"}
    <h2>Portafolio</h2><p>${a.portfolio.map(p=>esc(p.t)+" ("+esc(p.k)+")").join(" · ")||"—"}</p>
    <h2>Finanzas</h2><p>Ingresos: ${money(inc)} · Egresos: ${money(exp)} · <b>Ganancia: ${money(inc-exp)}</b></p>
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
  const intro=`<div class="msg lum"><b>LUMBRE</b><br>Soy el motor de ANIMA para <b>${esc(a.name)}</b>. Modo: <b>${modeName()}</b>. Pregúntame por finanzas, proyectos, trayectoria o pídeme sugerencias.</div>`;
  body.innerHTML=intro+state.chat.map(m=>`<div class="msg ${m.role==='you'?'you':'lum'}">${m.role==='lum'?'<b>LUMBRE</b><br>':''}${m.text}</div>`).join("");
  body.scrollTop=body.scrollHeight;
}
const modeName=()=>(LUMBRE_MODES.find(m=>m.key===state.lumbreMode)||{}).name;
function lumbreAsk(q){ state.chat.push({role:"you",text:esc(q)}); state.chat.push({role:"lum",text:lumbreThink(q)}); save(); renderLumbre(); }
function lumbreThink(q){
  const a=me(), t=q.toLowerCase();
  if(state.lumbreMode==="OFF") return "Estoy en modo <b>OFF</b>: solo organización manual. Actívame en Básico, IA Local o IA Conectada.";
  const inc=sum(a.finance.income), exp=sum(a.finance.expense), ai=(state.lumbreMode==="LOCAL"||state.lumbreMode==="CLOUD");
  if(/finanz|ingreso|egreso|ganan|plata|dinero|gast/.test(t)){ const m=exp>inc*0.7?" Tus egresos son altos respecto a tus ingresos.":" Tu margen está sano."; return `Finanzas: ingresos ${money(inc)}, egresos ${money(exp)}, <b>ganancia ${money(inc-exp)}</b>.${ai?m:""}`; }
  if(/cotiz|presupuesto|precio/.test(t)) return `Abre el <b>Cotizador</b> para armar un presupuesto profesional y exportarlo en PDF. ${ai?"Puedo sugerir precios según tus proyectos anteriores.":""}`;
  if(/proyect|trabajo|encargo/.test(t)){ const act=a.projects.filter(p=>p.st==="En curso"); const s=ai&&act[0]?` Enfócate en "${esc(act[0].t)}" (${act[0].pct}%).`:""; return `Tienes ${act.length} proyecto(s) en curso de ${a.projects.length}.${s}`; }
  if(/trayectoria|historia|hito/.test(t)){ const l=a.trajectory[a.trajectory.length-1]; return l?`Tu último hito: <b>${esc(l.t)}</b> (${esc(l.y)}).`:"Aún no tienes hitos. Agrega el primero en Trayectoria."; }
  if(/portafolio|obra/.test(t)) return `Tu portafolio tiene ${a.portfolio.length} obras.`;
  if(/nivel|xp|sube|progreso/.test(t)){ const lp=levelProgress(a.xp); return lp.next?`Estás en <b>${a.level}</b> con ${a.xp.toLocaleString("es-CL")} XP. Te faltan ${(lp.next.xp-a.xp).toLocaleString("es-CL")} para <b>${lp.next.key}</b>.`:`Eres <b>ANIMA</b>. Nivel máximo. ∞`; }
  if(/resumen|reporte/.test(t)) return `Resumen: ${a.projects.filter(p=>p.st==="En curso").length} proyectos activos · ganancia ${money(inc-exp)} · nivel ${a.level} · ${a.memories.length} memorias.`;
  if(/hola|hey|buenas/.test(t)) return `Hola, ${esc(a.name.split(" ")[0])}. ¿Reviso tus finanzas, proyectos o tu siguiente nivel?`;
  return ai?`Puedo ayudarte con finanzas, cotizaciones, proyectos, trayectoria, niveles y reportes.`:"En modo Básico organizo finanzas, proyectos, documentos y portafolio.";
}

/* ===========================================================
   AUTH (Supabase)
   =========================================================== */
async function refreshAuth(){
  if(!Cloud.enabled){ updateAuthUI(null); return; }
  try{ state.cloudAlmas=await Cloud.allAlmas(); }catch(e){}
  const s=await Cloud.session();
  if(s){ const pend=localStorage.getItem("anima_pending_invite"); if(pend){ try{await Cloud.redeemInvite(pend);}catch(e){} localStorage.removeItem("anima_pending_invite"); }
    await loadMyAlma(); updateAuthUI(s);
  }else{ if(state.almas.some(x=>x.live)){ state.almas=JSON.parse(JSON.stringify(SEED_ALMAS)); state.currentId="sark"; } updateAuthUI(null); renderAll(); }
}
async function loadMyAlma(){
  const row=await Cloud.myAlma(); if(!row) return;
  const mods=await Cloud.loadModules(row.id); const a=dbAlmaToState(row,mods);
  state.almas=[a];   // tu Alma viva, limpia (las de muestra no se mezclan)
  state.currentId=a.id; state.view="mialma"; state.chat=[]; renderAll();
}
function updateAuthUI(session){
  const btn=document.getElementById("authBtn"); if(!btn) return;
  if(session){ const a=state.almas.find(x=>x.live); btn.textContent=a?("● "+a.name.split(" ")[0]):"● Mi cuenta"; btn.dataset.in="1"; }
  else { btn.textContent=Cloud.enabled?"Entrar":"Modo local"; btn.dataset.in=""; }
}
function openAuth(){ if(!Cloud.enabled){ alert("Conexión a la nube no disponible. ANIMA funciona en modo Fundadores local."); return; }
  document.getElementById("authModal").classList.add("open"); document.getElementById("authMsg").textContent=""; }
function closeAuth(){ document.getElementById("authModal").classList.remove("open"); }
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
async function logout(){ if(!confirm("¿Salir de tu Alma?"))return; await Cloud.signOut();
  state.almas=JSON.parse(JSON.stringify(SEED_ALMAS)); state.currentId="sark"; state.view="mialma"; save(); renderAll(); updateAuthUI(null); }

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

/* --- Perfil público --- */
async function openPublic(id){
  const row=(state.cloudAlmas||[]).find(x=>x.id===id); if(!row) return;
  const lv=levelByKey(row.level); document.getElementById("publicModal").classList.add("open");
  document.getElementById("pubBody").innerHTML=`<div style="text-align:center">
      <span class="avatar lg" style="margin:0 auto 10px;background:linear-gradient(145deg,${row.color},${shade(row.color,-22)})">${initials(row.name)}</span>
      <h2 style="margin:0;letter-spacing:-.04em">${esc(row.name)}</h2><div class="muted">${esc(row.role||"")} · ${esc(row.country||"")}</div>
      <span class="level-badge" style="margin-top:8px;border-color:${lv.color}55;color:${lv.color}">${lv.emoji} ${row.level}</span></div>
    <p style="margin-top:14px">${esc(row.bio||"")}</p><div>${(row.tags||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}</div>
    <div id="pubExtra" class="muted" style="font-size:12.5px;margin-top:12px">Cargando trayectoria…</div>`;
  try{ const m=await Cloud.loadModules(id);
    const tj=(m.trajectory||[]).map(x=>`<div class="node"><div class="yr">${esc(x.year)}</div><b>${esc(x.title)}</b><p class="muted" style="margin:2px 0 0">${esc(x.detail||"")}</p></div>`).join("");
    const pf=(m.portfolio||[]).map(x=>`<span class="chip">${esc(x.title)} · ${esc(x.kind)}</span>`).join("");
    document.getElementById("pubExtra").innerHTML=(tj?`<h3 style="font-size:15px;margin:8px 0 4px">Trayectoria</h3><div class="tl">${tj}</div>`:"")+(pf?`<h3 style="font-size:15px;margin:14px 0 6px">Portafolio</h3><div>${pf}</div>`:"")||"Sin trayectoria pública aún.";
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
function go(view){ state.view=view; save(); renderAll(); document.getElementById("view").scrollTop=0; closeSide(); }
function switchAlma(id){ state.currentId=id; state.view="mialma"; state.chat=[]; save(); renderAll(); renderLumbre(); }
const drawer=()=>document.getElementById("drawer"), dbg=()=>document.getElementById("drawerBg");
function openLumbre(){ drawer().classList.add("open"); dbg().classList.add("open"); renderLumbre(); }
function closeLumbre(){ drawer().classList.remove("open"); dbg().classList.remove("open"); }
function closeSide(){ document.getElementById("side").classList.remove("open"); }

document.addEventListener("click", e=>{
  const ed=e.target.closest("[data-edit]"); if(ed){ const [k,i]=ed.dataset.edit.split(":"); openRecord(k,+i); return; }
  const dl=e.target.closest("[data-del]"); if(dl){ const [k,i]=dl.dataset.del.split(":"); deleteRecord(k,+i); return; }
  const st=e.target.closest("[data-star]"); if(st){ _fbRating=+st.dataset.star; renderStars(); return; }
  const cf=e.target.closest("[data-cfg]"); if(cf){ toggleCfg(cf.dataset.cfg); return; }
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
  if(e.target.closest("#q_save")) qSave();
  if(e.target.closest("#q_export")) qExport();
  if(e.target.closest("#editBtn")||e.target.closest("#createAlmaBtn")) openEdit();
  if(e.target.closest("#edSave")) saveEdit();
  if(e.target.closest("#edClose")||e.target.id==="editModal") closeEdit();
  if(e.target.closest("#recSave")) saveRecord();
  if(e.target.closest("#recDel")){ if(recordCtx) deleteRecord(recordCtx.kind,recordCtx.idx); }
  if(e.target.closest("#recClose")||e.target.id==="recordModal") closeRecord();
  if(e.target.closest("#pubClose")||e.target.id==="publicModal") closePublic();
  if(e.target.closest("#feedbackBtn")) openFeedback();
  if(e.target.closest("#fbSend")) sendFeedback();
  if(e.target.closest("#fbClose")||e.target.id==="feedbackModal") closeFeedback();
  if(e.target.closest("#lumbreOpen")) openLumbre();
  if(e.target.closest("#lumbreClose")||e.target.id==="drawerBg") closeLumbre();
  if(e.target.closest("#menuBtn")) document.getElementById("side").classList.toggle("open");
  if(e.target.closest("#whoBox")) go("mialma");
  if(e.target.closest("#resetBtn")) reset();
  if(e.target.closest("[data-export]")) exportPDF();
  if(e.target.closest("#authBtn")){ const b=e.target.closest("#authBtn"); b.dataset.in?logout():openAuth(); }
  if(e.target.closest("#authClose")||e.target.id==="authModal") closeAuth();
  if(e.target.closest("#authSignIn")) doAuth("in");
  if(e.target.closest("#authSignUp")) doAuth("up");
  if(e.target.closest("#lumbreSend")) sendLumbre();
});
document.addEventListener("keydown", e=>{ if(e.key==="Enter" && e.target.id==="lumbreInput") sendLumbre(); });
function sendLumbre(){ const i=document.getElementById("lumbreInput"), v=i.value.trim(); if(!v)return; i.value=""; lumbreAsk(v); }

/* ---------- Boot ---------- */
renderAll();
refreshAuth();
