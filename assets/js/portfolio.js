/* ===========================================================
   ANIMA — Portafolio público (página compartible)
   Lee ?alma=<id> o ?u=<slug>. Sin login. RLS: lectura pública.
   =========================================================== */
const SB_URL="https://jwxeowowuxmijuexdrua.supabase.co";
const SB_KEY="sb_publishable_vrVyAVt19nSsedXoCzYr-g_QFQc9w_R";
const sb = (window.supabase && window.supabase.createClient) ? window.supabase.createClient(SB_URL,SB_KEY) : null;
const q = new URLSearchParams(location.search);
const almaId=q.get("alma"), slug=q.get("u");
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const initials=n=>(n||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
const MEDIA_URL_CACHE = new Map();
let currentAlma=null, currentPort=[], currentTraj=[], galleryLimit=6;
function mediaUrl(url){ const key=String(url||"").trim(); if(!key) return ""; if(MEDIA_URL_CACHE.has(key)) return MEDIA_URL_CACHE.get(key); MEDIA_URL_CACHE.set(key,key); return key; }
function shade(hex,p){hex=hex||"#111111";const n=parseInt(hex.slice(1),16);let r=(n>>16)+p,g=(n>>8&255)+p,b=(n&255)+p;r=Math.max(0,Math.min(255,r));g=Math.max(0,Math.min(255,g));b=Math.max(0,Math.min(255,b));return "#"+(0x1000000+(r<<16)+(g<<8)+b).toString(16).slice(1);}
const isImg=u=>u&&/\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(u);

async function main(){
  if(!sb){ $("#app").innerHTML="<div class='empty'>No hay conexión.</div>"; return; }
  if(!almaId && !slug){ $("#app").innerHTML="<div class='empty'><h2>Portafolio no encontrado</h2><p>Falta el identificador del Alma.</p></div>"; return; }
  let qy=sb.from("almas").select("id,slug,name,role,crew_role,avatar_url,banner_url,discipline,specialty,headline,availability,territory,country,city,bio,tags,website,instagram,portfolio_url,shop_url,visibility,color,level,xp,sparks,created_at"); qy = almaId ? qy.eq("id",almaId) : qy.eq("slug",slug);
  const { data:a } = await qy.maybeSingle();
  if(!a){ $("#app").innerHTML="<div class='empty'><h2>Esta Alma aún no es pública</h2><p>Puede que el enlace sea incorrecto.</p></div>"; return; }
  if(a.visibility && a.visibility.public===false){
    document.title=`${a.name} · ANIMA`;
    $("#app").innerHTML=`<div class='empty'><h2>Portafolio privado</h2><p>${esc(a.name)} mantiene su portafolio en privado por ahora.</p><a class='btn' href='studio.html' style='margin-top:14px;display:inline-block'>Crear mi Alma →</a></div>`;
    return;
  }
  const [{data:port},{data:traj}] = await Promise.all([
    sb.from("portfolio").select("id,title,kind,color,year,link,description").eq("alma_id",a.id),
    sb.from("trajectory").select("id,year,title,detail").eq("alma_id",a.id)
  ]);
  currentAlma=a; currentPort=port||[]; currentTraj=traj||[];
  render(a, port||[], traj||[]);
}

function render(a, port, traj){
  const lv = (typeof levelByKey==="function") ? levelByKey(a.level) : {label:a.level||"",color:"#d0aa63",emoji:"✦"};
  const vis = a.visibility||{}; const show=k=>vis[k]!==false;
  document.title = `${a.name} · Portafolio · ANIMA`;
  const bannerUrl=mediaUrl(a.banner_url);
  const avatarUrl=mediaUrl(a.avatar_url);
  const banner = bannerUrl
    ? `<div class="pf-banner"><img src="${esc(bannerUrl)}" alt="" loading="eager" decoding="async"></div>`
    : `<div class="pf-banner" style="background:linear-gradient(135deg,${a.color},${shade(a.color,-40)})"></div>`;
  const photo = avatarUrl
    ? `<div class="pf-photo" style="background-image:url('${esc(avatarUrl)}')"></div>`
    : `<div class="pf-photo" style="background:linear-gradient(145deg,${a.color},${shade(a.color,-22)})">${initials(a.name)}</div>`;
  const idline=[a.discipline||a.role, a.specialty].filter(Boolean).join(" · ");
  const headline = a.headline ? `<div class="pf-headline">${esc(a.headline)}</div>` : "";
  const avail = a.availability ? `<span class="pf-avail ${a.availability.startsWith("No")?"off":a.availability.startsWith("Agenda")?"lim":""}">${a.availability.startsWith("No")?"⚪":a.availability.startsWith("Agenda")?"🟡":"🟢"} ${esc(a.availability)}</span>` : "";
  const role = a.crew_role ? `<span class="pf-role">${esc(a.crew_role)}</span>` : "";
  const since = a.created_at ? new Date(a.created_at).toLocaleDateString("es-CL",{year:"numeric",month:"long"}) : "";
  const links=[]; if(a.website)links.push(["Sitio web",a.website]); if(a.instagram)links.push(["Instagram",a.instagram.startsWith("http")?a.instagram:"https://instagram.com/"+a.instagram.replace("@","")]);
  if(a.portfolio_url)links.push(["Portafolio externo",a.portfolio_url]); if(a.shop_url)links.push(["Tienda",a.shop_url]);

  // Galería agrupada por tema (kind)
  let gallery="";
  if(show("portfolio") && port.length){
    const visible=port.slice(0, galleryLimit);
    const groups={}; visible.forEach(p=>{ const k=p.kind||"Obras"; (groups[k]=groups[k]||[]).push(p); });
    gallery = Object.keys(groups).map(k=>`
      <div class="theme-h"><h2>${esc(k)}</h2><div class="ln"></div><small class="muted">${groups[k].length}</small></div>
      <div class="gal">${groups[k].map(p=>{
        const link=mediaUrl(p.link);
        const cover=isImg(link)?`background-image:url('${esc(link)}')`:`background:linear-gradient(145deg,${p.color||a.color},${shade(p.color||a.color,-28)})`;
        const img = isImg(link)?esc(link):"";
        return `<div class="item" data-img="${img}" data-cap="${esc(p.title)}">
          <div class="cv" style="${cover}">${isImg(link)?"":initials(p.title)}</div>
          <div class="cap"><b>${esc(p.title)}</b><small>${esc([p.kind,p.year].filter(Boolean).join(" · "))}</small>${p.description?`<p>${esc(p.description)}</p>`:""}</div>
        </div>`;
      }).join("")}</div>`).join("") + (port.length>visible.length?`<div style="text-align:center;margin:18px 0 6px"><button class="btn secondary sm" id="loadMorePf">Cargar ${Math.min(6,port.length-visible.length)} más</button><div class="muted" style="font-size:12px;margin-top:8px">${visible.length} de ${port.length}</div></div>`:"");
  } else {
    gallery = `<p class="muted" style="margin-top:24px">Este Alma aún no ha publicado obras.</p>`;
  }

  const trajHTML = (show("trajectory") && traj.length) ? `<div class="pf-section-t">Trayectoria</div><div class="tl">${
    traj.sort((x,y)=>(x.year>y.year?1:-1)).map(n=>`<div class="node"><div class="yr">${esc(n.year)}</div><b>${esc(n.title)}</b><p class="muted" style="margin:2px 0 0;font-size:13px">${esc(n.detail||"")}</p></div>`).join("")}</div>` : "";

  $("#app").innerHTML = `
    ${banner}
    <div class="pf-id">${photo}
      <div style="padding-bottom:8px">
        <h1>${esc(a.name)}</h1>
        ${headline}
        <div class="pf-meta">${esc(idline||"")}${a.territory||a.country?" · "+esc(a.territory||a.country):""}</div>
        <div class="pf-badges"><span class="pf-badge" style="border-color:${lv.color}55;color:${lv.color}">${lv.emoji||"✦"} ${lv.label||a.level}</span>${role}${avail}
          <button class="spark-btn" id="sparkBtn" data-spark="${a.id}">✦ Dar Chispa</button></div>
      </div>
    </div>
    <div class="pf-cols">
      <aside>
        <div class="pf-stats">
          <div class="pf-stat"><b id="sparkStat">${(a.sparks||0).toLocaleString("es-CL")}</b><small>Chispas</small></div>
          <div class="pf-stat"><b>${port.length}</b><small>Obras</small></div>
          <div class="pf-stat"><b>${(a.xp||0).toLocaleString("es-CL")}</b><small>Esencia</small></div>
          ${since?`<div class="pf-stat"><b style="font-size:13px;font-weight:800">${esc(since)}</b><small>Desde</small></div>`:""}
        </div>
        ${show("bio")&&a.bio?`<div class="pf-section-t">Sobre mí</div><p style="font-size:14px;line-height:1.5;margin:0 0 4px">${esc(a.bio)}</p>`:""}
        ${show("tags")&&(a.tags||[]).length?`<div class="pf-section-t">Servicios</div><div style="margin:2px 0 4px">${(a.tags||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}</div>`:""}
        ${show("links")&&links.length?`<div class="pf-section-t">Enlaces</div><div class="pf-links">${links.map(([t,u])=>`<a href="${esc(u)}" target="_blank" rel="noopener">${t} <span>↗</span></a>`).join("")}</div>`:""}
        ${trajHTML}
        <div style="margin-top:24px;padding:16px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.5);text-align:center">
          <div class="pixel-font" style="font-size:10px;color:#7b5920">ANIMA TSC</div>
          <p class="muted" style="font-size:12px;margin:8px 0 10px">Crea tu propio mundo creativo.</p>
          <a class="btn sm" href="studio.html">Crear mi Alma →</a>
        </div>
      </aside>
      <section>${gallery}</section>
    </div>`;
}

/* Chispas (los "me gusta" de ANIMA) — una por visitante (localStorage) */
async function giveSpark(btn){
  const id=btn.dataset.spark; if(!id||!sb) return;
  const key="anima_spark_"+id;
  if(localStorage.getItem(key)){ btn.textContent="✦ Ya diste tu Chispa"; btn.disabled=true; btn.classList.add("done"); return; }
  btn.disabled=true;
  try{
    const { data, error } = await sb.rpc("give_spark", { p_alma:id });
    if(error) throw error;
    localStorage.setItem(key,"1");
    const stat=$("#sparkStat"); if(stat && data!=null) stat.textContent=Number(data).toLocaleString("es-CL");
    // Dar Chispas a otras Almas alimenta tu propia Esencia (una vez por Alma).
    if(window.AnimaState) AnimaState.addEsenciaOnce("spark_"+id,5,"Dar una Chispa");
    btn.textContent="✦ ¡Gracias!"; btn.classList.add("done","pulse");
  }catch(err){ btn.disabled=false; btn.textContent="✦ Dar Chispa"; }
}

/* Lightbox */
document.addEventListener("click", e=>{
  const sp=e.target.closest("[data-spark]"); if(sp){ giveSpark(sp); return; }
  const it=e.target.closest("[data-img]");
  if(it && it.dataset.img){ $("#lbImg").src=it.dataset.img; $("#lbCap").textContent=it.dataset.cap||""; $("#lightbox").classList.add("open"); }
  if(e.target.closest("#loadMorePf")){ galleryLimit+=6; render(currentAlma,currentPort,currentTraj); }
  if(e.target.closest("#lbClose")||e.target.id==="lightbox") $("#lightbox").classList.remove("open");
  if(e.target.closest("#shareBtn")){ navigator.clipboard?.writeText(location.href).then(()=>{ const b=$("#shareBtn"); b.textContent="¡Enlace copiado!"; setTimeout(()=>b.textContent="Compartir",1500); }); }
});
main();
