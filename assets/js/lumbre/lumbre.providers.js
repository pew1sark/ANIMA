/* ===========================================================
   LUMBRE — Proveedores de IA
   Capa delgada sobre AiService. Hoy solo habla con Claude
   (Anthropic) a través de la Edge Function "lumbre-ai"; queda
   lista para sumar OpenAI/Gemini/Ollama después sin tocar
   LumbreAgent — solo cambiaría qué proveedor resuelve `ask()`.
   =========================================================== */
const LumbreProviders = {
  current: "claude",

  async ask({ system, messages }){
    const res = await AiService.chat({ system, messages });
    if(!res || res.error) throw new Error((res && res.error) || "LUMBRE no obtuvo respuesta del proveedor.");
    return res.text || "";
  }
};
