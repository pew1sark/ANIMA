// ===========================================================
// ANIMA TSC — sii-dte · documentos tributarios electrónicos
//
// Todo lo que NO habla con la red: validar RUT, calcular totales, armar el
// XML del DTE, timbrarlo con el CAF y firmarlo con el certificado.
// Solo usa `node:crypto` para poder probarse igual en Deno y en Node
// (supabase/tests/sii_dte.test.mjs).
//
// EL XML SE FIRMA POR CONSTRUCCIÓN
// El SII exige XMLDSig sobre la forma canónica (C14N 1.0). En vez de traer
// una librería, el XML se arma como un árbol pequeño y `c14n()` lo escribe
// en forma canónica; ese mismo texto es el que se firma y el que se envía,
// así lo firmado y lo enviado no pueden diferir.
// ===========================================================
import { createHash, createSign, X509Certificate } from "node:crypto";

export const NS_SII = "http://www.sii.cl/SiiDte";
export const NS_XSI = "http://www.w3.org/2001/XMLSchema-instance";
export const NS_DSIG = "http://www.w3.org/2000/09/xmldsig#";
export const TASA_IVA = 19;
export const TIPOS = [33, 34, 39, 61] as const;
export type Tipo = (typeof TIPOS)[number];
export const NOMBRE_TIPO: Record<number, string> = {
  33: "Factura electrónica", 34: "Factura exenta electrónica", 39: "Boleta electrónica", 61: "Nota de crédito electrónica",
};

// ---------------------------------------------------------------
// Texto: el SII recibe ISO-8859-1
// ---------------------------------------------------------------
export function lat(s: unknown, max = 0): string {
  let t = String(s ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  t = t.replace(/[^\u0000-ÿ]/g, (c) => {
    const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return /^[ -ÿ]$/.test(base) ? base : "?";
  });
  return max ? t.slice(0, max) : t;
}
export const aLatin1 = (s: string) => Uint8Array.from(Array.from(s, (c) => c.charCodeAt(0) & 0xff));

// ---------------------------------------------------------------
// RUT
// ---------------------------------------------------------------
export function dvRut(cuerpo: string): string {
  let suma = 0, m = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) { suma += Number(cuerpo[i]) * m; m = m === 7 ? 2 : m + 1; }
  const r = 11 - (suma % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}
/** "76.123.456-7" → "76123456-7"; null si no es un RUT válido. */
export function rutLimpio(r: unknown): string | null {
  const t = String(r ?? "").replace(/[.\s]/g, "").toUpperCase();
  const m = /^(\d{1,8})-?([\dK])$/.exec(t);
  if (!m) return null;
  const cuerpo = String(Number(m[1]));
  return dvRut(cuerpo) === m[2] ? `${cuerpo}-${m[2]}` : null;
}

// ---------------------------------------------------------------
// Totales
// ---------------------------------------------------------------
export interface ItemIn { nombre: string; cantidad: number; precio: number; exento?: boolean; unidad?: string; descripcion?: string }
export interface Linea extends ItemIn { monto: number }
export interface Totales { neto: number; exento: number; iva: number; total: number }

/** Boleta: los precios incluyen IVA. Resto: precios netos. Todo en pesos enteros. */
export function calcular(tipo: number, items: ItemIn[]): { lineas: Linea[]; t: Totales } {
  const lineas = items.map((i) => ({ ...i, exento: tipo === 34 ? true : !!i.exento, monto: Math.round(i.cantidad * i.precio) }));
  const exento = lineas.filter((l) => l.exento).reduce((s, l) => s + l.monto, 0);
  const afecto = lineas.filter((l) => !l.exento).reduce((s, l) => s + l.monto, 0);
  if (tipo === 39) {
    const neto = Math.round(afecto / (1 + TASA_IVA / 100));
    return { lineas, t: { neto, exento, iva: afecto - neto, total: afecto + exento } };
  }
  const iva = Math.round((afecto * TASA_IVA) / 100);
  return { lineas, t: { neto: afecto, exento, iva, total: afecto + iva + exento } };
}

// ---------------------------------------------------------------
// Árbol XML y forma canónica
// ---------------------------------------------------------------
export type Nodo = { t: string; a?: [string, string][]; c?: (Nodo | string)[] } | { raw: string };
const esRaw = (n: Nodo): n is { raw: string } => "raw" in n;
export const el = (t: string, a: [string, string][] | null, ...c: (Nodo | string | null | undefined | false)[]): Nodo =>
  ({ t, a: a || undefined, c: c.filter((x) => x !== null && x !== undefined && x !== false) as (Nodo | string)[] });
/** Elemento con texto, omitido si no hay valor. */
export const tx = (t: string, v: unknown): Nodo | null => (v === null || v === undefined || v === "" ? null : el(t, null, String(v)));

const escTexto = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")
  .replace(/\t/g, "&#x9;").replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;");

type Ns = Map<string, string>;
/**
 * C14N 1.0 (inclusiva, sin comentarios). `ancestros` son los espacios de
 * nombres vigentes fuera del nodo: el elemento raíz de la salida los declara
 * todos, como pide la norma al canonicalizar un subárbol.
 */
export function c14n(n: Nodo | string, ancestros: Ns = new Map(), dibujados: Ns = new Map()): string {
  if (typeof n === "string") return escTexto(n);
  if (esRaw(n)) return n.raw;
  const vigentes = new Map(ancestros);
  const atributos: [string, string][] = [];
  for (const [k, v] of n.a || []) {
    if (k === "xmlns") vigentes.set("", v);
    else if (k.startsWith("xmlns:")) vigentes.set(k.slice(6), v);
    else atributos.push([k, v]);
  }
  const nuevos = new Map(dibujados);
  const decl: [string, string][] = [];
  for (const [p, u] of [...vigentes].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))) {
    if (dibujados.get(p) !== u && !(p === "" && u === "" && !dibujados.has(""))) {
      decl.push([p ? `xmlns:${p}` : "xmlns", u]);
      nuevos.set(p, u);
    }
  }
  // Sin prefijo primero; después los prefijados por URI de su espacio.
  const uriDe = (q: string) => (q.includes(":") ? vigentes.get(q.split(":")[0]) || "" : "");
  atributos.sort((x, y) => {
    const ux = uriDe(x[0]), uy = uriDe(y[0]);
    if (ux !== uy) return ux < uy ? -1 : 1;
    const lx = x[0].split(":").pop()!, ly = y[0].split(":").pop()!;
    return lx < ly ? -1 : lx > ly ? 1 : 0;
  });
  const ats = [...decl, ...atributos].map(([k, v]) => ` ${k}="${escAttr(v)}"`).join("");
  const hijos = (n.c || []).map((h) => c14n(h, vigentes, nuevos)).join("");
  return `<${n.t}${ats}>${hijos}</${n.t}>`;
}

// ---------------------------------------------------------------
// Firma XMLDSig (RSA-SHA1: es lo que el SII acepta)
// ---------------------------------------------------------------
export interface Firmante { llavePem: string; certPem: string }
const sha1b64 = (s: string) => createHash("sha1").update(s, "utf8").digest("base64");
const rsab64 = (s: string, llavePem: string) => createSign("RSA-SHA1").update(s, "utf8").sign(llavePem, "base64");
const cuerpoPem = (pem: string) => pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
const b64url = (s: string) => Buffer.from(s, "base64url").toString("base64");

export function firmar(objetivo: Nodo, uri: string, ancestros: Ns, f: Firmante, enveloped = false): Nodo {
  const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
  const digest = sha1b64(c14n(objetivo, ancestros));
  const info = el("SignedInfo", null,
    el("CanonicalizationMethod", [["Algorithm", C14N]]),
    el("SignatureMethod", [["Algorithm", NS_DSIG + "rsa-sha1"]]),
    el("Reference", [["URI", uri]],
      el("Transforms", null,
        enveloped ? el("Transform", [["Algorithm", NS_DSIG + "enveloped-signature"]]) : null,
        el("Transform", [["Algorithm", C14N]])),
      el("DigestMethod", [["Algorithm", NS_DSIG + "sha1"]]),
      el("DigestValue", null, digest)));
  const ctx = new Map(ancestros); ctx.set("", NS_DSIG);
  const valor = rsab64(c14n(info, ctx), f.llavePem);
  const jwk = new X509Certificate(f.certPem).publicKey.export({ format: "jwk" }) as { n: string; e: string };
  return el("Signature", [["xmlns", NS_DSIG]], info,
    el("SignatureValue", null, valor),
    el("KeyInfo", null,
      el("KeyValue", null, el("RSAKeyValue", null, el("Modulus", null, b64url(jwk.n)), el("Exponent", null, b64url(jwk.e)))),
      el("X509Data", null, el("X509Certificate", null, cuerpoPem(f.certPem)))));
}

// ---------------------------------------------------------------
// CAF (código de autorización de folios)
// ---------------------------------------------------------------
export interface Caf { rut: string; razon: string; tipo: number; desde: number; hasta: number; fecha: string; llavePem: string; raw: string }
export function leerCaf(xml: string): Caf {
  const g = (re: RegExp) => { const m = re.exec(xml); if (!m) throw new Error("El CAF no tiene el formato esperado."); return m[1].trim(); };
  const raw = /<CAF[\s>][\s\S]*?<\/CAF>/.exec(xml)?.[0];
  if (!raw) throw new Error("El archivo no contiene un CAF.");
  return {
    rut: g(/<RE>([^<]+)<\/RE>/), razon: g(/<RS>([^<]*)<\/RS>/), tipo: Number(g(/<TD>(\d+)<\/TD>/)),
    desde: Number(g(/<RNG>\s*<D>(\d+)<\/D>/)), hasta: Number(g(/<RNG>[\s\S]*?<H>(\d+)<\/H>/)), fecha: g(/<FA>([^<]+)<\/FA>/),
    llavePem: g(/<RSASK>([\s\S]*?)<\/RSASK>/).replace(/\r/g, ""),
    raw: raw.replace(/>\s+</g, "><").trim(),
  };
}

// ---------------------------------------------------------------
// Documento
// ---------------------------------------------------------------
export interface Emisor {
  rut: string; razon_social: string; giro: string; acteco: number; direccion: string; comuna: string;
  ciudad?: string | null; email?: string | null; rut_envia: string; resol_fecha: string; resol_numero: number;
}
export interface Receptor { rut: string; razon_social?: string; giro?: string; direccion?: string; comuna?: string; ciudad?: string; email?: string }
export interface Referencia { tipo_doc: number; folio: number; fecha: string; codigo: 1 | 2 | 3; razon?: string }
export interface Pedido {
  tipo: Tipo; folio: number; fecha: string; receptor: Receptor; items: ItemIn[]; referencia?: Referencia | null;
  forma_pago?: 1 | 2 | 3; vencimiento?: string | null;
}
export const RUT_GENERICO = "66666666-6";
const RUT_SII = "60803000-K";

export function armarDte(p: Pedido, e: Emisor, caf: Caf, f: Firmante, ahora = new Date()): { dte: Nodo; id: string; t: Totales } {
  const { lineas, t } = calcular(p.tipo, p.items);
  const boleta = p.tipo === 39;
  const id = `F${p.folio}T${p.tipo}`;
  const marca = new Date(ahora.getTime() - 3 * 3600_000).toISOString().slice(0, 19);   // hora de Chile aprox.; el SII solo pide formato
  const rr = p.receptor.rut;

  // Timbre electrónico: se firma el DD con la llave del CAF.
  const dd = el("DD", null,
    el("RE", null, e.rut), el("TD", null, String(p.tipo)), el("F", null, String(p.folio)), el("FE", null, p.fecha),
    el("RR", null, rr), el("RSR", null, lat(p.receptor.razon_social || "Sin nombre", 40)),
    el("MNT", null, String(t.total)), el("IT1", null, lat(lineas[0].nombre, 40)),
    { raw: caf.raw }, el("TSTED", null, marca));
  const ddTexto = c14n(dd);
  const frmt = createSign("RSA-SHA1").update(Buffer.from(aLatin1(ddTexto))).sign(caf.llavePem, "base64");
  const ted = el("TED", [["version", "1.0"]], dd, el("FRMT", [["algoritmo", "SHA1withRSA"]], frmt));

  const idDoc = el("IdDoc", null,
    el("TipoDTE", null, String(p.tipo)), el("Folio", null, String(p.folio)), el("FchEmis", null, p.fecha),
    boleta ? el("IndServicio", null, "3") : null,
    !boleta && p.forma_pago ? el("FmaPago", null, String(p.forma_pago)) : null,
    !boleta ? tx("FchVenc", p.vencimiento) : null);
  const emisor = el("Emisor", null,
    el("RUTEmisor", null, e.rut), el(boleta ? "RznSocEmisor" : "RznSoc", null, lat(e.razon_social, 100)),
    el(boleta ? "GiroEmisor" : "GiroEmis", null, lat(e.giro, 80)),
    !boleta ? tx("CorreoEmisor", lat(e.email, 80)) : null,
    !boleta ? el("Acteco", null, String(e.acteco)) : null,
    el("DirOrigen", null, lat(e.direccion, 70)), el("CmnaOrigen", null, lat(e.comuna, 20)), tx("CiudadOrigen", lat(e.ciudad, 20)));
  const r = p.receptor;
  const receptor = el("Receptor", null,
    el("RUTRecep", null, rr), tx("RznSocRecep", lat(r.razon_social, 100)),
    !boleta ? tx("GiroRecep", lat(r.giro, 40)) : null,
    !boleta ? tx("CorreoRecep", lat(r.email, 80)) : null,
    tx("DirRecep", lat(r.direccion, 70)), tx("CmnaRecep", lat(r.comuna, 20)), tx("CiudadRecep", lat(r.ciudad, 20)));
  const totales = el("Totales", null,
    t.neto ? el("MntNeto", null, String(t.neto)) : null,
    t.exento ? el("MntExe", null, String(t.exento)) : null,
    !boleta && t.neto ? el("TasaIVA", null, String(TASA_IVA)) : null,
    t.iva ? el("IVA", null, String(t.iva)) : null,
    el("MntTotal", null, String(t.total)));
  const detalle = lineas.map((l, i) => el("Detalle", null,
    el("NroLinDet", null, String(i + 1)), l.exento ? el("IndExe", null, "1") : null,
    el("NmbItem", null, lat(l.nombre, 80)), tx("DscItem", lat(l.descripcion, 1000)),
    el("QtyItem", null, String(l.cantidad)), tx("UnmdItem", lat(l.unidad, 4)),
    el("PrcItem", null, String(l.precio)), el("MontoItem", null, String(l.monto))));
  const ref = p.referencia ? el("Referencia", null,
    el("NroLinRef", null, "1"), el("TpoDocRef", null, String(p.referencia.tipo_doc)), el("FolioRef", null, String(p.referencia.folio)),
    el("FchRef", null, p.referencia.fecha), el("CodRef", null, String(p.referencia.codigo)), tx("RazonRef", lat(p.referencia.razon, 90))) : null;

  const documento = el("Documento", [["ID", id]],
    el("Encabezado", null, idDoc, emisor, receptor, totales), ...detalle, ref, ted, el("TmstFirma", null, marca));
  const ns: Ns = new Map([["", NS_SII], ["xsi", NS_XSI]]);
  const firma = firmar(documento, `#${id}`, ns, f);
  const dte = el("DTE", [["xmlns", NS_SII], ["xmlns:xsi", NS_XSI], ["version", "1.0"]], documento, firma);
  return { dte, id, t };
}

/** Sobre de envío (EnvioDTE / EnvioBOLETA) con uno o más DTE ya firmados. */
export function armarSobre(dtes: { dte: Nodo; tipo: number }[], e: Emisor, f: Firmante, ahora = new Date()): string {
  const boleta = dtes.every((d) => d.tipo === 39);
  const marca = new Date(ahora.getTime() - 3 * 3600_000).toISOString().slice(0, 19);
  const conteo = new Map<number, number>();
  dtes.forEach((d) => conteo.set(d.tipo, (conteo.get(d.tipo) || 0) + 1));
  const caratula = el("Caratula", [["version", "1.0"]],
    el("RutEmisor", null, e.rut), el("RutEnvia", null, e.rut_envia), el("RutReceptor", null, RUT_SII),
    el("FchResol", null, e.resol_fecha), el("NroResol", null, String(e.resol_numero)), el("TmstFirmaEnv", null, marca),
    ...[...conteo].map(([tp, n]) => el("SubTotDTE", null, el("TpoDTE", null, String(tp)), el("NroDTE", null, String(n)))));
  const set = el("SetDTE", [["ID", "SetDoc"]], caratula, ...dtes.map((d) => d.dte));
  const raizNs: Ns = new Map([["", NS_SII], ["xsi", NS_XSI]]);
  const firma = firmar(set, "#SetDoc", raizNs, f);
  const raiz = el(boleta ? "EnvioBOLETA" : "EnvioDTE", [
    ["xmlns", NS_SII], ["xmlns:xsi", NS_XSI],
    ["xsi:schemaLocation", `${NS_SII} ${boleta ? "EnvioBOLETA_v11.xsd" : "EnvioDTE_v10.xsd"}`], ["version", "1.0"]], set, firma);
  return `<?xml version="1.0" encoding="ISO-8859-1"?>\n` + c14n(raiz);
}

/** Documento con firma envuelta, para pedir el token al SII. */
export function firmarSemilla(semilla: string, f: Firmante): string {
  const raiz = el("getToken", null, el("item", null, el("Semilla", null, semilla)));
  const firma = firmar(raiz, "", new Map(), f, true);
  return `<?xml version="1.0" encoding="UTF-8"?>\n` + c14n({ t: "getToken", c: [...(raiz as { c: Nodo[] }).c, firma] });
}
