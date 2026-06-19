/* ===========================================================
   ANIMA Studio — App logic (Alpha · Founding Era)
   Sistema vivo: Almas, niveles, módulos y LUMBRE.
   100% local: nada se envía a servidores externos por defecto.
   =========================================================== */

const STORAGE = "anima_alpha_state_v1";

/* ---------- Estado ---------- */
let state = load();

function load(){
  try{
    const s = JSON.parse(localStorage.getItem(STORAGE));
    if(s && s.almas && s.almas.length) return s;
  }catch(e){}
  return {
    almas: JSON.parse(JSON.stringify(SEED_ALMAS)),
    currentId: "sark",
    view: "mialma",
    lumbreMode: "LOCAL",
    chat: []
  };
}
function save(){ localStorage.setItem(STORAGE, JSON.stringify(state)); }
function reset(){ if(confirm("¿Restaurar ANIMA a las 10 Almas fundadoras? Se borrarán tus cambios locales.")){ localStorage.removeItem(STORAGE); location.reload(); } }

const me = () => state.almas.find(a => a.id === state.currentId) || state.almas[0];
const sum = arr => arr.reduce((t,x)=>t+x.a,0);

/* ---------- Avatar (iniciales) ---------- */
function initials(name){ return name.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase(); }
function avatarHTML(a, cls=""){
  return `<span class="avatar ${cls}" style="background:linear-gradient(145deg,${a.color},${shade(a.color,-22)})">${initials(a.name)}</span>`;
}
function shade(hex,p){
  const n=parseInt(hex.slice(1),16);let r=(n>>16)+p,g=(n>>8&255)+p,b=(n&255)+p;
  r=Math.max(0,Math.min(255,r));g=Math.max(0,Math.min(255,g));b=Math.max(0,Math.min(255,b));
  return "#"+(0x1000000+(r<<16)+(g<<8)+b).toString(16).slice(1);
}

/* ---------- Navegación ---------- */
const NAV = [
  {sec:"Mi Alma"},
  {v:"mialma",     ico:"◆", t:"Mi Alma"},
  {v:"trayectoria",ico:"⤴", t:"Trayectoria"},
  {v:"portafolio", ico:"▦", t:"Portafolio"},
  {v:"proyectos",  ico:"◷", t:"Proyectos"},
  {v:"finanzas",   ico:"$", t:"Finanzas"},
  {v:"agenda",     ico:"☰", t:"Agenda"},
  {sec:"Memoria"},
  {v:"memoria",    ico:"✦", t:"Memorias"},
  {v:"biblioteca", ico:"❏", t:"Biblioteca"},
  {sec:"Mundo"},
  {v:"comunidad",  ico:"❂", t:"Comunidad"}
];

function renderNav(){
  const el = document.getElementById("nav");
  el.innerHTML = NAV.map(n=>{
    if(n.sec) return `<div class="nav-label">${n.sec}</div>`;
    return `<div class="nav-item ${state.view===n.v?'active':''}" data-view="${n.v}">
      <span class="ico">${n.ico}</span>${n.t}</div>`;
  }).join("");
}

/* ---------- Switcher de Alma (sidebar) ---------- */
function renderWho(){
  const a = me(); const lp = levelProgress(a.xp); const lv = levelByKey(a.level);
  document.getElementById("who").innerHTML = `
    ${avatarHTML(a)}
    <div class="meta">
      <b>${a.name}</b>
      <small>${lv.emoji} ${a.level} · ${a.city}</small>
    </div>`;
}

/* ---------- Topbar ---------- */
const TITLES = {
  mialma:["Mi Alma","Tu espacio privado: identidad, nivel y pulso de hoy."],
  trayectoria:["Trayectoria","La historia de tu Alma, hito a hito."],
  portafolio:["Portafolio","Las obras que te representan."],
  proyectos:["Proyectos","Lo que está vivo ahora mismo."],
  finanzas:["Finanzas","Ingresos, egresos y ganancia — privado."],
  agenda:["Agenda","Tu día, ordenado."],
  memoria:["Memorias","Ideas, frases y referencias que no quieres perder."],
  biblioteca:["Biblioteca","Tus documentos y archivos."],
  comunidad:["Comunidad","Tu Clan y la constelación de Almas."]
};
function renderTop(){
  const [t,s] = TITLES[state.view] || ["ANIMA",""];
  document.getElementById("topTitle").innerHTML = `<h1>${t}</h1><div class="sub">${s}</div>`;
}

/* ===========================================================
   VISTAS
   =========================================================== */
function renderView(){
  const a = me();
  const fn = {
    mialma:vMiAlma, trayectoria:vTrayectoria, portafolio:vPortafolio,
    proyectos:vProyectos, finanzas:vFinanzas, agenda:vAgenda,
    memoria:vMemoria, biblioteca:vBiblioteca, comunidad:vComunidad
  }[state.view] || vMiAlma;
  document.getElementById("view").innerHTML = fn(a);
}

/* --- Mi Alma (dashboard) --- */
function vMiAlma(a){
  const lp = levelProgress(a.xp); const lv = levelByKey(a.level);
  const inc = sum(a.finance.income), exp = sum(a.finance.expense);
  const active = a.projects.filter(p=>p.st==="En curso").length;
  return `
  <div class="grid">
    <div class="card s8">
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        ${avatarHTML(a,"lg")}
        <div style="flex:1;min-width:200px">
          <span class="level-badge" style="border-color:${lv.color}55;color:${lv.color}">${lv.emoji} ${a.level} · ${lv.name}</span>
          <h2 style="font-size:30px;letter-spacing:-.05em;margin:10px 0 2px">${a.name}</h2>
          <div class="muted">${a.role} · ${a.country}</div>
        </div>
      </div>
      <p style="margin:16px 0 0">${a.bio}</p>
      <div style="margin-top:14px">${a.tags.map(t=>`<span class="chip">${t}</span>`).join("")}</div>
    </div>

    <div class="card s4">
      <span class="pill gold">Camino del creador</span>
      <div class="kpi">${a.xp.toLocaleString("es-CL")} XP</div>
      <div class="bar"><span style="width:${lp.pct}%"></span></div>
      <div class="muted" style="font-size:12.5px;margin-top:8px">
        ${lp.next ? `${lp.pct}% hacia <b>${lp.next.key}</b> · ${lp.next.name}` : "Nivel máximo: Alma Despierta ∞"}
      </div>
      <p class="muted" style="font-size:12.5px;margin-top:12px">${lv.desc}</p>
    </div>

    <div class="card s3"><div class="stat"><span class="num">${active}</span><span class="lbl">Proyectos en curso</span></div></div>
    <div class="card s3"><div class="stat"><span class="num" style="color:var(--ok)">${money(inc)}</span><span class="lbl">Ingresos</span></div></div>
    <div class="card s3"><div class="stat"><span class="num">${money(inc-exp)}</span><span class="lbl">Ganancia</span></div></div>
    <div class="card s3"><div class="stat"><span class="num">${a.clan||"—"}</span><span class="lbl">${a.clan?"Tu Clan":"Sin Clan aún"}</span></div></div>

    <div class="card s12">
      <div class="section-title"><h2>Tu camino</h2><div class="spacer"></div><span class="muted" style="font-size:12.5px">FOUNDING → ANIMA</span></div>
      <div class="path">
        ${LEVELS.map((l,i)=>`<div class="lv ${i===lp.idx?'cur':''} ${i<lp.idx?'passed':''}">
          <div class="e">${l.emoji}</div><b>${l.key}</b><small>${l.name}</small></div>`).join("")}
      </div>
    </div>

    <div class="card s6">
      <div class="section-title"><h2>Hoy</h2></div>
      ${a.agenda.map(x=>`<div class="row"><b style="color:var(--gold)">${x.h}</b><div class="grow">${x.t}</div></div>`).join("") || `<p class="muted">Sin agenda hoy.</p>`}
    </div>
    <div class="card s6">
      <div class="section-title"><h2>Última memoria</h2></div>
      ${a.memories[0] ? `<b>${a.memories[0].t}</b><p class="muted" style="margin:6px 0 0">${a.memories[0].d}</p>` : `<p class="muted">Aún no hay memorias.</p>`}
      <div style="margin-top:16px"><span class="btn ghost sm" data-go="memoria">Ver memorias →</span></div>
    </div>
  </div>`;
}

/* --- Trayectoria --- */
function vTrayectoria(a){
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Trayectoria de ${a.name}</h2></div>
    <div class="tl">
      ${a.trajectory.map(n=>`<div class="node"><div class="yr">${n.y}</div><b>${n.t}</b><p class="muted" style="margin:4px 0 0">${n.d}</p></div>`).join("")}
    </div>
    <p class="muted" style="margin-top:18px;font-size:12.5px">LUMBRE puede construir tu trayectoria automáticamente leyendo tus PDFs, contratos y proyectos.</p>
  </div></div>`;
}

/* --- Portafolio --- */
function vPortafolio(a){
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Portafolio</h2><div class="spacer"></div><span class="muted" style="font-size:12.5px">${a.portfolio.length} obras</span></div>
    <div class="thumbs">
      ${a.portfolio.map(p=>`<div class="thumb">
        <div class="ph" style="background:linear-gradient(145deg,${p.c},${shade(p.c,-25)})">${initials(p.t)}</div>
        <div class="cap"><b>${p.t}</b><small>${p.k}</small></div></div>`).join("")}
    </div>
  </div></div>`;
}

/* --- Proyectos --- */
function vProyectos(a){
  return `<div class="grid">
    <div class="card s12">
      <div class="section-title"><h2>Proyectos</h2><div class="spacer"></div><span class="btn sm" data-add="proyecto">+ Nuevo proyecto</span></div>
      ${a.projects.map(p=>{
        const cls = p.st==="En curso"?"ok":(p.st==="Planificado"?"warn":"");
        return `<div class="row">
          <div class="grow"><b>${p.t}</b><br><small>${p.client}</small></div>
          <div style="width:180px"><div class="bar"><span style="width:${p.pct}%"></span></div><small class="muted">${p.pct}%</small></div>
          <span class="pill ${cls}">${p.st}</span>
        </div>`;
      }).join("") || `<p class="muted">Aún no hay proyectos. Crea el primero.</p>`}
    </div>
  </div>`;
}

/* --- Finanzas --- */
function vFinanzas(a){
  const inc=sum(a.finance.income), exp=sum(a.finance.expense);
  return `<div class="grid">
    <div class="card s4"><div class="stat"><span class="num" style="color:var(--ok)">${money(inc)}</span><span class="lbl">Ingresos totales</span></div></div>
    <div class="card s4"><div class="stat"><span class="num" style="color:var(--danger)">${money(exp)}</span><span class="lbl">Egresos totales</span></div></div>
    <div class="card s4"><div class="stat"><span class="num">${money(inc-exp)}</span><span class="lbl">Ganancia neta</span></div></div>

    <div class="card s6">
      <div class="section-title"><h2>Ingresos</h2><div class="spacer"></div><span class="btn sm" data-add="ingreso">+ Ingreso</span></div>
      ${a.finance.income.map(x=>`<div class="row"><div class="grow"><b>${x.t}</b><br><small>${x.d}</small></div><span class="amt in">+${money(x.a)}</span></div>`).join("")}
    </div>
    <div class="card s6">
      <div class="section-title"><h2>Egresos</h2><div class="spacer"></div><span class="btn sm secondary" data-add="egreso">+ Egreso</span></div>
      ${a.finance.expense.map(x=>`<div class="row"><div class="grow"><b>${x.t}</b><br><small>${x.d}</small></div><span class="amt out">−${money(x.a)}</span></div>`).join("")}
    </div>
    <div class="card s12 muted" style="font-size:12.5px">🔒 Tus finanzas son privadas. Mi Alma ≠ Mi Clan. Nada se comparte automáticamente.</div>
  </div>`;
}

/* --- Agenda --- */
function vAgenda(a){
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Agenda de hoy</h2></div>
    ${a.agenda.map(x=>`<div class="row"><b style="color:var(--gold);width:70px">${x.h}</b><div class="grow">${x.t}</div></div>`).join("") || `<p class="muted">Día libre.</p>`}
  </div></div>`;
}

/* --- Memoria --- */
function vMemoria(a){
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Memorias</h2><div class="spacer"></div><span class="btn sm" data-add="memoria">+ Nueva memoria</span></div>
    ${a.memories.map(m=>`<div class="row"><span style="color:var(--gold);font-size:18px">✦</span><div class="grow"><b>${m.t}</b><br><small>${m.d}</small></div></div>`).join("") || `<p class="muted">Aún no guardas memorias.</p>`}
  </div></div>`;
}

/* --- Biblioteca --- */
function vBiblioteca(a){
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Biblioteca</h2><div class="spacer"></div><span class="muted" style="font-size:12.5px">${a.library.length} documentos</span></div>
    ${a.library.map(d=>`<div class="row"><span style="font-size:18px">❏</span><div class="grow"><b>${d.t}</b></div><span class="chip">${d.k}</span></div>`).join("")}
    <p class="muted" style="margin-top:16px;font-size:12.5px">LUMBRE en modo IA Local puede leer estos PDFs, extraer información y ordenar tu memoria sin enviar nada a internet.</p>
  </div></div>`;
}

/* --- Comunidad (Clan + Constelación) --- */
function vComunidad(a){
  const clan = SEED_CLANS.find(c=>c.id && a.clan===c.name);
  const clanCard = a.clan ? `
    <div class="card s12">
      <div class="section-title"><h2>${clan?clan.emoji:"🖤"} ${a.clan}</h2><div class="spacer"></div><span class="pill">Clan · Nivel 2</span></div>
      <p class="muted">${clan?clan.desc:"Comunidad privada por invitación (2 a 8 Almas)."}</p>
      <div class="alma-grid" style="margin-top:14px">
        ${(clan?clan.members:[]).map(id=>{const m=state.almas.find(x=>x.id===id);return m?almaMini(m):"";}).join("")}
      </div>
    </div>` : `
    <div class="card s12"><div class="section-title"><h2>Sin Clan aún</h2></div>
      <p class="muted">Un Clan es una comunidad privada por invitación (2 a 8 Almas). Un Alma no entra automáticamente: debe ser invitada.</p></div>`;
  return `<div class="grid">
    ${clanCard}
    <div class="card s12">
      <div class="section-title"><h2>Constelación de Almas</h2><div class="spacer"></div><span class="pill gold">Founding · 10 Almas</span></div>
      <div class="alma-grid">${state.almas.map(almaMini).join("")}</div>
    </div>
  </div>`;
}
function almaMini(m){
  const lv = levelByKey(m.level);
  return `<div class="card alma-card" data-alma="${m.id}">
    ${avatarHTML(m,"lg")}
    <b style="display:block;letter-spacing:-.02em">${m.name}</b>
    <small class="muted">${m.role}</small><br>
    <span class="level-badge" style="margin-top:8px;border-color:${lv.color}55;color:${lv.color};font-size:11px">${lv.emoji} ${m.level}</span>
    <div class="muted" style="font-size:11px;margin-top:6px">${m.country}</div>
  </div>`;
}

/* ===========================================================
   LUMBRE — motor agente local
   =========================================================== */
function renderLumbre(){
  const a = me();
  document.getElementById("lumbreMode").innerHTML = LUMBRE_MODES.map(m=>
    `<div class="mode ${state.lumbreMode===m.key?'on':''}" data-mode="${m.key}"><b>${m.name}</b><small>${m.desc}</small></div>`).join("");
  const body = document.getElementById("lumbreChat");
  const intro = `<div class="msg lum"><b>LUMBRE</b><br>Soy el motor de ANIMA para <b>${a.name}</b>. Modo: <b>${modeName()}</b>. Pregúntame por tus finanzas, proyectos, trayectoria o pídeme sugerencias.</div>`;
  body.innerHTML = intro + state.chat.map(m=>`<div class="msg ${m.role==='you'?'you':'lum'}">${m.role==='lum'?'<b>LUMBRE</b><br>':''}${m.text}</div>`).join("");
  body.scrollTop = body.scrollHeight;
}
const modeName = () => (LUMBRE_MODES.find(m=>m.key===state.lumbreMode)||{}).name;

function lumbreAsk(q){
  state.chat.push({role:"you", text:q});
  state.chat.push({role:"lum", text:lumbreThink(q)});
  save(); renderLumbre();
}
function lumbreThink(q){
  const a = me(); const t = q.toLowerCase();
  if(state.lumbreMode==="OFF") return "Estoy en modo <b>OFF</b>: solo organización manual. Actívame en Básico, IA Local o IA Conectada para que te ayude.";
  const inc=sum(a.finance.income), exp=sum(a.finance.expense);
  const ai = state.lumbreMode==="LOCAL"||state.lumbreMode==="CLOUD";

  if(/finanz|ingreso|egreso|ganan|plata|dinero|gast/.test(t)){
    const m = exp>inc*0.7 ? " Tus egresos son altos respecto a tus ingresos: revisa materiales y arriendo." : " Tu margen está sano.";
    return `Finanzas de ${a.name}: ingresos ${money(inc)}, egresos ${money(exp)}, <b>ganancia ${money(inc-exp)}</b>.${ai?m:""}`;
  }
  if(/proyect|trabajo|encargo/.test(t)){
    const act=a.projects.filter(p=>p.st==="En curso");
    const sug = ai && act[0] ? ` Sugerencia: enfócate en "${act[0].t}" (${act[0].pct}%) — es lo más cerca de cerrar.` : "";
    return `Tienes ${act.length} proyecto(s) en curso de ${a.projects.length} totales.${sug}`;
  }
  if(/trayectoria|historia|hito/.test(t)){
    const last=a.trajectory[a.trajectory.length-1];
    return `Tu último hito: <b>${last.t}</b> (${last.y}). ${ai?"Puedo construir tu trayectoria completa leyendo tus PDFs en la Biblioteca.":""}`;
  }
  if(/portafolio|obra/.test(t)) return `Tu portafolio tiene ${a.portfolio.length} obras. ${ai?"Puedo generar un portafolio PDF listo para clientes.":""}`;
  if(/nivel|xp|sube|progreso/.test(t)){
    const lp=levelProgress(a.xp);
    return lp.next?`Estás en <b>${a.level}</b> con ${a.xp.toLocaleString("es-CL")} XP. Te falta ${(lp.next.xp-a.xp).toLocaleString("es-CL")} XP para <b>${lp.next.key}</b>. Termina proyectos para subir.`:`Eres <b>ANIMA</b>, Alma Despierta. Nivel máximo. ∞`;
  }
  if(/pdf|document|biblioteca|cv|contrato/.test(t)) return ai?`En modo ${modeName()} puedo leer tus PDFs, extraer datos, crear memorias y ordenar tu Biblioteca — sin enviar nada a internet${state.lumbreMode==="CLOUD"?" salvo que lo conectes a un motor externo":""}.`:"Activa IA Local para que lea y ordene tus documentos.";
  if(/resumen|reporte/.test(t)) return `Resumen de ${a.name}: ${a.projects.filter(p=>p.st==="En curso").length} proyectos activos · ganancia ${money(inc-exp)} · nivel ${a.level} · ${a.memories.length} memorias guardadas.`;
  if(/hola|hey|buenas/.test(t)) return `Hola, ${a.name.split(" ")[0]}. ¿Quieres que revise tus finanzas, tus proyectos o tu siguiente nivel?`;
  return ai?`Puedo ayudarte con finanzas, proyectos, trayectoria, portafolio, niveles y reportes. ¿Sobre qué de ${a.name}?`:"En modo Básico organizo finanzas, proyectos, documentos y portafolio. Pregúntame por cualquiera.";
}

/* ===========================================================
   ACCIONES (crear / persistir)
   =========================================================== */
function addEntry(kind){
  const a = me();
  if(kind==="memoria"){
    const t=prompt("Título de la memoria:"); if(!t)return;
    const d=prompt("Descripción:")||"";
    a.memories.unshift({t,d}); a.xp+=40;
  }else if(kind==="ingreso"||kind==="egreso"){
    const t=prompt(`Concepto del ${kind}:`); if(!t)return;
    const a2=parseInt((prompt("Monto (solo números):")||"0").replace(/\D/g,""))||0;
    const d=new Date().toISOString().slice(0,7);
    (kind==="ingreso"?a.finance.income:a.finance.expense).unshift({t,a:a2,d});
  }else if(kind==="proyecto"){
    const t=prompt("Nombre del proyecto:"); if(!t)return;
    const client=prompt("Cliente:")||"—";
    a.projects.unshift({t,st:"Planificado",pct:0,client}); a.xp+=60;
  }
  save(); renderAll();
}

/* ===========================================================
   RENDER + EVENTOS
   =========================================================== */
function renderAll(){ renderNav(); renderWho(); renderTop(); renderView(); }

function go(view){ state.view=view; save(); renderAll(); document.getElementById("view").scrollTop=0; closeSide(); }
function switchAlma(id){ state.currentId=id; state.view="mialma"; state.chat=[]; save(); renderAll(); renderLumbre(); }

/* drawer */
const drawer=()=>document.getElementById("drawer"), dbg=()=>document.getElementById("drawerBg");
function openLumbre(){ drawer().classList.add("open"); dbg().classList.add("open"); renderLumbre(); }
function closeLumbre(){ drawer().classList.remove("open"); dbg().classList.remove("open"); }
/* mobile side */
function closeSide(){ document.getElementById("side").classList.remove("open"); }

document.addEventListener("click", e=>{
  const t=e.target.closest("[data-view],[data-alma],[data-go],[data-add],[data-mode]");
  if(t){
    if(t.dataset.view) go(t.dataset.view);
    else if(t.dataset.go) go(t.dataset.go);
    else if(t.dataset.alma) switchAlma(t.dataset.alma);
    else if(t.dataset.add) addEntry(t.dataset.add);
    else if(t.dataset.mode){ state.lumbreMode=t.dataset.mode; save(); renderLumbre(); }
    return;
  }
  if(e.target.closest("#lumbreOpen")) openLumbre();
  if(e.target.closest("#lumbreClose")||e.target.id==="drawerBg") closeLumbre();
  if(e.target.closest("#menuBtn")) document.getElementById("side").classList.toggle("open");
  if(e.target.closest("#whoBox")) go("comunidad");
  if(e.target.closest("#resetBtn")) reset();
  if(e.target.closest("#lumbreSend")) sendLumbre();
});
document.addEventListener("keydown", e=>{ if(e.key==="Enter" && e.target.id==="lumbreInput") sendLumbre(); });
function sendLumbre(){
  const i=document.getElementById("lumbreInput"); const v=i.value.trim(); if(!v)return; i.value=""; lumbreAsk(v);
}

/* ---------- Boot ---------- */
renderAll();
