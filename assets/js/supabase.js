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
  signUp(email, password, name){ return _sb.auth.signUp({ email, password, options:{ data:{ name } } }); },
  signIn(email, password){ return _sb.auth.signInWithPassword({ email, password }); },
  signOut(){ return _sb.auth.signOut(); },
  onAuth(cb){ if(_sb) _sb.auth.onAuthStateChange((_e, s)=>cb(s)); },

  /* Constelación pública VIVA — todas las Almas (fundadoras + beta) */
  async allAlmas(){
    if(!_sb) return [];
    const { data } = await _sb.from("almas")
      .select("id,slug,name,role,city,country,bio,color,level,xp,clan,tags,is_founding,created_at")
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
  async comments(postId){ const { data } = await _sb.from("comments").select("*").eq("post_id", postId).order("created_at",{ascending:true}); return data||[]; }
};

/* DB → forma en memoria que usan las vistas */
function dbAlmaToState(row, m){
  return {
    id: "me-"+row.id, almaId: row.id, live: true,
    name: row.name, color: row.color || "#111111", level: row.level || "EMBER", xp: row.xp || 0,
    role: row.role || "Creador", city: row.city || "", country: row.country || "",
    bio: row.bio || "", tags: row.tags || [], clan: row.clan || null,
    photo: row.avatar_url || "", discipline: row.discipline || "", specialty: row.specialty || "",
    handle: row.handle || "", territory: row.territory || "", website: row.website || "",
    instagram: row.instagram || "", portfolio_url: row.portfolio_url || "", shop_url: row.shop_url || "",
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
