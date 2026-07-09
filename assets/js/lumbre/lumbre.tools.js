/* ===========================================================
   LUMBRE — Herramientas de solo lectura (Etapa 1)
   Búsquedas puntuales que LumbreAgent puede usar cuando el
   resumen de LumbreContext no basta (ej. el Creador pregunta por
   un vínculo o proyecto que no está en el top 5). Nunca escriben
   ni eliminan — eso queda fuera de alcance de esta etapa.
   =========================================================== */
const LumbreTools = {
  findProject(query){
    const a = me(); const q = String(query||"").toLowerCase();
    return (a.projects||[]).find(p => (p.t||"").toLowerCase().includes(q)) || null;
  },
  async findClient(query){
    const a = me(); const q = String(query||"").toLowerCase();
    try{
      const list = await Cloud.clients(a.almaId || a.id);
      return list.find(c => (c.name||"").toLowerCase().includes(q)) || null;
    }catch(e){ return null; }
  },
  async findQuote(query){
    const a = me(); const q = String(query||"").toLowerCase();
    try{
      const list = await Cloud.quotes(a.almaId || a.id);
      return list.find(qt => (qt.title||"").toLowerCase().includes(q)) || null;
    }catch(e){ return null; }
  }
};
