// ===========================================================
// ANIMA TSC — sii-dte · conversación con el SII
//
// Facturas y notas (33, 34, 61) usan los servicios clásicos (SOAP + carga
// por formulario). Las boletas (39) usan la API REST propia del SII.
// Cada ambiente tiene su host: certificación (pruebas) y producción.
//
// Los hosts y formatos de respuesta salen de la documentación pública del
// SII; hay que confirmarlos en certificación antes de pasar a producción.
// ===========================================================
import { aLatin1, firmarSemilla, type Firmante } from "./dte.ts";

export type Ambiente = "certificacion" | "produccion";

const HOST = {
  certificacion: { dte: "https://maullin.sii.cl", apiBoleta: "https://apicert.sii.cl", envioBoleta: "https://pangal.sii.cl" },
  produccion:    { dte: "https://palena.sii.cl",  apiBoleta: "https://api.sii.cl",     envioBoleta: "https://rahue.sii.cl" },
};
// El SII rechaza clientes que no se presentan así.
const UA = "Mozilla/4.0 (compatible; PROG 1.0; Windows NT 5.0; YComp 5.0.2.4)";

const desescapar = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const etiqueta = (xml: string, t: string) => new RegExp(`<(?:\\w+:)?${t}>([\\s\\S]*?)</(?:\\w+:)?${t}>`).exec(xml)?.[1]?.trim() ?? null;

async function pedir(url: string, init: RequestInit, ms = 25_000): Promise<string> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms), headers: { "User-Agent": UA, ...(init.headers || {}) } });
  const txt = await r.text();
  if (!r.ok && !txt) throw new Error(`El SII respondió ${r.status}.`);
  return txt;
}
const soap = (ns: string, metodo: string, cuerpo: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:def="${ns}"><soapenv:Body><def:${metodo}>${cuerpo}</def:${metodo}></soapenv:Body></soapenv:Envelope>`;
const cabeceraSoap = { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" };

/** Token de sesión (vale unos minutos; se pide uno por operación). */
export async function token(amb: Ambiente, f: Firmante, esBoleta: boolean): Promise<string> {
  if (esBoleta) {
    const base = HOST[amb].apiBoleta + "/recursos/v1/boleta.electronica";
    const semilla = etiqueta(await pedir(base + ".semilla", { method: "GET" }), "SEMILLA");
    if (!semilla) throw new Error("El SII no entregó la semilla.");
    const t = etiqueta(await pedir(base + ".token", { method: "POST", headers: { "Content-Type": "application/xml" }, body: firmarSemilla(semilla, f) }), "TOKEN");
    if (!t) throw new Error("El SII no entregó el token: revisa que el certificado esté autorizado.");
    return t;
  }
  const dte = HOST[amb].dte + "/DTEWS";
  const rs = desescapar(await pedir(dte + "/CrSeed.jws", { method: "POST", headers: cabeceraSoap, body: soap("http://DefaultNamespace", "getSeed", "") }));
  const semilla = etiqueta(rs, "SEMILLA");
  if (!semilla) throw new Error("El SII no entregó la semilla.");
  const firmada = firmarSemilla(semilla, f).replace(/^<\?xml[^>]*\?>\s*/, "");
  const rt = desescapar(await pedir(dte + "/GetTokenFromSeed.jws", {
    method: "POST", headers: cabeceraSoap,
    body: soap("http://DefaultNamespace", "getToken", `<pszXml><![CDATA[${firmada}]]></pszXml>`),
  }));
  const t = etiqueta(rt, "TOKEN");
  if (!t) throw new Error(`El SII no entregó el token (${etiqueta(rt, "GLOSA") || "revisa el certificado"}).`);
  return t;
}

const partesRut = (r: string) => r.split("-") as [string, string];

/** Sube el sobre. Devuelve el track_id con el que se consulta después. */
export async function enviar(amb: Ambiente, tok: string, xml: string, rutEnvia: string, rutEmisor: string, esBoleta: boolean, nombre: string): Promise<string> {
  const [se, sd] = partesRut(rutEnvia), [ce, cd] = partesRut(rutEmisor);
  const form = new FormData();
  form.set("rutSender", se); form.set("dvSender", sd); form.set("rutCompany", ce); form.set("dvCompany", cd);
  form.set("archivo", new Blob([aLatin1(xml)], { type: "text/xml" }), nombre);
  const url = esBoleta ? HOST[amb].envioBoleta + "/recursos/v1/boleta.electronica.envio" : HOST[amb].dte + "/cgi_dte/UPL/DTEUpload";
  const txt = await pedir(url, { method: "POST", headers: { Cookie: `TOKEN=${tok}` }, body: form }, 60_000);
  let track: string | null = null, estado: string | null = null;
  if (esBoleta) {
    try { const j = JSON.parse(txt); track = j.trackid != null ? String(j.trackid) : null; estado = j.estado ?? null; } catch { /* no era JSON */ }
  } else {
    track = etiqueta(txt, "TRACKID"); estado = etiqueta(txt, "STATUS");
    if (estado && estado !== "0") throw new Error(`El SII no recibió el envío (código ${estado}).`);
  }
  if (!track || track === "0") throw new Error("El SII no entregó número de seguimiento. " + txt.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200));
  return track;
}

export type EstadoDoc = "enviado" | "aceptado" | "reparos" | "rechazado";
export interface Consulta { estado: EstadoDoc; glosa: string }

/** Estado de un envío ya subido. */
export async function consultar(amb: Ambiente, tok: string, track: string, rutEmisor: string, esBoleta: boolean): Promise<Consulta> {
  const [ce, cd] = partesRut(rutEmisor);
  if (esBoleta) {
    const txt = await pedir(`${HOST[amb].apiBoleta}/recursos/v1/boleta.electronica.envio/${ce}-${cd}-${track}`, { method: "GET", headers: { Cookie: `TOKEN=${tok}` } });
    let j: any = {}; try { j = JSON.parse(txt); } catch { /* texto plano */ }
    const est = String(j.estado || "").toUpperCase(), s = j.estadistica?.[0] || {};
    if (est === "EPR") {
      if (Number(s.rechazados) > 0) return { estado: "rechazado", glosa: "El SII rechazó la boleta." };
      if (Number(s.reparos) > 0) return { estado: "reparos", glosa: "Aceptada con reparos." };
      return { estado: "aceptado", glosa: "Aceptada por el SII." };
    }
    return mapaEnvio(est, "");
  }
  const rs = desescapar(await pedir(HOST[amb].dte + "/DTEWS/QueryEstUp.jws", {
    method: "POST", headers: cabeceraSoap,
    body: soap("http://DefaultNamespace", "getEstUp", `<RutCompania>${ce}</RutCompania><DvCompania>${cd}</DvCompania><TrackId>${track}</TrackId><Token>${tok}</Token>`),
  }));
  const est = (etiqueta(rs, "ESTADO") || "").toUpperCase(), glosa = etiqueta(rs, "GLOSA") || "";
  if (est === "EPR") {
    const n = (t: string) => Number(etiqueta(rs, t) || 0);
    if (n("RECHAZADOS") > 0) return { estado: "rechazado", glosa: glosa || "El SII rechazó el documento." };
    if (n("REPAROS") > 0) return { estado: "reparos", glosa: glosa || "Aceptado con reparos." };
    if (n("ACEPTADOS") > 0) return { estado: "aceptado", glosa: glosa || "Aceptado por el SII." };
    return { estado: "enviado", glosa: glosa || "En proceso." };
  }
  return mapaEnvio(est, glosa);
}

// Estados del envío mientras el SII aún no termina de procesarlo, o que lo
// descartan entero (esquema o firma inválidos).
function mapaEnvio(est: string, glosa: string): Consulta {
  if (["RSC", "RFR", "RCT", "RCH", "-11"].includes(est)) return { estado: "rechazado", glosa: glosa || `El SII rechazó el envío (${est}).` };
  if (est === "RPR") return { estado: "reparos", glosa: glosa || "Aceptado con reparos." };
  return { estado: "enviado", glosa: glosa || "En proceso en el SII." };
}
