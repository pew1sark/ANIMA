/* ===========================================================
   LUMBRE — Memoria
   Único punto que persiste conversaciones y hechos de LUMBRE.
   No escribe directo contra Supabase: pasa siempre por Cloud
   (mismo patrón que el resto de ANIMA), que ya sabe cómo hablar
   con lumbre_conversations / lumbre_messages / lumbre_memory.
   =========================================================== */
const LumbreMemory = {
  async ensureConversation(almaId){
    try{ return await Cloud.lumbreEnsureConversation(almaId); }catch(e){ return null; }
  },
  async logExchange(conversationId, question, answer){
    if(!conversationId) return;
    try{
      await Cloud.lumbreSaveMessage(conversationId, "you", question);
      await Cloud.lumbreSaveMessage(conversationId, "lum", answer);
    }catch(e){}
  },
  async remember(almaId, key, value, source){
    try{ await Cloud.lumbreMemorySet(almaId, key, value, source); }catch(e){}
  },
  async recall(almaId){
    try{ return await Cloud.lumbreMemoryList(almaId); }catch(e){ return []; }
  }
};
