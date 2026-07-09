/* ===========================================================
   ANIMA — Servicio de IA
   Único punto que habla con proveedores de IA reales. Nunca los
   llama directo desde el navegador (exponer la key sería
   inseguro): pasa siempre por la Edge Function de Supabase
   "lumbre-ai", que guarda la key como secreto del servidor.
   =========================================================== */
const AiService = {
  async chat({ system, messages }){
    if(!Cloud.enabled || !Cloud.client) return { error: "Sin conexión a la nube." };
    try{
      const { data, error } = await Cloud.client.functions.invoke("lumbre-ai", {
        body: { system, messages }
      });
      if(error) return { error: error.message || "LUMBRE no pudo conectar con su proveedor." };
      return data || {};
    }catch(e){
      return { error: String((e && e.message) || e) };
    }
  }
};
