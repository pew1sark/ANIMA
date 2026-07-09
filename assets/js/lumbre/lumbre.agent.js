/* ===========================================================
   LUMBRE — Agente (Etapa 1)
   Orquesta una pregunta real: arma contexto + memoria, llama al
   proveedor de IA, guarda el intercambio y, si algo falla, cae
   de vuelta al motor de reglas local (lumbreThink, en anima.js)
   para que el chat nunca quede roto. Solo se invoca cuando
   LumbrePermissions.canUseRealLumbre() es verdadero.
   =========================================================== */
const LUMBRE_SYSTEM_PROMPT = [
  "Eres LUMBRE, el motor agente de ANIMA — no un chatbot genérico.",
  "Hablas con el Creador de ANIMA. Tu tono es sabio, sereno, antiguo: acompañas, nunca juzgas.",
  "Usa siempre el glosario de ANIMA: Alma (no 'usuario'/'perfil'), Huella (no 'post'), Chispa (no 'like'),",
  "Eco (no 'comentario'), Raíz (no 'finanzas'), Vínculo (no 'cliente'). Nunca digas 'Clientes', 'Finanzas'",
  "ni 'Configuración' de forma literal en tu respuesta.",
  "Responde solo con el contexto real que se te entrega a continuación. Nunca inventes proyectos, vínculos,",
  "montos ni cifras que no estén en ese contexto. Si no tienes el dato, dilo con honestidad.",
  "Eres de solo lectura: puedes analizar, sugerir y recordar, pero nunca ejecutas ni confirmas una acción",
  "sensible por tu cuenta (crear, editar o eliminar registros) — eso lo hace el Alma desde su propia app."
].join(" ");

const LumbreAgent = {
  async ask(question){
    const a = me();
    const almaId = a.almaId || a.id;

    let context = null;
    try{ context = await LumbreContext.buildForActiveAlma(); }catch(e){}

    let memories = [];
    try{ memories = await LumbreMemory.recall(almaId); }catch(e){}

    let conversationId = null;
    try{ conversationId = await LumbreMemory.ensureConversation(almaId); }catch(e){}

    const system = LUMBRE_SYSTEM_PROMPT
      + "\n\nContexto real del Alma activa (único que puedes usar):\n" + JSON.stringify(context || {})
      + (memories.length ? ("\n\nMemoria que LUMBRE guardó antes:\n" + JSON.stringify(memories)) : "");

    const history = (state.chat || []).slice(-8).map(m => ({
      role: m.role === "you" ? "user" : "assistant",
      content: stripTags(m.text)
    }));
    history.push({ role: "user", content: question });

    try{
      const raw = await LumbreProviders.ask({ system, messages: history });
      const answer = esc(raw).replace(/\n/g, "<br>");
      LumbreMemory.logExchange(conversationId, question, raw);
      return answer || "LUMBRE no encontró una respuesta clara. Intenta reformular.";
    }catch(e){
      console.warn("LUMBRE conectada falló, usando el motor local.", e);
      return lumbreThink(question);
    }
  }
};

function stripTags(html){ return String(html || "").replace(/<[^>]*>/g, " ").trim(); }
