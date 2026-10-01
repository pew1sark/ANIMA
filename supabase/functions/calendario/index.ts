// ===========================================================
// ANIMA TSC — Edge Function: calendario
//
// Calendario de STUDIO sincronizado con el iPhone y con Google.
//
// PUERTAS
//   GET ?t=<token>          El .ics que suscriben el Calendario del iPhone y
//                           Google Calendar (citas, entregas, inicios,
//                           recordatorios y tareas). El token es la llave.
//   POST con la sesión del Alma:
//     { action: "feed", alma_id }        token y enlaces (lo crea si no hay)
//     { action: "regenerar", alma_id }   nuevo token: el enlace viejo muere
//     { action: "sync", alma_id, source_id? }  relee calendarios importados
//   POST desde la base (x-cron-key, la misma de meta-leads):
//     { action: "cron" }                 cada 30 min, todos los importados
//
// Leer un .ics ajeno: se despliegan las repeticiones (RRULE diaria,
// semanal con días, mensual por día o por «2º martes», anual), se
// respetan EXDATE y las ocurrencias movidas (RECURRENCE-ID), y la hora
// se convierte desde la zona del evento (TZID) con Intl.
//
// Deploy: supabase functions deploy calendario --no-verify-jwt
// ===========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITIO = "https://www.animatsc.com";
const TZ = "America/Santiago";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------------------------------------------------------------
// Zonas horarias
// ---------------------------------------------------------------
function zonaValida(tz: string) { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } }
// Minutos que la zona va adelante de UTC en ese instante.
function offsetMin(tz: string, utc: number) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p: Record<string, string> = Object.fromEntries(f.formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utc) / 60000;
}
// Hora "de pared" en una zona → instante UTC (dos pasadas por si cruza un cambio de hora).
function paredAUTC(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string) {
  const g = Date.UTC(y, mo - 1, d, h, mi, s);
  const o1 = offsetMin(tz, g);
  let t = g - o1 * 60000;
  const o2 = offsetMin(tz, t);
  if (o2 !== o1) t = g - o2 * 60000;
  return t;
}

// ---------------------------------------------------------------
// Escribir .ics
// ---------------------------------------------------------------
const escTxt = (s: string) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fUTC = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const fDia = (ymd: string) => ymd.replace(/-/g, "");
function sumarDia(ymd: string, n: number) { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// RFC 5545: líneas de máximo 75 octetos, la continuación empieza con espacio.
function plegar(linea: string) {
  const b = new TextEncoder().encode(linea);
  if (b.length <= 75) return linea;
  const out: string[] = []; let cur = "", n = 0;
  for (const ch of linea) {
    const l = new TextEncoder().encode(ch).length;
    if (n + l > (out.length ? 74 : 75)) { out.push(cur); cur = ""; n = 0; }
    cur += ch; n += l;
  }
  out.push(cur);
  return out.join("\r\n ");
}
type Ev = { uid: string; titulo: string; desc?: string; url?: string; dia?: string; inicio?: number; fin?: number; alarma?: string; lugar?: string };
function vevento(e: Ev, stamp: string) {
  const l = ["BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`, `SUMMARY:${escTxt(e.titulo)}`];
  if (e.dia) l.push(`DTSTART;VALUE=DATE:${fDia(e.dia)}`, `DTEND;VALUE=DATE:${fDia(sumarDia(e.dia, 1))}`, "TRANSP:TRANSPARENT");
  else l.push(`DTSTART:${fUTC(e.inicio!)}`, `DTEND:${fUTC(e.fin || e.inicio! + 3600000)}`);
  if (e.desc) l.push(`DESCRIPTION:${escTxt(e.desc)}`);
  if (e.lugar) l.push(`LOCATION:${escTxt(e.lugar)}`);
  if (e.url) l.push(`URL:${e.url}`);
  if (e.alarma) l.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escTxt(e.titulo)}`, `TRIGGER:${e.alarma}`, "END:VALARM");
  l.push("END:VEVENT");
  return l.map(plegar).join("\r\n");
}
// "15:00", "15.30", "9", "9:00 hrs" → [h, m]
function hora(t: any): [number, number] | null {
  const m = String(t || "").match(/(\d{1,2})(?:[:.h](\d{2}))?/);
  if (!m) return null;
  const h = +m[1], mi = +(m[2] || 0);
  return h < 24 && mi < 60 ? [h, mi] : null;
}
const CERRADO = new Set(["Cerrado", "Terminado"]);

async function ics(token: string) {
  const { data: feed } = await admin.from("cal_feeds").select("alma_id").eq("token", token).maybeSingle();
  if (!feed) return new Response("Enlace no válido", { status: 404, headers: CORS });
  const almaId = feed.alma_id;
  await admin.from("cal_feeds").update({ last_read_at: new Date().toISOString() }).eq("alma_id", almaId);
  const desde = sumarDia(new Date().toISOString().slice(0, 10), -120);
  const [{ data: alma }, { data: ag }, { data: ps }, { data: rs }, { data: ts }] = await Promise.all([
    admin.from("almas").select("name").eq("id", almaId).maybeSingle(),
    admin.from("agenda").select("id,title,on_date,at_time,notes").eq("alma_id", almaId).gte("on_date", desde),
    admin.from("projects").select("id,title,client,status,due_at,started_at,archive,comuna,city").eq("alma_id", almaId).is("deleted_at", null),
    admin.from("project_reminders").select("id,text,at,project_id").eq("alma_id", almaId).gte("at", desde + "T00:00:00Z"),
    admin.from("tasks").select("id,title,due_at,status,project").eq("alma_id", almaId).gte("due_at", desde),
  ]);
  const stamp = fUTC(Date.now());
  const evs: string[] = [];
  const nombreP = new Map((ps || []).map((p: any) => [p.id, p.title]));
  for (const c of ag || []) {
    if (!c.on_date) continue;
    const h = hora(c.at_time);
    const [y, m, d] = String(c.on_date).split("-").map(Number);
    const inicio = h ? paredAUTC(y, m, d, h[0], h[1], 0, TZ) : undefined;
    evs.push(vevento({ uid: `cita-${c.id}@animatsc.com`, titulo: c.title || "Cita", desc: c.notes || "", dia: h ? undefined : c.on_date,
      inicio, fin: inicio ? inicio + 3600000 : undefined, alarma: h ? "-PT30M" : undefined, url: `${SITIO}/studio.html?ir=agenda` }, stamp));
  }
  for (const p of ps || []) {
    if (p.archive) continue;
    const lugar = [p.comuna, p.city].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", ");
    const url = `${SITIO}/studio.html?ir=proyectos&proyecto=${p.id}`;
    const desc = [p.client && `Cliente: ${p.client}`, p.status && `Estado: ${p.status}`].filter(Boolean).join("\n");
    if (p.due_at && !CERRADO.has(p.status))
      evs.push(vevento({ uid: `entrega-${p.id}@animatsc.com`, titulo: `📦 Entrega · ${p.title || "Proyecto"}`, dia: String(p.due_at).slice(0, 10), desc, lugar, url, alarma: "-PT15H" }, stamp));
    if (p.started_at)
      evs.push(vevento({ uid: `inicio-${p.id}@animatsc.com`, titulo: `▶ Inicio · ${p.title || "Proyecto"}`, dia: String(p.started_at).slice(0, 10), desc, lugar, url }, stamp));
  }
  for (const r of rs || []) {
    const t = new Date(r.at).getTime();
    const pt = r.project_id ? nombreP.get(r.project_id) : null;
    evs.push(vevento({ uid: `recordatorio-${r.id}@animatsc.com`, titulo: `⏰ ${r.text}`, inicio: t, fin: t + 15 * 60000, desc: pt ? `Proyecto: ${pt}` : "",
      alarma: "PT0M", url: `${SITIO}/studio.html?ir=proyectos${r.project_id ? "&proyecto=" + r.project_id : ""}` }, stamp));
  }
  for (const t of ts || []) {
    if (!t.due_at || ["Finalizada", "Archivada"].includes(t.status)) continue;
    evs.push(vevento({ uid: `tarea-${t.id}@animatsc.com`, titulo: `✓ ${t.title || "Tarea"}`, dia: String(t.due_at).slice(0, 10), desc: t.project ? `Proyecto: ${t.project}` : "", url: `${SITIO}/studio.html?ir=tareas` }, stamp));
  }
  const cuerpo = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ANIMA TSC//STUDIO//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    plegar(`X-WR-CALNAME:ANIMA${alma?.name ? " · " + escTxt(alma.name) : ""}`), "X-WR-CALDESC:Citas\\, entregas\\, recordatorios y tareas de ANIMA STUDIO",
    `X-WR-TIMEZONE:${TZ}`, "REFRESH-INTERVAL;VALUE=DURATION:PT15M", "X-PUBLISHED-TTL:PT15M", ...evs, "END:VCALENDAR"].join("\r\n") + "\r\n";
  return new Response(cuerpo, { status: 200, headers: { ...CORS, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="anima.ics"', "Cache-Control": "no-cache, max-age=0" } });
}

// ---------------------------------------------------------------
// Leer .ics ajenos
// ---------------------------------------------------------------
type Prop = { name: string; params: Record<string, string>; value: string };
function lineas(txt: string) { return txt.replace(/\r?\n[ \t]/g, "").split(/\r?\n/).filter(Boolean); }
function prop(l: string): Prop | null {
  let q = false, i = 0;
  for (; i < l.length; i++) { const c = l[i]; if (c === '"') q = !q; else if (c === ":" && !q) break; }
  if (i >= l.length) return null;
  const [name, ...ps] = l.slice(0, i).split(";");
  const params: Record<string, string> = {};
  for (const p of ps) { const k = p.indexOf("="); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, ""); }
  return { name: name.toUpperCase(), params, value: l.slice(i + 1) };
}
const desescapar = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

type Fecha = { ms: number; diaCompleto: boolean; pared: number[]; tz: string | null };
function fecha(p: Prop, tzDef: string): Fecha | null {
  const v = p.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (!m[4] || p.params.VALUE === "DATE") return { ms: Date.UTC(y, mo - 1, d, 12), diaCompleto: true, pared: [y, mo, d, 0, 0, 0], tz: null };
  const h = +m[4], mi = +m[5], s = +(m[6] || 0);
  if (m[7]) return { ms: Date.UTC(y, mo - 1, d, h, mi, s), diaCompleto: false, pared: [y, mo, d, h, mi, s], tz: null };
  const tz = p.params.TZID && zonaValida(p.params.TZID) ? p.params.TZID : tzDef;
  return { ms: paredAUTC(y, mo, d, h, mi, s, tz), diaCompleto: false, pared: [y, mo, d, h, mi, s], tz };
}
function duracion(v: string) {
  const m = v.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const ms = (((+(m[2] || 0) * 7 + +(m[3] || 0)) * 24 + +(m[4] || 0)) * 60 + +(m[5] || 0)) * 60000 + +(m[6] || 0) * 1000;
  return m[1] === "-" ? -ms : ms;
}

type Crudo = { uid: string; titulo: string; lugar: string; ini: Fecha; finMs: number | null; rrule: string | null; exdates: number[]; recId: number | null };
const DIAS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// Una fecha de pared desplazada → instante, en la misma zona que el original.
function aInstante(base: Fecha, y: number, mo: number, d: number) {
  const [, , , h, mi, s] = base.pared;
  if (base.diaCompleto) return Date.UTC(y, mo - 1, d, 12);
  if (!base.tz) return Date.UTC(y, mo - 1, d, h, mi, s);
  return paredAUTC(y, mo, d, h, mi, s, base.tz);
}
// El n-ésimo día de semana del mes (n=-1 → el último).
function nesimo(y: number, mo: number, dow: number, n: number) {
  if (n > 0) { const pri = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(); const d = 1 + ((dow - pri + 7) % 7) + (n - 1) * 7; return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate() ? d : null; }
  const ult = new Date(Date.UTC(y, mo, 0)); const d = ult.getUTCDate() - ((ult.getUTCDay() - dow + 7) % 7) + (n + 1) * 7;
  return d >= 1 ? d : null;
}
function desplegar(ev: Crudo, desde: number, hasta: number, tzDef: string): number[] {
  if (!ev.rrule) return [ev.ini.ms];
  const r: Record<string, string> = Object.fromEntries(ev.rrule.split(";").map((x) => x.split("=")).filter((x) => x.length === 2).map(([k, v]) => [k.toUpperCase(), v]));
  const freq = r.FREQ, intervalo = Math.max(1, +(r.INTERVAL || 1)), cuenta = r.COUNT ? +r.COUNT : Infinity;
  const hastaR = r.UNTIL ? (fecha({ name: "UNTIL", params: {}, value: r.UNTIL }, tzDef)?.ms ?? Infinity) : Infinity;
  const byday = (r.BYDAY || "").split(",").filter(Boolean).map((x) => { const m = x.match(/^([+-]?\d+)?([A-Z]{2})$/); return m ? { n: m[1] ? +m[1] : 0, dow: DIAS[m[2]] } : null; }).filter(Boolean) as { n: number; dow: number }[];
  const bymd = (r.BYMONTHDAY || "").split(",").filter(Boolean).map(Number);
  const [y0, mo0, d0] = ev.ini.pared;
  const out: number[] = []; let n = 0;
  const empujar = (t: number) => { if (t < ev.ini.ms) return true; if (t > hastaR || n >= cuenta) return false; n++; if (t >= desde && t <= hasta) out.push(t); return true; };
  const tope = Math.min(hasta, hastaR);
  for (let k = 0; k < 2000; k++) {
    let cands: number[] = [];
    if (freq === "DAILY") {
      const dd = new Date(Date.UTC(y0, mo0 - 1, d0 + k * intervalo));
      cands = [aInstante(ev.ini, dd.getUTCFullYear(), dd.getUTCMonth() + 1, dd.getUTCDate())];
    } else if (freq === "WEEKLY") {
      const dowIni = new Date(Date.UTC(y0, mo0 - 1, d0)).getUTCDay();
      const lunes = d0 - ((dowIni + 6) % 7) + k * 7 * intervalo;            // semana que empieza el lunes
      const dias = byday.length ? byday.map((b) => (b.dow + 6) % 7) : [(dowIni + 6) % 7];
      cands = dias.sort((a, b) => a - b).map((off) => { const dd = new Date(Date.UTC(y0, mo0 - 1, lunes + off)); return aInstante(ev.ini, dd.getUTCFullYear(), dd.getUTCMonth() + 1, dd.getUTCDate()); });
    } else if (freq === "MONTHLY") {
      const base = new Date(Date.UTC(y0, mo0 - 1 + k * intervalo, 1)); const y = base.getUTCFullYear(), mo = base.getUTCMonth() + 1;
      const dias: number[] = byday.length ? byday.map((b) => nesimo(y, mo, b.dow, b.n || 1)).filter((x): x is number => !!x)
        : (bymd.length ? bymd : [d0]).map((x) => x < 0 ? new Date(Date.UTC(y, mo, 0)).getUTCDate() + 1 + x : x).filter((x) => x <= new Date(Date.UTC(y, mo, 0)).getUTCDate());
      cands = dias.sort((a, b) => a - b).map((d) => aInstante(ev.ini, y, mo, d));
    } else if (freq === "YEARLY") {
      const y = y0 + k * intervalo;
      cands = new Date(Date.UTC(y, mo0 - 1, d0)).getUTCMonth() === mo0 - 1 ? [aInstante(ev.ini, y, mo0, d0)] : [];
    } else return [ev.ini.ms];
    let seguir = true;
    for (const t of cands) { if (t > tope) { seguir = false; break; } if (!empujar(t)) { seguir = false; break; } }
    if (!seguir) break;
  }
  return out.filter((t) => !ev.exdates.includes(t));
}

function leerIcs(txt: string, desde: number, hasta: number) {
  const ls = lineas(txt);
  let tzDef = TZ;
  const crudos: Crudo[] = [];
  let ev: any = null, enAlarma = 0;
  for (const l of ls) {
    const p = prop(l); if (!p) continue;
    if (p.name === "X-WR-TIMEZONE" && zonaValida(p.value.trim())) tzDef = p.value.trim();
    if (p.name === "BEGIN" && p.value === "VALARM") { enAlarma++; continue; }
    if (p.name === "END" && p.value === "VALARM") { enAlarma--; continue; }
    if (enAlarma) continue;
    if (p.name === "BEGIN" && p.value === "VEVENT") { ev = { props: [] as Prop[] }; continue; }
    if (p.name === "END" && p.value === "VEVENT") { if (ev) crudos.push(ev); ev = null; continue; }
    if (ev) ev.props.push(p);
  }
  const eventos: any[] = [];
  const movidas = new Set<string>();
  const armados: Crudo[] = [];
  for (const c of crudos as any[]) {
    const g = (n: string) => c.props.find((p: Prop) => p.name === n);
    const st = g("DTSTART"); if (!st) continue;
    const ini = fecha(st, tzDef); if (!ini) continue;
    if ((g("STATUS")?.value || "").toUpperCase() === "CANCELLED") continue;
    const en = g("DTEND"), du = g("DURATION");
    const finF = en ? fecha(en, tzDef) : null;
    const finMs = finF ? finF.ms : du ? ini.ms + duracion(du.value) : null;
    const rid = g("RECURRENCE-ID"); const recId = rid ? fecha(rid, tzDef)?.ms ?? null : null;
    const uid = g("UID")?.value || crypto.randomUUID();
    const exdates: number[] = [];
    for (const p of c.props as Prop[]) if (p.name === "EXDATE") for (const v of p.value.split(",")) { const f = fecha({ ...p, value: v }, tzDef); if (f) exdates.push(f.ms); }
    const x: Crudo = { uid, titulo: desescapar(g("SUMMARY")?.value || "(sin título)"), lugar: desescapar(g("LOCATION")?.value || ""), ini, finMs, rrule: g("RRULE")?.value || null, exdates, recId };
    if (recId != null) movidas.add(uid + "|" + recId);
    armados.push(x);
  }
  for (const x of armados) {
    const dur = x.finMs != null ? Math.max(0, x.finMs - x.ini.ms) : (x.ini.diaCompleto ? 86400000 : 3600000);
    const inicios = x.recId != null ? [x.ini.ms] : desplegar(x, desde - dur, hasta, tzDef).filter((t) => !movidas.has(x.uid + "|" + t));
    for (const t of inicios) {
      if (t + dur < desde || t > hasta) continue;
      eventos.push({ uid: x.uid, start_at: new Date(t).toISOString(), end_at: new Date(t + dur).toISOString(), all_day: x.ini.diaCompleto, title: x.titulo.slice(0, 300), location: x.lugar.slice(0, 300) || null });
    }
  }
  return eventos;
}

// Solo direcciones públicas de internet (nada de localhost ni IPs sueltas).
function urlSegura(u: string) {
  try {
    const x = new URL(u.trim().replace(/^webcals?:\/\//i, "https://"));
    if (x.protocol !== "https:" && x.protocol !== "http:") return null;
    if (/^(localhost|.*\.local|.*\.internal)$/i.test(x.hostname) || /^[\d.]+$/.test(x.hostname) || x.hostname.includes(":")) return null;
    return x.toString();
  } catch { return null; }
}
async function sincronizarFuente(s: any) {
  const ahora = new Date().toISOString();
  try {
    const url = urlSegura(s.url); if (!url) throw new Error("La dirección no es válida.");
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(url, { signal: ctl.signal, headers: { "Accept": "text/calendar, */*" } });
    clearTimeout(to);
    if (!r.ok) throw new Error(r.status === 404 || r.status === 403 ? "El calendario no existe o dejó de ser público. Copia la dirección de nuevo." : `El calendario respondió ${r.status}`);
    const txt = await r.text();
    if (txt.length > 8_000_000) throw new Error("El calendario es demasiado grande.");
    if (!/BEGIN:VCALENDAR/i.test(txt)) throw new Error("Esa dirección no devuelve un calendario (.ics). Revisa que sea la dirección iCal.");
    const hoy = Date.now();
    const eventos = leerIcs(txt, hoy - 60 * 86400000, hoy + 400 * 86400000).slice(0, 5000)
      .map((e) => ({ ...e, alma_id: s.alma_id, source_id: s.id }));
    await admin.from("cal_events").delete().eq("source_id", s.id);
    for (let i = 0; i < eventos.length; i += 500) {
      const { error } = await admin.from("cal_events").insert(eventos.slice(i, i + 500));
      if (error) throw error;
    }
    await admin.from("cal_sources").update({ last_sync_at: ahora, last_ok: true, last_msg: `${eventos.length} evento${eventos.length === 1 ? "" : "s"}`, n_events: eventos.length }).eq("id", s.id);
    return { ok: true, n: eventos.length };
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "El calendario tardó demasiado en responder." : ((e as Error).message || String(e));
    await admin.from("cal_sources").update({ last_sync_at: ahora, last_ok: false, last_msg: msg }).eq("id", s.id);
    return { ok: false, msg };
  }
}

// ---------------------------------------------------------------
function token() { const b = crypto.getRandomValues(new Uint8Array(24)); return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); }
function enlaces(t: string) {
  const https = `${SUPABASE_URL}/functions/v1/calendario?t=${t}`;
  const webcal = https.replace(/^https:/, "webcal:");
  return { https, webcal, google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` };
}
async function almaDelUsuario(req: Request, almaId: string) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt || !almaId) return false;
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return false;
  const { data } = await admin.from("almas").select("id").eq("id", almaId).eq("user_id", u.user.id).maybeSingle();
  return !!data;
}
function iguales(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    if (req.method === "GET" || req.method === "HEAD") {
      const t = url.searchParams.get("t") || "";
      if (!/^[0-9a-f]{48}$/.test(t)) return new Response("Falta el enlace", { status: 404, headers: CORS });
      return await ics(t);
    }
    const body = JSON.parse((await req.text()) || "{}");
    if (body.action === "cron") {
      const { data: llave } = await admin.rpc("meta_secret_get", { p_name: "meta_leads_cron_key" });
      if (!llave || !iguales(req.headers.get("x-cron-key") || "", String(llave))) return json({ ok: false }, 401);
      const { data: fs } = await admin.from("cal_sources").select("*").limit(200);
      let ok = 0; for (const s of fs || []) if ((await sincronizarFuente(s)).ok) ok++;
      return json({ ok: true, fuentes: (fs || []).length, bien: ok });
    }
    const almaId = String(body.alma_id || "");
    if (!(await almaDelUsuario(req, almaId))) return json({ ok: false, msg: "Sesión no válida." }, 401);
    switch (body.action) {
      case "feed": case "regenerar": {
        let { data: f } = await admin.from("cal_feeds").select("token,last_read_at").eq("alma_id", almaId).maybeSingle();
        if (!f || body.action === "regenerar") {
          const t = token();
          await admin.from("cal_feeds").upsert({ alma_id: almaId, token: t, created_at: new Date().toISOString(), last_read_at: null }, { onConflict: "alma_id" });
          f = { token: t, last_read_at: null };
        }
        return json({ ok: true, ...enlaces(f.token), leido: f.last_read_at });
      }
      case "sync": {
        let q = admin.from("cal_sources").select("*").eq("alma_id", almaId);
        if (body.source_id) q = q.eq("id", String(body.source_id));
        const { data: fs } = await q;
        const res = []; for (const s of fs || []) res.push({ id: s.id, ...(await sincronizarFuente(s)) });
        return json({ ok: res.every((x) => x.ok), res });
      }
      default: return json({ ok: false, msg: "Acción desconocida." }, 400);
    }
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("calendario", msg);
    return json({ ok: false, msg }, 500);
  }
});
