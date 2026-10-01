// ===========================================================
// ANIMA TSC — Edge Function: push
//
// Avisos al teléfono (Web Push) para STUDIO.
//
// PUERTAS
//   Pública:
//     { action: "vapid" }                         → llave pública para suscribirse
//   Con la sesión del Alma:
//     { action: "subscribe",   alma_id, sub, device }
//     { action: "unsubscribe", alma_id, endpoint }
//     { action: "test",        alma_id }
//   Desde la base (x-cron-key, la misma de meta-leads):
//     { action: "lead", id }   lo dispara el INSERT en client_leads (0138)
//     { action: "tick" }       cron cada 5 min: recordatorios y resumen diario
//
// SIN LIBRERÍAS: la firma VAPID (JWT ES256) y el cifrado del mensaje
// (RFC 8291, aes128gcm) se hacen con WebCrypto. Las llaves VAPID se
// generan la primera vez y quedan en Vault (push_vapid_*).
//
// Deploy: supabase functions deploy push --no-verify-jwt
// ===========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITIO = "https://www.animatsc.com";
const CONTACTO = "mailto:sarkgraff@gmail.com";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------------------------------------------------------------
// base64url y bytes
// ---------------------------------------------------------------
const enc = new TextEncoder();
function b64u(buf: ArrayBuffer | Uint8Array) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function deB64u(s: string) {
  const t = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(t); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function unir(...partes: Uint8Array[]) {
  const n = partes.reduce((s, p) => s + p.length, 0); const out = new Uint8Array(n); let o = 0;
  for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}
async function hmac(clave: Uint8Array, datos: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", clave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, datos));
}

// ---------------------------------------------------------------
// Llaves VAPID (Vault)
// ---------------------------------------------------------------
async function secreto(nombre: string): Promise<string | null> {
  const { data, error } = await admin.rpc("push_secret_get", { p_name: nombre });
  if (error) throw error;
  return (data as string) || null;
}
let VAPID: { pub: string; priv: CryptoKey } | null = null;
async function vapid() {
  if (VAPID) return VAPID;
  let jwk = await secreto("push_vapid_private");
  let pub = await secreto("push_vapid_public");
  if (!jwk || !pub) {
    const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    jwk = JSON.stringify(await crypto.subtle.exportKey("jwk", par.privateKey));
    pub = b64u(await crypto.subtle.exportKey("raw", par.publicKey));
    // Si dos llamadas compiten, gana la primera que escribió: se relee de Vault.
    await admin.rpc("push_secret_set", { p_name: "push_vapid_private", p_value: jwk });
    await admin.rpc("push_secret_set", { p_name: "push_vapid_public", p_value: pub });
  }
  const priv = await crypto.subtle.importKey("jwk", JSON.parse(jwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  VAPID = { pub, priv };
  return VAPID;
}

// JWT ES256 para el servicio de push (WebCrypto ya firma en formato r||s).
async function firmaVapid(endpoint: string) {
  const { pub, priv } = await vapid();
  const aud = new URL(endpoint).origin;
  const cab = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const cue = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACTO })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, enc.encode(`${cab}.${cue}`));
  return `vapid t=${cab}.${cue}.${b64u(sig)}, k=${pub}`;
}

// RFC 8291: el mensaje viaja cifrado para ese navegador y nadie más.
async function cifrar(sub: { p256dh: string; auth: string }, texto: string) {
  const uaPub = deB64u(sub.p256dh), secretoAuth = deB64u(sub.auth);
  const efimera = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", efimera.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, efimera.privateKey, 256));
  const prkKey = await hmac(secretoAuth, ecdh);
  const ikm = await hmac(prkKey, unir(enc.encode("WebPush: info\0"), uaPub, asPub, new Uint8Array([1])));
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(sal, ikm);
  const cek = (await hmac(prk, enc.encode("Content-Encoding: aes128gcm\0\x01"))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode("Content-Encoding: nonce\0\x01"))).slice(0, 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const claro = unir(enc.encode(texto), new Uint8Array([2]));          // 0x02 = último registro
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, claro));
  const rs = new Uint8Array([0, 0, 16, 0]);                             // 4096
  return unir(sal, rs, new Uint8Array([asPub.length]), asPub, cifrado);
}

type Aviso = { title: string; body: string; url?: string; tag?: string };

// Manda a un dispositivo. 404/410 = el navegador se dio de baja: se borra.
async function enviarA(s: any, aviso: Aviso) {
  try {
    const r = await fetch(s.endpoint, {
      method: "POST",
      headers: {
        "Authorization": await firmaVapid(s.endpoint),
        "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
        "TTL": "86400", "Urgency": "high",
      },
      body: await cifrar(s, JSON.stringify(aviso)),
    });
    if (r.status === 404 || r.status === 410) { await admin.from("push_subscriptions").delete().eq("id", s.id); return false; }
    if (!r.ok) {
      await admin.from("push_subscriptions").update({ fail_count: (s.fail_count || 0) + 1 }).eq("id", s.id);
      console.error("push", r.status, await r.text().catch(() => ""));
      return false;
    }
    await admin.from("push_subscriptions").update({ last_ok_at: new Date().toISOString(), fail_count: 0 }).eq("id", s.id);
    return true;
  } catch (e) { console.error("push", (e as Error).message); return false; }
}
async function enviarAlma(almaId: string, aviso: Aviso) {
  const { data: subs } = await admin.from("push_subscriptions").select("*").eq("alma_id", almaId);
  let ok = 0;
  for (const s of subs || []) if (await enviarA(s, aviso)) ok++;
  return { dispositivos: (subs || []).length, enviados: ok };
}
async function prefs(almaId: string) {
  const { data } = await admin.from("notif_prefs").select("*").eq("alma_id", almaId).maybeSingle();
  return data || { alma_id: almaId, leads: true, resumen: true, hora: 9, tz: "America/Santiago", last_resumen: null };
}

// ---------------------------------------------------------------
// Qué se avisa
// ---------------------------------------------------------------
const primerNombre = (n: any) => String(n || "").trim().split(/\s+/)[0] || "";

async function avisoLead(id: string) {
  const { data: l } = await admin.from("client_leads").select("*").eq("id", id).maybeSingle();
  if (!l) return { ok: false };
  const p = await prefs(l.alma_id);
  if (!p.leads) return { ok: true, omitido: "apagado" };
  const quien = l.full_name || "Alguien";
  const extra = [l.city, l.measures].filter(Boolean).join(" · ");
  return { ok: true, ...(await enviarAlma(l.alma_id, {
    title: `Nuevo cliente potencial: ${quien}`,
    body: [l.campaign_name ? `Respondió a «${l.campaign_name}»` : "Respondió a tu anuncio", extra, l.idea].filter(Boolean).join("\n"),
    url: `${SITIO}/studio.html?ir=centro&lead=${l.id}`, tag: `lead-${l.id}`,
  })) };
}

// Fecha y hora "de pared" en la zona del Alma.
function ahoraEn(tz: string) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) };
}
function sumarDia(ymd: string, n: number) { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const ETAPA = (st: string) => {
  const s = String(st || "");
  if (["Aprobado", "En producción", "Revisión", "Entregado", "Cerrado"].includes(s)) return s;
  if (s === "En curso") return "En producción";
  if (s === "Terminado") return "Cerrado";
  return "Cotizando";
};
const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");

async function resumenDe(almaId: string, hoy: string) {
  const manana = sumarDia(hoy, 1);
  const { data: ps } = await admin.from("projects").select("id,title,client,status,due_at,budget,paid,payments,created_at,archive").eq("alma_id", almaId).is("deleted_at", null);
  const vivos = (ps || []).filter((p: any) => !p.archive);
  const abierto = (p: any) => !["Entregado", "Cerrado"].includes(ETAPA(p.status));
  const nombre = (p: any) => p.title || p.client || "Proyecto";
  const items: string[] = [];
  const hoyE = vivos.filter((p: any) => abierto(p) && p.due_at === hoy);
  const mananaE = vivos.filter((p: any) => abierto(p) && p.due_at === manana);
  const atraso = vivos.filter((p: any) => abierto(p) && p.due_at && p.due_at < hoy);
  const cot = vivos.filter((p: any) => ETAPA(p.status) === "Cotizando" && p.created_at && (Date.now() - new Date(p.created_at).getTime()) > 4 * 86400000);
  const abonado = (p: any) => Array.isArray(p.payments) && p.payments.length ? p.payments.reduce((s: number, x: any) => s + (Number(x.a) || 0), 0) : Number(p.paid || 0);
  const cobrar = vivos.filter((p: any) => ETAPA(p.status) === "Entregado" && Number(p.budget || 0) > abonado(p));
  if (hoyE.length) items.push(`Entregas hoy: ${hoyE.map(nombre).join(", ")}`);
  if (mananaE.length) items.push(`Entregas mañana: ${mananaE.map(nombre).join(", ")}`);
  if (atraso.length) items.push(`${atraso.length} atrasado${atraso.length === 1 ? "" : "s"}: ${atraso.slice(0, 3).map(nombre).join(", ")}`);
  if (cobrar.length) items.push(`Por cobrar: ${pesos(cobrar.reduce((s: number, p: any) => s + Number(p.budget || 0) - abonado(p), 0))} en ${cobrar.length} entregado${cobrar.length === 1 ? "" : "s"}`);
  if (cot.length) items.push(`${cot.length} cotización${cot.length === 1 ? "" : "es"} sin respuesta hace 4+ días: ${cot.slice(0, 2).map(nombre).join(", ")}`);
  const { count } = await admin.from("client_leads").select("id", { count: "exact", head: true })
    .eq("alma_id", almaId).in("status", ["nuevo", "revisado"]);
  if (count) items.unshift(`${count} cliente${count === 1 ? "" : "s"} potencial${count === 1 ? "" : "es"} sin responder`);
  return items;
}

async function tick() {
  const ahora = new Date().toISOString();
  // 1 · Recordatorios agendados que ya vencieron (se marcan antes de mandar: nunca dos veces).
  const { data: rs } = await admin.from("project_reminders").select("*").is("sent_at", null).lte("at", ahora).limit(100);
  let recordados = 0;
  for (const r of rs || []) {
    const { data: marcado } = await admin.from("project_reminders").update({ sent_at: ahora }).eq("id", r.id).is("sent_at", null).select("id");
    if (!marcado?.length) continue;
    let titulo = "Recordatorio";
    if (r.project_id) {
      const { data: p } = await admin.from("projects").select("title,deleted_at").eq("id", r.project_id).maybeSingle();
      if (p?.deleted_at) continue;                    // proyecto en la papelera: el recordatorio no suena
      if (p?.title) titulo = `⏰ ${p.title}`;
    }
    await enviarAlma(r.alma_id, { title: titulo, body: r.text, url: `${SITIO}/studio.html?ir=proyectos${r.project_id ? "&proyecto=" + r.project_id : ""}`, tag: `rec-${r.id}` });
    recordados++;
  }
  // 2 · Resumen diario, una vez al día a la hora de cada Alma.
  const { data: subs } = await admin.from("push_subscriptions").select("alma_id");
  const almas = [...new Set((subs || []).map((s: any) => s.alma_id))];
  let resumenes = 0;
  for (const almaId of almas) {
    const p = await prefs(almaId);
    if (!p.resumen) continue;
    const { dia, hora } = ahoraEn(p.tz || "America/Santiago");
    if (hora < p.hora || p.last_resumen === dia) continue;
    await admin.from("notif_prefs").upsert({ alma_id: almaId, last_resumen: dia, updated_at: ahora }, { onConflict: "alma_id" });
    const items = await resumenDe(almaId, dia);
    if (!items.length) continue;                       // un día sin pendientes no merece un aviso
    await enviarAlma(almaId, { title: "Tu día en ANIMA", body: items.join("\n"), url: `${SITIO}/studio.html?ir=proyectos`, tag: `resumen-${dia}` });
    resumenes++;
  }
  return { ok: true, recordados, resumenes };
}

// ---------------------------------------------------------------
async function almaDelUsuario(req: Request, almaId: string): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt || !almaId) return false;
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return false;
  const { data } = await admin.from("almas").select("id").eq("id", almaId).eq("user_id", u.user.id).maybeSingle();
  return !!data;
}
function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function llaveCron(req: Request) {
  const { data } = await admin.rpc("meta_secret_get", { p_name: "meta_leads_cron_key" });
  return !!data && iguales(req.headers.get("x-cron-key") || "", String(data));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  try {
    const body = JSON.parse((await req.text()) || "{}");
    if (body.action === "vapid") return json({ ok: true, key: (await vapid()).pub });

    if (body.action === "lead" || body.action === "tick") {
      if (!(await llaveCron(req))) return json({ ok: false }, 401);
      return json(body.action === "lead" ? await avisoLead(String(body.id || "")) : await tick());
    }

    const almaId = String(body.alma_id || "");
    if (!(await almaDelUsuario(req, almaId))) return json({ ok: false, msg: "Sesión no válida." }, 401);
    switch (body.action) {
      case "subscribe": {
        const s = body.sub || {};
        const endpoint = String(s.endpoint || ""), p256dh = String(s.keys?.p256dh || ""), auth = String(s.keys?.auth || "");
        if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return json({ ok: false, msg: "Suscripción inválida." }, 400);
        const { error } = await admin.from("push_subscriptions").upsert({
          alma_id: almaId, endpoint, p256dh, auth, device: String(body.device || "").slice(0, 80) || null, fail_count: 0,
        }, { onConflict: "endpoint" });
        if (error) throw error;
        await admin.from("notif_prefs").upsert({ alma_id: almaId }, { onConflict: "alma_id", ignoreDuplicates: true });
        return json({ ok: true });
      }
      case "unsubscribe":
        await admin.from("push_subscriptions").delete().eq("alma_id", almaId).eq("endpoint", String(body.endpoint || ""));
        return json({ ok: true });
      case "test": {
        const r = await enviarAlma(almaId, { title: "ANIMA · avisos activados ✦", body: "Así te avisaremos cuando un cliente responda a un anuncio o un proyecto necesite atención.", url: `${SITIO}/studio.html?ir=centro`, tag: "prueba" });
        return json({ ok: r.enviados > 0, ...r, msg: r.dispositivos ? (r.enviados ? "Enviado" : "El servicio de avisos no aceptó el envío") : "Este dispositivo aún no está suscrito" });
      }
      case "resumen": {   // vista previa del resumen de hoy, sin esperar a la hora
        const p = await prefs(almaId);
        const items = await resumenDe(almaId, ahoraEn(p.tz || "America/Santiago").dia);
        const r = await enviarAlma(almaId, { title: "Tu día en ANIMA", body: items.length ? items.join("\n") : "Nada pendiente para hoy ✓", url: `${SITIO}/studio.html?ir=proyectos`, tag: "resumen-prueba" });
        return json({ ok: true, items, ...r });
      }
      default: return json({ ok: false, msg: "Acción desconocida." }, 400);
    }
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("push", msg);
    return json({ ok: false, msg }, 500);
  }
});
