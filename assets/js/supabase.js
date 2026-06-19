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

  /* Constelación pública (cara pública de cada Alma) */
  async foundingAlmas(){
    if(!_sb) return [];
    const { data } = await _sb.from("almas")
      .select("slug,name,role,city,country,bio,color,level,xp,clan,tags")
      .eq("is_founding", true).order("xp", { ascending:false });
    return data || [];
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
  setXP(almaId, xp){ return _sb.from("almas").update({ xp }).eq("id", almaId); }
};

/* DB → forma en memoria que usan las vistas */
function dbAlmaToState(row, m){
  return {
    id: "me-"+row.id, almaId: row.id, live: true,
    name: row.name, color: row.color || "#111111", level: row.level || "EMBER", xp: row.xp || 0,
    role: row.role || "Creador", city: row.city || "", country: row.country || "",
    bio: row.bio || "", tags: row.tags || [], clan: row.clan || null,
    finance: {
      income:  (m.income  || []).map(x => ({ t:x.title, a:Number(x.amount), d:x.period })),
      expense: (m.expense || []).map(x => ({ t:x.title, a:Number(x.amount), d:x.period }))
    },
    projects:   (m.projects   || []).map(x => ({ t:x.title, st:x.status, pct:x.pct, client:x.client })),
    trajectory: (m.trajectory || []).map(x => ({ y:x.year, t:x.title, d:x.detail })),
    portfolio:  (m.portfolio  || []).map(x => ({ t:x.title, k:x.kind, c:x.color })),
    memories:   (m.memories   || []).map(x => ({ t:x.title, d:x.detail })),
    library:    (m.library    || []).map(x => ({ t:x.title, k:x.kind })),
    agenda:     (m.agenda     || []).map(x => ({ h:x.at_time, t:x.title }))
  };
}
