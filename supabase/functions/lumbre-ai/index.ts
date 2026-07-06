// ===========================================================
// ANIMA TSC — Edge Function: lumbre-ai
//
// Proxy delgado entre LumbreAgent (cliente) y Claude (Anthropic).
// No contiene lógica de negocio ni construye el contexto: solo
// verifica que quien llama es el Creador (misma regla que
// public.is_creator() usa en RLS) y reenvía la conversación.
// La API key nunca llega al navegador: vive como secreto de
// Supabase (ANTHROPIC_API_KEY) y solo la lee este entorno.
//
// Deploy: supabase functions deploy lumbre-ai
// Secreto: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// ===========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Falta sesión." }, 401);
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json({ error: "La función no tiene configurado SUPABASE_URL/SUPABASE_ANON_KEY." }, 500);
    }

    // El cliente hereda el JWT de quien llama: is_creator() lee auth.jwt()
    // bajo ese mismo JWT, así que respeta exactamente la misma regla que RLS.
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: isCreator, error: authError } = await supabase.rpc("is_creator");
    if (authError) return json({ error: "No se pudo verificar el acceso." }, 500);
    if (!isCreator) return json({ error: "LUMBRE conectada es exclusiva del Creador." }, 403);

    if (!ANTHROPIC_API_KEY) {
      return json({ error: "ANTHROPIC_API_KEY no está configurada en los secretos de Supabase." }, 500);
    }

    const { system, messages } = await req.json();
    if (!Array.isArray(messages) || !messages.length) {
      return json({ error: "Faltan mensajes para LUMBRE." }, 400);
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: system || undefined,
        messages,
      }),
    });

    if (!claudeRes.ok) {
      const detail = await claudeRes.text();
      return json({ error: "El proveedor de IA no respondió.", detail }, 502);
    }

    const claudeData = await claudeRes.json();
    const text = (claudeData.content || [])
      .map((block: { text?: string }) => block.text || "")
      .join("")
      .trim();

    return json({ text, model: ANTHROPIC_MODEL });
  } catch (e) {
    return json({ error: "Error inesperado en LUMBRE.", detail: String(e) }, 500);
  }
});
