/* ===========================================================
   ANIMA TSC — Capa Cloud (Supabase)
   Auth real + persistencia. Si no hay conexión, ANIMA sigue
   funcionando en modo Fundadores (local) — fiel a la filosofía:
   ANIMA no depende obligatoriamente de internet.
   =========================================================== */

const SB_URL = "https://jwxeowowuxmijuexdrua.supabase.co";
const SB_KEY = "sb_publishable_vrVyAVt19nSsedXoCzYr-g_QFQc9w_R";

let _sb = null;
try{
  if(window.supabase && window.supabase.createClient){
    _sb = window.supabase.createClient(SB_URL, SB_KEY);
  }
}catch(e){ console.warn("ANIMA: Supabase no disponible, modo local.", e); }

const Cloud = {
  enabled: !!_sb,
  client: _sb,

  async session(){ if(!_sb) return null; const { data } = await _sb.auth.getSession(); return data.session; },
  async user(){ if(!_sb) return null; const { data } = await _sb.auth.getUser(); return data.user; },
  signUp(email, password, name, affinity){ return _sb.auth.signUp({ email, password, options:{ data:{ name, affinity:affinity||null } } }); },
  signIn(email, password){ return _sb.auth.signInWithPassword({ email, password }); },
  signOut(){ return _sb.auth.signOut(); },
  onAuth(cb){ if(_sb) _sb.auth.onAuthStateChange((_e, s)=>cb(s)); },

  /* Recuperación de contraseña.
     resetPassword envía el correo con un enlace a redirectTo (que debe estar
     en la lista de Redirect URLs de Supabase Auth). updatePassword fija la
     nueva clave una vez que el enlace abrió una sesión de recuperación. */
  resetPassword(email, redirectTo){ if(!_sb) return Promise.reject(new Error("Sin conexión a la nube.")); return _sb.auth.resetPasswordForEmail(email, redirectTo?{ redirectTo }:{}); },
  updatePassword(password){ if(!_sb) return Promise.reject(new Error("Sin conexión a la nube.")); return _sb.auth.updateUser({ password }); },
  onPasswordRecovery(cb){ if(_sb) _sb.auth.onAuthStateChange((event, session)=>{ if(event==="PASSWORD_RECOVERY") cb(session); }); },

  /* Constelación pública VIVA — solo Almas reales (sin las fundadoras demo) */
  async allAlmas(){
    if(!_sb) return [];
    const { data } = await _sb.from("almas")
      .select("id,slug,name,role,crew_role,avatar_url,city,country,bio,color,level,xp,clan,santuario,plan,team_role,sparks,tags,is_founding,council,world_access,created_at")
      .eq("is_founding", false)
      .order("created_at", { ascending:false });
    return data || [];
  },

  /* Invitaciones (beta cerrada) */
  async checkInvite(code){ if(!_sb) return false; const { data } = await _sb.rpc("check_invite", { p_code:code }); return !!data; },
  async redeemInvite(code){ if(!_sb) return false; const { data } = await _sb.rpc("redeem_invite", { p_code:code }); return !!data; },

  /* Feedback */
  async sendFeedback({ rating, message, context, almaName }){
    return _sb.from("feedback").insert({ rating, message, context, alma_name:almaName });
  },

  /* El Alma del usuario autenticado */
  async myAlma(){
    const u = await this.user(); if(!u) return null;
    const { data } = await _sb.from("almas").select("*").eq("user_id", u.id).maybeSingle();
    return data;
  },

  async loadModules(almaId){
    const get = async (t, extra) => {
      let q = _sb.from(t).select("*").eq("alma_id", almaId);
      if(extra) q = q.eq("kind", extra);
      const { data } = await q; return data || [];
    };
    return {
      projects:   await get("projects"),
      income:     await get("finance_entries", "income"),
      expense:    await get("finance_entries", "expense"),
      trajectory: await get("trajectory"),
      portfolio:  await get("portfolio"),
      memories:   await get("memories"),
      library:    await get("library"),
      agenda:     await get("agenda")
    };
  },

  addMemory(almaId, title, detail){ return _sb.from("memories").insert({ alma_id:almaId, title, detail }); },
  addProject(almaId, title, client){ return _sb.from("projects").insert({ alma_id:almaId, title, client, status:"Planificado", pct:0 }); },
  addFinance(almaId, kind, title, amount){ return _sb.from("finance_entries").insert({ alma_id:almaId, kind, title, amount, period:new Date().toISOString().slice(0,7) }); },
  addTrajectory(almaId, year, title, detail){ return _sb.from("trajectory").insert({ alma_id:almaId, year, title, detail }); },
  addPortfolio(almaId, title, kind, color){ return _sb.from("portfolio").insert({ alma_id:almaId, title, kind, color }); },
  addAgenda(almaId, at_time, title){ return _sb.from("agenda").insert({ alma_id:almaId, at_time, title }); },
  addLibrary(almaId, title, kind){ return _sb.from("library").insert({ alma_id:almaId, title, kind }); },
  setXP(almaId, xp){ return _sb.from("almas").update({ xp }).eq("id", almaId); },
  updateAlma(almaId, patch){ return _sb.from("almas").update(patch).eq("id", almaId); },

  /* Primer Despertar (migración 0021). Marca en la NUBE que esta Alma cruzó
     el Umbral — una sola vez, idempotente. Asigna su número del Origen (≤30) y
     sube la Esencia a 1. Nunca toca id/user_id. Devuelve la fila del Alma. */
  async completeAwakening(){ if(!_sb) return null; const { data, error } = await _sb.rpc("complete_awakening"); if(error) throw error; return data; },

  /* Esencia (camino ceremonial). add_essence suma de forma atómica al Alma
     del usuario autenticado (migración 0012) y devuelve la Esencia nueva. */
  async addEssence(amount){ if(!_sb) return null; const { data } = await _sb.rpc("add_essence", { p_amount:amount }); return data; },
  setEssence(almaId, essence){ return _sb.from("almas").update({ essence }).eq("id", almaId); },

  /* Consola del Creador: edita otra Alma. .select() permite saber si
     RLS dejó pasar el cambio (data vacío = bloqueado, falta migración 0005). */
  async adminUpdateAlma(almaId, patch){
    const { data, error } = await _sb.from("almas").update(patch).eq("id", almaId).select();
    if(error) throw error;
    return data || [];
  },

  /* Subida de imágenes en ALTA CALIDAD al bucket público "media"
     (migración 0008). Cada Alma escribe sólo en su carpeta /<uid>/…
     Devuelve la URL pública lista para usar como portada/foto/banner. */
  async uploadMedia(file, folder){
    if(!_sb) throw new Error("Sin conexión a la nube.");
    const { data:ud } = await _sb.auth.getUser();
    const uid = ud && ud.user && ud.user.id;
    if(!uid) throw new Error("Inicia sesión para subir imágenes.");
    const ext = ((file.name||"").split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"") || "jpg";
    const path = `${uid}/${folder||"obra"}-${Date.now()}-${Math.random().toString(36).slice(2,7)}.${ext}`;
    const { error } = await _sb.storage.from("media").upload(path, file, { cacheControl:"31536000", upsert:false, contentType:file.type||"image/jpeg" });
    if(error) throw error;
    const { data } = _sb.storage.from("media").getPublicUrl(path);
    return data.publicUrl;
  },

  /* CRUD genérico por tabla (para editar/eliminar cualquier ítem) */
  async insertRow(table, row){ const { data, error } = await _sb.from(table).insert(row).select().single(); if(error) throw error; return data; },
  async updateRow(table, id, patch){ const { error } = await _sb.from(table).update(patch).eq("id", id); if(error) throw error; },
  async deleteRow(table, id){ const { error } = await _sb.from(table).delete().eq("id", id); if(error) throw error; },

  /* Clientes y cotizaciones */
  async clients(almaId){ const { data } = await _sb.from("clients").select("*").eq("alma_id", almaId).order("created_at",{ascending:false}); return data||[]; },
  async quotes(almaId){ const { data } = await _sb.from("quotes").select("*").eq("alma_id", almaId).order("created_at",{ascending:false}); return data||[]; },

  /* Preferencias (personalización sincronizada) */
  async getPrefs(almaId){ const { data } = await _sb.from("preferences").select("data").eq("alma_id", almaId).maybeSingle(); return data?data.data:null; },
  async savePrefs(almaId, data){ const { error } = await _sb.from("preferences").upsert({ alma_id:almaId, data, updated_at:new Date().toISOString() }); if(error) throw error; },

  /* Comunidad */
  async posts(){ const { data } = await _sb.from("posts").select("*").order("created_at",{ascending:false}).limit(100); return data||[]; },
  async comments(postId){ const { data } = await _sb.from("comments").select("*").eq("post_id", postId).order("created_at",{ascending:true}); return data||[]; },

  /* Clan: recordatorios y tablero del equipo (Fase 4, tablas de migración 0006).
     Si la tabla no existe aún, lanza error y el front cae a modo local. */
  async reminders(clan){ const { data, error } = await _sb.from("reminders").select("*").eq("clan", clan).order("due_at",{ascending:true}); if(error) throw error; return data||[]; },
  async addReminder(clan, row){ const { data, error } = await _sb.from("reminders").insert({ clan, ...row }).select().single(); if(error) throw error; return data; },
  async updateReminder(id, patch){ const { error } = await _sb.from("reminders").update(patch).eq("id", id); if(error) throw error; },
  async deleteReminder(id){ const { error } = await _sb.from("reminders").delete().eq("id", id); if(error) throw error; },

  async teamTasks(clan){ const { data, error } = await _sb.from("team_tasks").select("*").eq("clan", clan).order("created_at",{ascending:false}); if(error) throw error; return data||[]; },
  async addTeamTask(clan, row){ const { data, error } = await _sb.from("team_tasks").insert({ clan, ...row }).select().single(); if(error) throw error; return data; },
  async updateTeamTask(id, patch){ const { error } = await _sb.from("team_tasks").update(patch).eq("id", id); if(error) throw error; },
  async deleteTeamTask(id){ const { error } = await _sb.from("team_tasks").delete().eq("id", id); if(error) throw error; },

  /* Clan: calendario sincronizado y proyectos (migración 0011) */
  async clanEvents(clan){ const { data, error } = await _sb.from("clan_events").select("*").eq("clan", clan).order("at_date",{ascending:true}); if(error) throw error; return data||[]; },
  async addClanEvent(clan, row){ const { data, error } = await _sb.from("clan_events").insert({ clan, ...row }).select().single(); if(error) throw error; return data; },
  async updateClanEvent(id, patch){ const { error } = await _sb.from("clan_events").update(patch).eq("id", id); if(error) throw error; },
  async deleteClanEvent(id){ const { error } = await _sb.from("clan_events").delete().eq("id", id); if(error) throw error; },
  async clanProjects(clan){ const { data, error } = await _sb.from("clan_projects").select("*").eq("clan", clan).order("created_at",{ascending:false}); if(error) throw error; return data||[]; },
  async addClanProject(clan, row){ const { data, error } = await _sb.from("clan_projects").insert({ clan, ...row }).select().single(); if(error) throw error; return data; },
  async updateClanProject(id, patch){ const { error } = await _sb.from("clan_projects").update(patch).eq("id", id); if(error) throw error; },
  async deleteClanProject(id){ const { error } = await _sb.from("clan_projects").delete().eq("id", id); if(error) throw error; },

  /* Clan: códigos de invitación (migración 0011) */
  async clanInvites(clan){ const { data, error } = await _sb.from("clan_invites").select("*").eq("clan", clan).order("created_at",{ascending:false}); if(error) throw error; return data||[]; },
  async createInvite(row){ const { data, error } = await _sb.from("clan_invites").insert(row).select().single(); if(error) throw error; return data; },
  async deleteInvite(id){ const { error } = await _sb.from("clan_invites").delete().eq("id", id); if(error) throw error; },
  async joinByCode(code){ const { data, error } = await _sb.rpc("join_clan_by_code", { p_code: code }); if(error) throw error; return data; },

  /* Planificación del Santuario (migración 0019) — scope por santuario. */
  async santTasks(s){ const { data, error } = await _sb.from("santuario_tasks").select("*").eq("santuario", s).order("created_at",{ascending:false}); if(error) throw error; return data||[]; },
  async addSantTask(s, row){ const { data, error } = await _sb.from("santuario_tasks").insert({ santuario:s, ...row }).select().single(); if(error) throw error; return data; },
  async updateSantTask(id, patch){ const { error } = await _sb.from("santuario_tasks").update(patch).eq("id", id); if(error) throw error; },
  async deleteSantTask(id){ const { error } = await _sb.from("santuario_tasks").delete().eq("id", id); if(error) throw error; },
  async santProjects(s){ const { data, error } = await _sb.from("santuario_projects").select("*").eq("santuario", s).order("created_at",{ascending:false}); if(error) throw error; return data||[]; },
  async addSantProject(s, row){ const { data, error } = await _sb.from("santuario_projects").insert({ santuario:s, ...row }).select().single(); if(error) throw error; return data; },
  async updateSantProject(id, patch){ const { error } = await _sb.from("santuario_projects").update(patch).eq("id", id); if(error) throw error; },
  async deleteSantProject(id){ const { error } = await _sb.from("santuario_projects").delete().eq("id", id); if(error) throw error; },
  async santEvents(s){ const { data, error } = await _sb.from("santuario_events").select("*").eq("santuario", s).order("at_date",{ascending:true}); if(error) throw error; return data||[]; },
  async addSantEvent(s, row){ const { data, error } = await _sb.from("santuario_events").insert({ santuario:s, ...row }).select().single(); if(error) throw error; return data; },
  async deleteSantEvent(id){ const { error } = await _sb.from("santuario_events").delete().eq("id", id); if(error) throw error; },

  /* ===========================================================
     ALPHA 2026 (migración 0013)
     =========================================================== */

  /* El Umbral: "34 / 100 Almas". Cuenta solo Almas reales. */
  async soulsCount(){ if(!_sb) return null; const { data } = await _sb.rpc("souls_count"); return data; },
  /* Árbol de Almas: [{country, n}, …] ordenado por cantidad. */
  async soulsByCountry(){ if(!_sb) return []; const { data } = await _sb.rpc("souls_by_country"); return data || []; },

  /* Ecos de ANIMA — el espacio vivo (lectura pública, sin login). */
  async echoes(limit){ if(!_sb) return []; const { data } = await _sb.from("echoes").select("*").order("created_at",{ascending:false}).limit(limit||40); return data || []; },
  async emitEcho(kind, text){ if(!_sb) return null; const { data, error } = await _sb.rpc("emit_echo", { p_kind:kind, p_text:text }); if(error) throw error; return data; },
  /* Ecos en vivo (Realtime). cb recibe cada Eco nuevo. Devuelve el canal. */
  subscribeEchoes(cb){ if(!_sb) return null;
    try{ return _sb.channel("echoes-live")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"echoes" }, p=>{ try{ cb(p.new); }catch(e){} })
      .subscribe(); }catch(e){ return null; } },

  /* Cronología del Alma — "Porque ANIMA recordará." */
  async timeline(){ if(!_sb) return []; const u = await this.user(); if(!u) return []; const { data } = await _sb.from("soul_timeline").select("*").eq("user_id", u.id).order("created_at",{ascending:false}); return data || []; },
  async logTimeline(event, title, desc){ if(!_sb) return null; const { data } = await _sb.rpc("log_timeline", { p_event:event, p_title:title, p_desc:desc||null }); return data; },

  /* Insignias secretas — catálogo + las descubiertas por el Alma. */
  async badgeCatalog(){ if(!_sb) return []; const { data } = await _sb.from("badges").select("*"); return data || []; },
  async myBadges(){ if(!_sb) return []; const u = await this.user(); if(!u) return []; const { data } = await _sb.from("soul_badges").select("code,earned_at").eq("user_id", u.id); return data || []; },
  async awardBadge(code){ if(!_sb) return false; const { data } = await _sb.rpc("award_badge", { p_code:code }); return !!data; },
  /* Insignias por tiempo (Persistencia: 30 días habitando ANIMA). */
  async claimTimeBadges(){ if(!_sb) return false; try{ const { data } = await _sb.rpc("claim_time_badges"); return !!data; }catch(e){ return false; } },

  /* Sistema de logs — registra una acción del Alma (silencioso si falla). */
  async log(action, meta){ if(!_sb) return; try{ await _sb.rpc("log_activity", { p_action:action, p_meta:meta||{} }); }catch(e){} },

  /* Límite de almacenamiento del nivel: {images, pdfs, mb}. */
  async storageQuota(level){ if(!_sb) return null; const { data } = await _sb.rpc("storage_quota", { p_level:level||"FOUNDING" }); return data; },

  /* Subir un archivo a un bucket separado (avatars | portfolio | temp),
     siempre dentro de la carpeta /<uid>/… Devuelve la URL pública. */
  async uploadTo(bucket, file, folder){
    if(!_sb) throw new Error("Sin conexión a la nube.");
    const { data:ud } = await _sb.auth.getUser();
    const uid = ud && ud.user && ud.user.id;
    if(!uid) throw new Error("Inicia sesión para subir archivos.");
    const ext = ((file.name||"").split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"") || "bin";
    const path = `${uid}/${folder||"file"}-${Date.now()}-${Math.random().toString(36).slice(2,7)}.${ext}`;
    const { error } = await _sb.storage.from(bucket).upload(path, file, { cacheControl:"31536000", upsert:false, contentType:file.type||"application/octet-stream" });
    if(error) throw error;
    const { data } = _sb.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  },

  /* Panel del Fundador — agregados (solo el Creador; si no, lanza error). */
  async founderStats(){ if(!_sb) return null; const { data, error } = await _sb.rpc("founder_stats"); if(error) throw error; return data; },

  /* Consejo de Almas — propuestas y votaciones (migración 0015). */
  async proposals(){ if(!_sb) return []; try{ const { data } = await _sb.rpc("list_proposals"); return data || []; }catch(e){ return []; } },
  async createProposal(title, desc){ if(!_sb) return null; const { data, error } = await _sb.rpc("create_proposal", { p_title:title, p_desc:desc||null }); if(error) throw error; return data; },
  async castVote(id, value){ if(!_sb) return; const { error } = await _sb.rpc("cast_vote", { p_proposal:id, p_value:value }); if(error) throw error; },

  /* ===========================================================
     ÁRBOL VIVO DEL MUNDO (migración 0020)
     El estado global del Árbol + el registro de cada acción.
     Si la migración no está aplicada, falla en silencio y el
     Árbol sigue vivo en el dispositivo (localStorage).
     =========================================================== */
  async worldTreeGet(){
    if(!_sb) return null;
    try{ const { data } = await _sb.rpc("world_tree_get"); return data || null; }catch(e){ return null; }
  },
  async worldTreeEvent(type, opts){
    if(!_sb) return null; opts = opts || {};
    try{
      const { data } = await _sb.rpc("world_tree_record", {
        p_type: type, p_branch: opts.branch || null, p_target: opts.target_id || null,
        p_energy: opts.energy || 0, p_title: opts.title || null, p_desc: opts.description || null
      });
      return data || null;
    }catch(e){ return null; }
  },
  /* Eventos del Árbol en vivo (Realtime): cada acción de cualquier Alma. */
  subscribeWorldTree(cb){
    if(!_sb) return null;
    try{ return _sb.channel("world-tree-live")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"world_tree_events" }, p=>{ try{ cb({ event:p.new }); }catch(e){} })
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"world_tree_state" }, p=>{ try{ cb({ state:p.new }); }catch(e){} })
      .subscribe(); }catch(e){ return null; }
  }
};

/* Exponer Cloud en window para que anima-state.js (capa del rito) pueda
   sincronizar la Esencia y la Afinidad sin acoplarse al studio. */
window.Cloud = Cloud;

/* DB → forma en memoria que usan las vistas */
function dbAlmaToState(row, m){
  return {
    id: "me-"+row.id, almaId: row.id, live: true,
    name: row.name, color: row.color || "#111111", level: row.level || "EMBER", xp: row.xp || 0,
    role: row.role || "Creador", city: row.city || "", country: row.country || "",
    bio: row.bio || "", tags: row.tags || [], clan: row.clan || null, santuario: row.santuario || null,
    plan: row.plan || "ALMA", team_role: row.team_role || null,
    photo: row.avatar_url || "", banner: row.banner_url || "", discipline: row.discipline || "", specialty: row.specialty || "",
    handle: row.handle || "", territory: row.territory || "", website: row.website || "",
    instagram: row.instagram || "", portfolio_url: row.portfolio_url || "", shop_url: row.shop_url || "",
    headline: row.headline || "", availability: row.availability || "",
    sparks: row.sparks || 0, created_at: row.created_at || null,
    council: row.council === true, world_access: row.world_access === true,
    essence: row.essence || 0, affinity: row.affinity || "",
    visibility: row.visibility || {},
    finance: {
      income:  (m.income  || []).map(x => ({ _id:x.id, t:x.title, a:Number(x.amount), d:x.period, cat:x.category, on:x.occurred_at, method:x.method, notes:x.notes })),
      expense: (m.expense || []).map(x => ({ _id:x.id, t:x.title, a:Number(x.amount), d:x.period, cat:x.category, on:x.occurred_at, method:x.method, notes:x.notes }))
    },
    projects:   (m.projects   || []).map(x => ({ _id:x.id, t:x.title, st:x.status, pct:x.pct, client:x.client, desc:x.description, start:x.started_at, due:x.due_at, budget:x.budget })),
    trajectory: (m.trajectory || []).map(x => ({ _id:x.id, y:x.year, t:x.title, d:x.detail })),
    portfolio:  (m.portfolio  || []).map(x => ({ _id:x.id, t:x.title, k:x.kind, c:x.color, year:x.year, link:x.link, desc:x.description })),
    memories:   (m.memories   || []).map(x => ({ _id:x.id, t:x.title, d:x.detail })),
    library:    (m.library    || []).map(x => ({ _id:x.id, t:x.title, k:x.kind, url:x.url, notes:x.notes })),
    agenda:     (m.agenda     || []).map(x => ({ _id:x.id, h:x.at_time, t:x.title, date:x.on_date, notes:x.notes }))
  };
}
