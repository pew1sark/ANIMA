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
  {v:"comunidad",  ico:"❂", t:"Comunidad"},
  {v:"santuario",  ico:"🜁", t:"Santuario"}
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
  comunidad:["Comunidad","Tu Clan y la constelación de Almas."],
  santuario:["Santuario","Nivel 3: la organización completa de ANIMA."]
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
    memoria:vMemoria, biblioteca:vBiblioteca, comunidad:vComunidad,
    santuario:vSantuario
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
      <div style="margin-top:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        ${a.tags.map(t=>`<span class="chip">${t}</span>`).join("")}
        <span style="flex:1"></span>
        ${a.live?`<span class="btn ghost sm" id="editBtn">✎ Editar Alma</span>`:``}
        <span class="btn ghost sm" data-export>⤓ Exportar PDF</span>
      </div>
    </div>
    ${a.live && a.memories.length===0 && a.projects.length===0 ? `
    <div class="card s12" style="background:linear-gradient(145deg,rgba(208,170,99,.14),rgba(255,255,255,.7))">
      <span class="pill gold">Bienvenida, Alma nueva</span>
      <p style="margin:8px 0 0">Tu Alma acaba de nacer en <b>EMBER</b>. Empieza a darle vida: edita tu perfil, agrega tu primer proyecto, una memoria o un hito de tu trayectoria. Cada acción te da XP y te acerca al siguiente nivel.</p>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <span class="btn sm" id="editBtn">✎ Editar mi perfil</span>
        <span class="btn secondary sm" data-add="proyecto">+ Primer proyecto</span>
        <span class="btn secondary sm" data-add="memoria">+ Primera memoria</span>
      </div>
    </div>`:``}

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
    <div class="section-title"><h2>Trayectoria de ${a.name}</h2><div class="spacer"></div>${a.live?`<span class="btn sm" data-add="hito">+ Hito</span>`:``}</div>
    <div class="tl">
      ${a.trajectory.map(n=>`<div class="node"><div class="yr">${n.y}</div><b>${n.t}</b><p class="muted" style="margin:4px 0 0">${n.d}</p></div>`).join("")}
    </div>
    <p class="muted" style="margin-top:18px;font-size:12.5px">LUMBRE puede construir tu trayectoria automáticamente leyendo tus PDFs, contratos y proyectos.</p>
  </div></div>`;
}

/* --- Portafolio --- */
function vPortafolio(a){
  return `<div class="grid"><div class="card s12">
    <div class="section-title"><h2>Portafolio</h2><div class="spacer"></div>${a.live?`<span class="btn sm" data-add="obra">+ Obra</span>`:`<span class="muted" style="font-size:12.5px">${a.portfolio.length} obras</span>`}</div>
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
    <div class="section-title"><h2>Agenda de hoy</h2><div class="spacer"></div>${a.live?`<span class="btn sm" data-add="cita">+ Cita</span>`:``}</div>
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
    <div class="section-title"><h2>Biblioteca</h2><div class="spacer"></div>${a.live?`<span class="btn sm" data-add="doc">+ Documento</span>`:`<span class="muted" style="font-size:12.5px">${a.library.length} documentos</span>`}</div>
    ${a.library.map(d=>`<div class="row"><span style="font-size:18px">❏</span><div class="grow"><b>${d.t}</b></div><span class="chip">${d.k}</span></div>`).join("")}
    <p class="muted" style="margin-top:16px;font-size:12.5px">LUMBRE en modo IA Local puede leer estos PDFs, extraer información y ordenar tu memoria sin enviar nada a internet.</p>
  </div></div>`;
}

/* --- Comunidad (Clan + Constelación) --- */
// Roster vivo: usa la nube si está disponible; si no, el seed local (demo).
function roster(){ return (state.cloudAlmas && state.cloudAlmas.length) ? state.cloudAlmas : state.almas; }
const liveMode = () => !!(state.cloudAlmas && state.cloudAlmas.length);

function vComunidad(a){
  const list = roster();
  const clan = SEED_CLANS.find(c=>c.name===a.clan);
  const members = a.clan ? list.filter(m=>m.clan===a.clan) : [];
  const clanCard = a.clan ? `
    <div class="card s12">
      <div class="section-title"><h2>${clan?clan.emoji:"🖤"} ${a.clan}</h2><div class="spacer"></div><span class="pill">Clan · Nivel 2</span></div>
      <p class="muted">${clan?clan.desc:"Comunidad privada por invitación (2 a 8 Almas)."}</p>
      <div class="alma-grid" style="margin-top:14px">${members.map(almaMini).join("")}</div>
    </div>` : `
    <div class="card s12"><div class="section-title"><h2>Sin Clan aún</h2></div>
      <p class="muted">Un Clan es una comunidad privada por invitación (2 a 8 Almas). Un Alma no entra automáticamente: debe ser invitada.</p></div>`;
  return `<div class="grid">
    ${clanCard}
    <div class="card s12">
      <div class="section-title"><h2>Constelación de Almas</h2><div class="spacer"></div>
        <span class="pill ${liveMode()?'gold':''}">${liveMode()?'🜂 En vivo · '+list.length+' Almas':'Founding · '+list.length+' Almas'}</span></div>
      <div class="alma-grid">${list.map(almaMini).join("")}</div>
    </div>
  </div>`;
}
function almaMini(m){
  const lv = levelByKey(m.level);
  // En modo vivo, las Almas ajenas abren su perfil público; en demo, se cambia de Alma.
  const act = (liveMode() && !m.live) ? `data-pub="${m.id}"` : `data-alma="${m.id}"`;
  return `<div class="card alma-card" ${act}>
    ${avatarHTML(m,"lg")}
    <b style="display:block;letter-spacing:-.02em">${m.name}</b>
    <small class="muted">${m.role||""}</small><br>
    <span class="level-badge" style="margin-top:8px;border-color:${lv.color}55;color:${lv.color};font-size:11px">${lv.emoji} ${m.level}</span>
    <div class="muted" style="font-size:11px;margin-top:6px">${m.country||""}</div>
  </div>`;
}

/* --- Santuario (Nivel 3) --- */
function vSantuario(a){
  const S = SEED_SANCTUARY;
  const list = roster();
  const live = liveMode();
  // Finanzas/proyectos sólo de Almas con datos accesibles (las ajenas son privadas)
  const full = state.almas.filter(x=>x.finance);
  const totalInc = full.reduce((t,x)=>t+sum(x.finance.income),0);
  const totalExp = full.reduce((t,x)=>t+sum(x.finance.expense),0);
  const totalProj = full.reduce((t,x)=>t+x.projects.length,0);
  const activeProj = full.reduce((t,x)=>t+x.projects.filter(p=>p.st==="En curso").length,0);
  const dist = LEVELS.map(l=>({l, n:list.filter(x=>x.level===l.key).length})).filter(d=>d.n>0);
  const top = [...list].sort((x,y)=>y.xp-x.xp).slice(0,5);
  return `<div class="grid">
    <div class="card s12" style="background:linear-gradient(145deg,rgba(208,170,99,.16),rgba(255,255,255,.7))">
      <span class="pill gold">Nivel 3 · Santuario</span>
      <h2 style="font-size:30px;letter-spacing:-.05em;margin:10px 0 4px">${S.emoji} ${S.name}</h2>
      <p class="muted" style="max-width:680px">${S.desc}</p>
    </div>

    <div class="card s3"><div class="stat"><span class="num">${list.length}</span><span class="lbl">Almas</span></div></div>
    <div class="card s3"><div class="stat"><span class="num">${S.clans.length}</span><span class="lbl">Clanes</span></div></div>
    <div class="card s3"><div class="stat"><span class="num">${activeProj}/${totalProj}</span><span class="lbl">Proyectos ${live?'(míos)':'activos'}</span></div></div>
    <div class="card s3"><div class="stat"><span class="num">${money(totalInc-totalExp)}</span><span class="lbl">Ganancia ${live?'(mía)':'general'}</span></div></div>

    <div class="card s7">
      <div class="section-title"><h2>Clanes del Santuario</h2></div>
      ${S.clans.map(id=>{
        const c=SEED_CLANS.find(x=>x.id===id);
        const n=list.filter(m=>m.clan===c.name).length;
        return `<div class="row"><span style="font-size:22px">${c.emoji}</span>
          <div class="grow"><b>${c.name}</b><br><small>${n} Almas · ${c.desc}</small></div></div>`;
      }).join("")}
    </div>
    <div class="card s5">
      <div class="section-title"><h2>Departamentos</h2></div>
      ${S.departments.map(d=>{const l=list.find(x=>x.slug===d.lead)||state.almas.find(x=>x.id===d.lead);return `<div class="row"><div class="grow"><b>${d.t}</b><br><small>Lidera: ${l?l.name:"—"}</small></div></div>`;}).join("")}
    </div>

    <div class="card s7">
      <div class="section-title"><h2>Finanzas generales</h2><div class="spacer"></div><span class="pill">${live?'Privadas':'Agregado'}</span></div>
      ${live ? `<p class="muted" style="font-size:13px">🔒 En el sistema vivo, las finanzas de cada Alma son <b>privadas</b>. El Santuario sólo ve métricas que cada Alma decide compartir. Estos números corresponden únicamente a tu Alma.</p>` : ``}
      <div class="grid" style="gap:14px;margin-top:${live?'10px':'0'}">
        <div class="s4"><div class="stat"><span class="num" style="color:var(--ok);font-size:22px">${money(totalInc)}</span><span class="lbl">Ingresos</span></div></div>
        <div class="s4"><div class="stat"><span class="num" style="color:var(--danger);font-size:22px">${money(totalExp)}</span><span class="lbl">Egresos</span></div></div>
        <div class="s4"><div class="stat"><span class="num" style="font-size:22px">${money(totalInc-totalExp)}</span><span class="lbl">Neto</span></div></div>
      </div>
    </div>
    <div class="card s5">
      <div class="section-title"><h2>Distribución por nivel</h2></div>
      ${dist.map(d=>`<div class="row"><span style="font-size:18px">${d.l.emoji}</span><div class="grow"><b>${d.l.key}</b></div><span class="chip">${d.n}</span></div>`).join("")}
    </div>

    <div class="card s12">
      <div class="section-title"><h2>Almas destacadas (XP)</h2></div>
      ${top.map((m,i)=>`<div class="row"><b style="color:var(--gold);width:24px">${i+1}</b>${avatarHTML(m,"sm")}<div class="grow"><b>${m.name}</b><br><small>${m.role}</small></div><span class="chip">${m.xp.toLocaleString("es-CL")} XP</span></div>`).join("")}
    </div>
  </div>`;
}

/* ===========================================================
   EXPORTAR PDF — Dossier del Alma
   =========================================================== */
function exportPDF(){
  const a = me(); const lv = levelByKey(a.level);
  const inc=sum(a.finance.income), exp=sum(a.finance.expense);
  document.getElementById("printArea").innerHTML = `
    <div class="p-head">
      <div class="brand"><span class="mark"><svg viewBox="0 0 100 100" fill="none"><path d="M50 7 89 91H72L61 66H39L28 91H11L50 7Z" stroke="#111" stroke-width="6.5" stroke-linejoin="round"/><circle cx="50" cy="49" r="5.5" fill="#111"/></svg></span>ANIMA TSC</div>
      <small>Dossier de Alma · ${new Date().toLocaleDateString("es-CL")}</small>
    </div>
    <h1 class="p-name">${a.name}</h1>
    <div class="p-sub">${lv.emoji} ${a.level} · ${lv.name} · ${a.xp.toLocaleString("es-CL")} XP — ${a.role} · ${a.country}</div>
    <p>${a.bio}</p>
    <div class="p-tags">${a.tags.map(t=>`<span>${t}</span>`).join("")}</div>

    <h2>Trayectoria</h2>
    ${a.trajectory.map(n=>`<p><b>${n.y} · ${n.t}</b> — ${n.d}</p>`).join("")}

    <h2>Proyectos</h2>
    ${a.projects.map(p=>`<p><b>${p.t}</b> (${p.st}, ${p.pct}%) — ${p.client}</p>`).join("")}

    <h2>Portafolio</h2>
    <p>${a.portfolio.map(p=>`${p.t} (${p.k})`).join(" · ")}</p>

    <h2>Finanzas</h2>
    <p>Ingresos: ${money(inc)} · Egresos: ${money(exp)} · <b>Ganancia: ${money(inc-exp)}</b></p>

    <div class="p-foot">ANIMA TSC — The Soul of Creativity · The Founding Era</div>`;
  window.print();
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
  if(a.live) return addEntryLive(a, kind);
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

/* Versión en la nube: persiste en Supabase (Alma viva del usuario) */
async function addEntryLive(a, kind){
  try{
    let gained=0;
    if(kind==="memoria"){
      const t=prompt("Título de la memoria:"); if(!t)return;
      const d=prompt("Descripción:")||"";
      await Cloud.addMemory(a.almaId,t,d); a.memories.unshift({t,d}); gained=40;
    }else if(kind==="ingreso"||kind==="egreso"){
      const t=prompt(`Concepto del ${kind}:`); if(!t)return;
      const amt=parseInt((prompt("Monto (solo números):")||"0").replace(/\D/g,""))||0;
      const dbk=kind==="ingreso"?"income":"expense";
      await Cloud.addFinance(a.almaId,dbk,t,amt);
      (kind==="ingreso"?a.finance.income:a.finance.expense).unshift({t,a:amt,d:new Date().toISOString().slice(0,7)}); gained=20;
    }else if(kind==="proyecto"){
      const t=prompt("Nombre del proyecto:"); if(!t)return;
      const client=prompt("Cliente:")||"—";
      await Cloud.addProject(a.almaId,t,client);
      a.projects.unshift({t,st:"Planificado",pct:0,client}); gained=60;
    }else if(kind==="hito"){
      const t=prompt("Título del hito:"); if(!t)return;
      const y=prompt("Año:")||String(new Date().getFullYear());
      const d=prompt("Descripción:")||"";
      await Cloud.addTrajectory(a.almaId,y,t,d); a.trajectory.push({y,t,d}); gained=50;
    }else if(kind==="obra"){
      const t=prompt("Título de la obra:"); if(!t)return;
      const k=prompt("Tipo (ej: Mural, Óleo, Foto):")||"Obra";
      await Cloud.addPortfolio(a.almaId,t,k,a.color); a.portfolio.push({t,k,c:a.color}); gained=40;
    }else if(kind==="cita"){
      const h=prompt("Hora (ej: 15:00):")||""; const t=prompt("Actividad:"); if(!t)return;
      await Cloud.addAgenda(a.almaId,h,t); a.agenda.push({h,t});
    }else if(kind==="doc"){
      const t=prompt("Nombre del documento:"); if(!t)return;
      const k=prompt("Tipo (ej: Contrato, Brief):")||"Documento";
      await Cloud.addLibrary(a.almaId,t,k); a.library.push({t,k});
    }
    if(gained){ a.xp+=gained; await Cloud.setXP(a.almaId,a.xp); await syncLevel(a); }
    renderAll();
  }catch(e){ alert("No se pudo guardar en la nube: "+(e.message||e)); }
}

/* Sube de nivel automáticamente según XP (FOUNDING→ANIMA) */
async function syncLevel(a){
  const cur = levelProgress(a.xp).cur.key;
  if(cur !== a.level){
    a.level = cur;
    try{ await Cloud.updateAlma(a.almaId,{ level:cur }); }catch(e){}
    setTimeout(()=>alert("✦ Tu Alma evolucionó a nivel "+cur),50);
  }
}

/* ===========================================================
   AUTH — sesión real (Supabase)
   =========================================================== */
async function refreshAuth(){
  if(!Cloud.enabled){ updateAuthUI(null); return; }
  // Constelación viva para todos (lectura pública)
  try{ state.cloudAlmas = await Cloud.allAlmas(); }catch(e){}
  const s = await Cloud.session();
  if(s){
    // Canjear invitación pendiente del registro
    const pend = localStorage.getItem("anima_pending_invite");
    if(pend){ try{ await Cloud.redeemInvite(pend); }catch(e){} localStorage.removeItem("anima_pending_invite"); }
    await loadMyAlma(); updateAuthUI(s);
  }else{
    state.almas = state.almas.filter(x=>!x.live); if(me().live) state.currentId="sark"; updateAuthUI(null); renderAll();
  }
}
async function loadMyAlma(){
  const row = await Cloud.myAlma(); if(!row) return;
  const mods = await Cloud.loadModules(row.id);
  const a = dbAlmaToState(row, mods);
  state.almas = state.almas.filter(x=>!x.live);
  state.almas.unshift(a);
  state.currentId = a.id; state.view = "mialma"; state.chat=[];
  renderAll();
}
function updateAuthUI(session){
  const btn = document.getElementById("authBtn"); if(!btn) return;
  if(session){ const a=state.almas.find(x=>x.live); btn.textContent = a? ("● "+a.name.split(" ")[0]) : "● Mi cuenta"; btn.dataset.in="1"; }
  else { btn.textContent = Cloud.enabled ? "Entrar" : "Modo local"; btn.dataset.in=""; }
}
function openAuth(){ if(!Cloud.enabled){ alert("Conexión a la nube no disponible. ANIMA funciona en modo Fundadores local."); return; }
  document.getElementById("authModal").classList.add("open"); document.getElementById("authMsg").textContent=""; }
function closeAuth(){ document.getElementById("authModal").classList.remove("open"); }
async function doAuth(mode){
  const email=document.getElementById("authEmail").value.trim();
  const pass=document.getElementById("authPass").value;
  const name=document.getElementById("authName").value.trim();
  const code=(document.getElementById("authCode").value||"").trim().toUpperCase();
  const msg=document.getElementById("authMsg");
  if(!email||!pass){ msg.textContent="Ingresa correo y contraseña."; return; }
  msg.textContent="…";
  try{
    if(mode==="up"){
      if(!code){ msg.textContent="Necesitas un código de invitación (beta cerrada)."; return; }
      const ok = await Cloud.checkInvite(code);
      if(!ok){ msg.textContent="Código de invitación inválido o ya usado."; return; }
      localStorage.setItem("anima_pending_invite", code);
      const { data, error } = await Cloud.signUp(email,pass,name||email.split("@")[0]);
      if(error) throw error;
      if(!data.session){ msg.textContent="Alma creada. Revisa tu correo para confirmar y vuelve a entrar."; return; }
    }else{
      const { error } = await Cloud.signIn(email,pass);
      if(error) throw error;
    }
    closeAuth(); await refreshAuth();
  }catch(e){ msg.textContent = e.message || "No se pudo completar."; }
}
async function logout(){
  if(!confirm("¿Salir de tu Alma?")) return;
  await Cloud.signOut();
  state.almas = JSON.parse(JSON.stringify(SEED_ALMAS));
  state.currentId="sark"; state.view="mialma"; save();
  renderAll(); updateAuthUI(null);
}

/* ===========================================================
   EDITAR MI ALMA (perfil) — sólo Alma viva
   =========================================================== */
function openEdit(){
  const a=me(); if(!a.live){ alert("Entra a tu Alma para editar tu perfil."); return; }
  document.getElementById("edName").value=a.name||"";
  document.getElementById("edRole").value=a.role||"";
  document.getElementById("edCity").value=a.city||"";
  document.getElementById("edCountry").value=a.country||"";
  document.getElementById("edBio").value=a.bio||"";
  document.getElementById("edTags").value=(a.tags||[]).join(", ");
  document.getElementById("editModal").classList.add("open");
}
function closeEdit(){ document.getElementById("editModal").classList.remove("open"); }
async function saveEdit(){
  const a=me(); const g=id=>document.getElementById(id).value.trim();
  const patch={ name:g("edName"), role:g("edRole"), city:g("edCity"), country:g("edCountry"),
                bio:g("edBio"), tags:g("edTags").split(",").map(s=>s.trim()).filter(Boolean) };
  try{ await Cloud.updateAlma(a.almaId, patch); Object.assign(a, patch); closeEdit(); renderAll(); updateAuthUI(await Cloud.session()); }
  catch(e){ alert("No se pudo guardar: "+(e.message||e)); }
}

/* ===========================================================
   PERFIL PÚBLICO de otra Alma (constelación viva)
   =========================================================== */
async function openPublic(id){
  const row=(state.cloudAlmas||[]).find(x=>x.id===id); if(!row) return;
  const lv=levelByKey(row.level); const box=document.getElementById("pubBody");
  document.getElementById("publicModal").classList.add("open");
  box.innerHTML=`<div style="text-align:center">
      <span class="avatar lg" style="margin:0 auto 10px;background:linear-gradient(145deg,${row.color},${shade(row.color,-22)})">${initials(row.name)}</span>
      <h2 style="margin:0;letter-spacing:-.04em">${row.name}</h2>
      <div class="muted">${row.role||""} · ${row.country||""}</div>
      <span class="level-badge" style="margin-top:8px;border-color:${lv.color}55;color:${lv.color}">${lv.emoji} ${row.level}</span>
    </div>
    <p style="margin-top:14px">${row.bio||""}</p>
    <div>${(row.tags||[]).map(t=>`<span class="chip">${t}</span>`).join("")}</div>
    <div id="pubExtra" class="muted" style="font-size:12.5px;margin-top:12px">Cargando trayectoria…</div>`;
  // Trayectoria + portafolio son cara pública (RLS lo permite)
  try{
    const m = await Cloud.loadModules(id);
    const tj=(m.trajectory||[]).map(x=>`<div class="node"><div class="yr">${x.year}</div><b>${x.title}</b><p class="muted" style="margin:2px 0 0">${x.detail||""}</p></div>`).join("");
    const pf=(m.portfolio||[]).map(x=>`<span class="chip">${x.title} · ${x.kind}</span>`).join("");
    document.getElementById("pubExtra").innerHTML =
      (tj?`<h3 style="font-size:15px;margin:8px 0 4px">Trayectoria</h3><div class="tl">${tj}</div>`:"") +
      (pf?`<h3 style="font-size:15px;margin:14px 0 6px">Portafolio</h3><div>${pf}</div>`:"") || "Sin trayectoria pública aún.";
  }catch(e){ document.getElementById("pubExtra").textContent=""; }
}
function closePublic(){ document.getElementById("publicModal").classList.remove("open"); }

/* ===========================================================
   FEEDBACK (beta)
   =========================================================== */
let _fbRating=0;
function openFeedback(){
  if(!Cloud.enabled || !me().live){ alert("Entra a tu Alma para enviar feedback."); return; }
  _fbRating=0; document.getElementById("fbMsg").value=""; document.getElementById("fbStatus").textContent="";
  renderStars(); document.getElementById("feedbackModal").classList.add("open");
}
function closeFeedback(){ document.getElementById("feedbackModal").classList.remove("open"); }
function renderStars(){
  document.getElementById("fbStars").innerHTML=[1,2,3,4,5].map(n=>
    `<span data-star="${n}" style="cursor:pointer;font-size:26px;color:${n<=_fbRating?'#d0aa63':'#ccc'}">★</span>`).join("");
}
async function sendFeedback(){
  const message=document.getElementById("fbMsg").value.trim();
  const st=document.getElementById("fbStatus");
  if(!message && !_fbRating){ st.textContent="Escribe algo o deja una estrella."; return; }
  st.textContent="Enviando…";
  try{
    await Cloud.sendFeedback({ rating:_fbRating||null, message, context:state.view, almaName:me().name });
    st.textContent="¡Gracias! Tu voz construye ANIMA. 🜂";
    setTimeout(closeFeedback,1100);
  }catch(e){ st.textContent="No se pudo enviar: "+(e.message||e); }
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
  const star=e.target.closest("[data-star]");
  if(star){ _fbRating=+star.dataset.star; renderStars(); return; }
  const t=e.target.closest("[data-view],[data-alma],[data-pub],[data-go],[data-add],[data-mode]");
  if(t){
    if(t.dataset.view) go(t.dataset.view);
    else if(t.dataset.go) go(t.dataset.go);
    else if(t.dataset.alma) switchAlma(t.dataset.alma);
    else if(t.dataset.pub) openPublic(t.dataset.pub);
    else if(t.dataset.add) addEntry(t.dataset.add);
    else if(t.dataset.mode){ state.lumbreMode=t.dataset.mode; save(); renderLumbre(); }
    return;
  }
  if(e.target.closest("#editBtn")) openEdit();
  if(e.target.closest("#edSave")) saveEdit();
  if(e.target.closest("#edClose")||e.target.id==="editModal") closeEdit();
  if(e.target.closest("#pubClose")||e.target.id==="publicModal") closePublic();
  if(e.target.closest("#feedbackBtn")) openFeedback();
  if(e.target.closest("#fbSend")) sendFeedback();
  if(e.target.closest("#fbClose")||e.target.id==="feedbackModal") closeFeedback();
  if(e.target.closest("#lumbreOpen")) openLumbre();
  if(e.target.closest("#lumbreClose")||e.target.id==="drawerBg") closeLumbre();
  if(e.target.closest("#menuBtn")) document.getElementById("side").classList.toggle("open");
  if(e.target.closest("#whoBox")) go("comunidad");
  if(e.target.closest("#resetBtn")) reset();
  if(e.target.closest("#exportBtn")||e.target.closest("[data-export]")) exportPDF();
  if(e.target.closest("#authBtn")){ const b=e.target.closest("#authBtn"); b.dataset.in? logout() : openAuth(); }
  if(e.target.closest("#authClose")||e.target.id==="authModal") closeAuth();
  if(e.target.closest("#authSignIn")) doAuth("in");
  if(e.target.closest("#authSignUp")) doAuth("up");
  if(e.target.closest("#lumbreSend")) sendLumbre();
});
document.addEventListener("keydown", e=>{ if(e.key==="Enter" && e.target.id==="lumbreInput") sendLumbre(); });
function sendLumbre(){
  const i=document.getElementById("lumbreInput"); const v=i.value.trim(); if(!v)return; i.value=""; lumbreAsk(v);
}

/* ---------- Boot ---------- */
renderAll();
refreshAuth();
if(Cloud.enabled) Cloud.onAuth(()=>{}); // listener disponible para futuras reacciones
