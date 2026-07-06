# LUMBRE — Etapa 1 (Claude real + Obsidian, solo Creador)

Esta etapa conecta el drawer de LUMBRE que ya existía (`studio.html` + `anima.js`) a un
proveedor de IA real (Claude) y a un Vault de Obsidian local, **exclusivamente para el
Creador** (`sarkgraff@gmail.com`, `public.is_creator()`). Para cualquier otra Alma, o si algo
falla, LUMBRE sigue respondiendo con el motor de reglas local (`lumbreThink`) — nunca se rompe
la experiencia existente.

## 1. Aplicar la migración

Supabase → SQL Editor → New query → pega todo `supabase/migrations/0034_lumbre.sql` → Run.
Es idempotente. Crea:

- `lumbre_conversations` / `lumbre_messages` — historial del chat real. RLS: solo el Creador.
- `lumbre_memory` — hechos que LUMBRE decide recordar entre sesiones. RLS: dueño del Alma.
- `obsidian_links` — traza cada nota escrita en el Vault hacia su registro en ANIMA. RLS: solo
  el Creador.

## 2. Desplegar la Edge Function

```bash
supabase functions deploy lumbre-ai
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

`supabase/functions/lumbre-ai/index.ts` es un proxy delgado: verifica que quien llama es el
Creador (misma regla que `is_creator()`, usando el JWT de la sesión) y reenvía la conversación
a la API de Claude. La API key nunca llega al navegador — vive solo como secreto de Supabase.
Sin el secreto configurado, la función responde con un error claro (no silencioso).

Variable opcional `ANTHROPIC_MODEL` (por defecto `claude-sonnet-4-5`).

## 3. Qué hace cada pieza en el cliente

- `assets/js/services/ai.service.js` — único punto que invoca la Edge Function
  (`supabase.functions.invoke("lumbre-ai", …)`).
- `assets/js/services/obsidian.service.js` — único punto que escribe en el Vault (File System
  Access API). El Creador conecta la carpeta desde el botón "Conectar Vault de Obsidian" que
  aparece en el drawer de LUMBRE solo cuando `isCreator` es verdadero.
- `assets/js/lumbre/lumbre.permissions.js` — único punto que decide si esta sesión puede usar
  LUMBRE real (`isCreator && !viewAs`).
- `assets/js/lumbre/lumbre.context.js` — arma un resumen compacto (no el dump completo) del
  Alma activa a partir de `Cloud.loadModules/clients/quotes`, ya existentes.
- `assets/js/lumbre/lumbre.tools.js` — búsquedas puntuales de solo lectura (proyecto/vínculo/
  cotización por nombre) para cuando el resumen no basta.
- `assets/js/lumbre/lumbre.providers.js` — hoy solo Claude; queda lista para sumar otro
  proveedor sin tocar `lumbre.agent.js`.
- `assets/js/lumbre/lumbre.memory.js` — CRUD sobre las tablas nuevas, siempre a través de
  `Cloud` (nunca toca `_sb` directo, igual que el resto de ANIMA).
- `assets/js/lumbre/lumbre.agent.js` — orquesta: contexto + memoria + proveedor; si algo falla,
  cae de vuelta a `lumbreThink()`.

`anima.js` solo cambió en tres puntos mínimos:

1. `lumbreAsk()` delega en `LumbreAgent.ask()` cuando `canUseRealLumbre()` y el modo es
   "IA Conectada"; si no, sigue igual que siempre.
2. `renderLumbre()` ahora también pinta el indicador "LUMBRE · ADMIN · Alpha" y el botón de
   Obsidian cuando corresponde.
3. `recordAlphaEvents()` (proyecto/vínculo) y `qSaveCloud()` (cotización) llaman a
   `ObsidianService.saveProject/saveClient/saveQuote` — solo en la creación real, solo si el
   Vault está conectado, solo para el Creador. Nunca hay sincronización constante.

## 4. Alcance de esta etapa

**Sí incluye:** chat real con Claude usando datos reales del Alma del Creador, memoria de
hechos entre sesiones, escritura de notas en Obsidian al crear un proyecto/vínculo/cotización.

**No incluye (a futuro):**
- Importación histórica desde un Vault existente (`scanObsidianVault`, preview/confirm antes
  de escribir en Supabase) — es la pieza más sensible y merece su propio ciclo de revisión.
- LUMBRE para Alma/Clan/Santuario (planes no-ADMIN).
- Herramientas que escriben o eliminan (crear cotización, campaña, etc. por decisión de
  LUMBRE) — Etapa 1 es solo lectura + memoria + Obsidian.
- Multi-proveedor (OpenAI/Gemini/Ollama) — la capa de providers está preparada pero solo
  Claude está cableado.

## 5. Verificación manual

1. `python3 -m http.server 8080` → abrir `studio.html` con sesión que **no** es del Creador:
   el drawer debe verse exactamente igual que antes (sin indicador ADMIN, sin botón Vault).
2. Con sesión del Creador y modo "IA Conectada": el indicador "LUMBRE · ADMIN · Alpha" debe
   aparecer, y preguntarle a LUMBRE por un proyecto real debe traer datos reales (no
   inventados) usando el glosario de ANIMA.
3. Sin `ANTHROPIC_API_KEY` seteada: la Edge Function debe devolver error claro; el chat debe
   caer de vuelta a `lumbreThink()` sin quedar roto.
4. Conectar un Vault de prueba y crear un proyecto nuevo: debe aparecer un `.md` en
   `Vault/Proyectos/` y una fila nueva en `obsidian_links`.
