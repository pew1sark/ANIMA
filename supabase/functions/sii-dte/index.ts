// ===========================================================
// ANIMA TSC — Edge Function: sii-dte
//
// Facturación electrónica de STUDIO → Taller → Facturas. Firma los DTE con el
// certificado del Alma y los envía directo al SII.
//
// PUERTAS (todas con la sesión del Alma; `alma_id` es suyo o no pasa)
//   { action: "guardar_emisor", alma_id, emisor: {...}, confirmar_produccion? }
//   { action: "subir_certificado", alma_id, pfx_b64, clave }
//   { action: "quitar_certificado", alma_id }
//   { action: "subir_caf", alma_id, xml }
//   { action: "emitir", alma_id, tipo, fecha?, receptor, items, referencia?, forma_pago?, vencimiento? }
//   { action: "enviar", alma_id, documento_id }      reintenta un documento firmado sin enviar
//   { action: "consultar", alma_id, documento_id }   pregunta al SII cómo va
//
// EL CERTIFICADO Y LOS CAF NO SALEN DE AQUÍ: viven en Vault (sii_*).
// El navegador solo lee sus filas por RLS; nunca escribe.
//
// Deploy: supabase functions deploy sii-dte      (verify_jwt activo: no hay cron)
// ===========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import forge from "https://esm.sh/node-forge@1.3.1";
import { armarDte, armarSobre, calcular, leerCaf, lat, rutLimpio, RUT_GENERICO, TIPOS,
         type Emisor, type Firmante, type Pedido } from "./dte.ts";
import { consultar, enviar, token, type Ambiente } from "./sii.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class Rechazo extends Error {}   // error que se le explica al Alma tal cual
const no = (msg: string): never => { throw new Rechazo(msg); };

// ---------------------------------------------------------------
// Sesión y secretos
// ---------------------------------------------------------------
async function almaDelUsuario(req: Request, almaId: string): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt || !almaId) return false;
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return false;
  const { data } = await admin.from("almas").select("id").eq("id", almaId).eq("user_id", u.user.id).maybeSingle();
  return !!data;
}
async function secreto(nombre: string): Promise<string | null> {
  const { data, error } = await admin.rpc("sii_secret_get", { p_name: nombre });
  if (error) throw error;
  return (data as string) || null;
}
async function guardarSecreto(nombre: string, valor: string) {
  const { error } = await admin.rpc("sii_secret_set", { p_name: nombre, p_value: valor });
  if (error) throw error;
}
const nombreCert = (a: string) => `sii_cert_${a}`;
const nombreCaf = (a: string, amb: string, tipo: number, desde: number) => `sii_caf_${a}_${amb}_${tipo}_${desde}`;

async function emisorDe(almaId: string) {
  const { data } = await admin.from("sii_emisor").select("*").eq("alma_id", almaId).maybeSingle();
  if (!data) no("Primero completa los datos del emisor en Configuración.");
  return data as Emisor & { ambiente: Ambiente; cert_vence: string | null };
}
async function firmanteDe(almaId: string): Promise<Firmante> {
  const raw = await secreto(nombreCert(almaId));
  if (!raw) no("Falta el certificado digital. Súbelo en Configuración.");
  return JSON.parse(raw!) as Firmante;
}

// ---------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------
const fechaOk = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const hoyChile = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

async function guardarEmisor(almaId: string, body: any) {
  const x = body.emisor || {};
  const rut = rutLimpio(x.rut), rutEnvia = rutLimpio(x.rut_envia);
  if (!rut) no("El RUT del emisor no es válido.");
  if (!rutEnvia) no("El RUT del titular del certificado no es válido.");
  const campos = { razon_social: lat(x.razon_social, 100), giro: lat(x.giro, 80), direccion: lat(x.direccion, 70), comuna: lat(x.comuna, 20) };
  for (const [k, v] of Object.entries(campos)) if (!v) no(`Falta ${k.replace("_", " ")}.`);
  const acteco = Number(x.acteco);
  if (!Number.isInteger(acteco) || acteco < 1 || acteco > 999999) no("El código de actividad económica no es válido.");
  if (!fechaOk(x.resol_fecha)) no("La fecha de resolución no es válida.");
  const ambiente: Ambiente = x.ambiente === "produccion" ? "produccion" : "certificacion";
  const { data: previo } = await admin.from("sii_emisor").select("ambiente").eq("alma_id", almaId).maybeSingle();
  if (ambiente === "produccion" && previo?.ambiente !== "produccion" && body.confirmar_produccion !== true)
    no("Pasar a producción emite documentos con valor tributario real. Confirma el cambio.");
  const fila = {
    alma_id: almaId, rut, rut_envia: rutEnvia, ...campos, acteco, ciudad: lat(x.ciudad, 20) || null, email: lat(x.email, 80) || null,
    resol_fecha: x.resol_fecha, resol_numero: Math.max(0, Math.trunc(Number(x.resol_numero) || 0)), ambiente,
    actualizado_en: new Date().toISOString(),
  };
  const { error } = await admin.from("sii_emisor").upsert(fila, { onConflict: "alma_id" });
  if (error) throw error;
  return json({ ok: true });
}

/** .pfx → llave y certificado en PEM, que quedan cifrados en Vault. */
async function subirCertificado(almaId: string, body: any) {
  const e = await emisorDe(almaId);
  let bytes: string;
  try { bytes = atob(String(body.pfx_b64 || "")); } catch { return no("El archivo del certificado no llegó completo."); }
  if (!bytes) no("Falta el archivo del certificado.");
  let p12: any;
  try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytes), String(body.clave ?? "")); }
  catch { return no("No se pudo abrir el certificado: revisa el archivo y la clave."); }
  const llaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((b: any) => b.cert);
  const llave = llaves[0]?.key;
  if (!llave || !certs.length) no("El archivo no trae llave y certificado.");
  // El certificado que corresponde a la llave (el archivo puede traer la cadena).
  const cert = certs.find((c: any) => c.publicKey.n.equals(llave.n)) || certs[0];
  const vence: Date = cert.validity.notAfter;
  if (vence.getTime() < Date.now()) no("Ese certificado está vencido.");
  await guardarSecreto(nombreCert(almaId), JSON.stringify({
    llavePem: forge.pki.privateKeyToPem(llave), certPem: forge.pki.certificateToPem(cert),
  }));
  await admin.from("sii_emisor").update({ cert_vence: vence.toISOString().slice(0, 10), actualizado_en: new Date().toISOString() }).eq("alma_id", almaId);
  return json({ ok: true, vence: vence.toISOString().slice(0, 10), titular: e.rut_envia });
}

async function subirCaf(almaId: string, body: any) {
  const e = await emisorDe(almaId);
  let caf;
  try { caf = leerCaf(String(body.xml || "")); } catch (err) { return no((err as Error).message); }
  if (caf.rut !== e.rut) no(`Ese CAF es del RUT ${caf.rut}, no del emisor ${e.rut}.`);
  if (!(TIPOS as readonly number[]).includes(caf.tipo)) no(`ANIMA no emite documentos tipo ${caf.tipo}.`);
  const { data: choque } = await admin.from("sii_folios").select("id").eq("alma_id", almaId).eq("ambiente", e.ambiente).eq("tipo", caf.tipo)
    .lte("desde", caf.hasta).gte("hasta", caf.desde).limit(1);
  if (choque?.length) no("Esos folios ya están cargados.");
  await guardarSecreto(nombreCaf(almaId, e.ambiente, caf.tipo, caf.desde), String(body.xml));
  const { error } = await admin.from("sii_folios").insert({
    alma_id: almaId, ambiente: e.ambiente, tipo: caf.tipo, desde: caf.desde, hasta: caf.hasta, siguiente: caf.desde, autorizado: caf.fecha,
  });
  if (error) throw error;
  return json({ ok: true, tipo: caf.tipo, desde: caf.desde, hasta: caf.hasta });
}

// ---------------------------------------------------------------
// Emitir
// ---------------------------------------------------------------
function validarPedido(body: any): Omit<Pedido, "folio"> {
  const tipo = Number(body.tipo);
  if (!(TIPOS as readonly number[]).includes(tipo)) no("Tipo de documento no válido.");
  const fecha = body.fecha || hoyChile();
  if (!fechaOk(fecha)) no("La fecha no es válida.");
  const r = body.receptor || {};
  let rut = rutLimpio(r.rut);
  if (tipo === 39) rut = rut || RUT_GENERICO;
  else if (!rut) no("El RUT del receptor no es válido.");
  if (tipo !== 39) {
    if (!lat(r.razon_social)) no("Falta la razón social del receptor.");
    if (!lat(r.giro)) no("Falta el giro del receptor.");
    if (!lat(r.direccion) || !lat(r.comuna)) no("Faltan dirección y comuna del receptor.");
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) no("Agrega al menos una línea.");
  if (items.length > 60) no("Máximo 60 líneas por documento.");
  const lim = items.map((i: any, n: number) => {
    const cantidad = Number(i.cantidad), precio = Number(i.precio);
    if (!lat(i.nombre)) no(`La línea ${n + 1} no tiene nombre.`);
    if (!(cantidad > 0) || cantidad > 1e6) no(`La cantidad de la línea ${n + 1} no es válida.`);
    if (!Number.isInteger(precio) || precio <= 0) no(`El precio de la línea ${n + 1} debe ser en pesos enteros y mayor que cero.`);
    return { nombre: lat(i.nombre, 80), descripcion: lat(i.descripcion, 1000), unidad: lat(i.unidad, 4), cantidad, precio, exento: !!i.exento };
  });
  const { t } = calcular(tipo, lim);
  if (t.total <= 0) no("El total debe ser mayor que cero.");
  let referencia = null;
  if (tipo === 61) {
    const f = body.referencia || {};
    if (!(f.folio > 0) || !fechaOk(f.fecha) || ![1, 2, 3].includes(Number(f.codigo)) || !(TIPOS as readonly number[]).includes(Number(f.tipo_doc)))
      no("La nota de crédito necesita el documento que corrige (tipo, folio, fecha y motivo).");
    referencia = { tipo_doc: Number(f.tipo_doc), folio: Number(f.folio), fecha: f.fecha, codigo: Number(f.codigo) as 1 | 2 | 3, razon: lat(f.razon, 90) };
  }
  return {
    tipo: tipo as Pedido["tipo"], fecha, items: lim, referencia,
    receptor: { rut: rut!, razon_social: lat(r.razon_social, 100), giro: lat(r.giro, 40), direccion: lat(r.direccion, 70), comuna: lat(r.comuna, 20), ciudad: lat(r.ciudad, 20), email: lat(r.email, 80) },
    forma_pago: [1, 2, 3].includes(Number(body.forma_pago)) ? (Number(body.forma_pago) as 1 | 2 | 3) : undefined,
    vencimiento: fechaOk(body.vencimiento) ? body.vencimiento : null,
  };
}

async function emitir(almaId: string, body: any) {
  const e = await emisorDe(almaId);
  const f = await firmanteDe(almaId);
  const pedido = validarPedido(body);        // todo se valida ANTES de gastar un folio
  const { data: tomado, error: et } = await admin.rpc("sii_tomar_folio", { p_alma: almaId, p_ambiente: e.ambiente, p_tipo: pedido.tipo });
  if (et) throw et;
  const toma = (tomado as { folio_id: string; folio: number }[] | null)?.[0];
  if (!toma) no("No quedan folios de este tipo. Sube un CAF nuevo en Configuración.");
  const { data: rango } = await admin.from("sii_folios").select("desde").eq("id", toma!.folio_id).single();
  const cafXml = await secreto(nombreCaf(almaId, e.ambiente, pedido.tipo, rango!.desde));
  if (!cafXml) no("No se encontró el CAF de ese folio. Vuelve a subirlo.");
  const { dte, t } = armarDte({ ...pedido, folio: toma!.folio }, e, leerCaf(cafXml!), f);
  const xml = armarSobre([{ dte, tipo: pedido.tipo }], e, f);
  const { data: doc, error } = await admin.from("sii_documentos").insert({
    alma_id: almaId, ambiente: e.ambiente, tipo: pedido.tipo, folio: toma!.folio, fecha_emision: pedido.fecha,
    receptor: pedido.receptor, items: pedido.items, referencia: pedido.referencia, neto: t.neto, exento: t.exento, iva: t.iva, total: t.total,
    estado: "firmado", xml,
  }).select("id").single();
  if (error) throw error;
  return await enviarDoc(almaId, doc.id, true);
}

async function cargarDoc(almaId: string, id: string) {
  const { data } = await admin.from("sii_documentos").select("*").eq("id", String(id)).eq("alma_id", almaId).maybeSingle();
  return data || no("No existe ese documento.");
}

async function enviarDoc(almaId: string, id: string, recienEmitido = false) {
  const d: any = await cargarDoc(almaId, id);
  if (d.estado !== "firmado" && d.estado !== "error") no("Ese documento ya fue enviado.");
  const e = await emisorDe(almaId);
  if (d.ambiente !== e.ambiente) no("Ese documento es de otro ambiente del SII.");
  const f = await firmanteDe(almaId);
  const boleta = d.tipo === 39;
  try {
    const tok = await token(e.ambiente, f, boleta);
    const track = await enviar(e.ambiente, tok, d.xml, e.rut_envia, e.rut, boleta, `${d.tipo}_${d.folio}.xml`);
    await admin.from("sii_documentos").update({ estado: "enviado", track_id: track, glosa: "Enviado al SII.", actualizado_en: new Date().toISOString() }).eq("id", id);
    return json({ ok: true, id, folio: d.folio, track_id: track, estado: "enviado" });
  } catch (err) {
    const msg = (err as Error).message;
    await admin.from("sii_documentos").update({ estado: "error", glosa: msg.slice(0, 300), actualizado_en: new Date().toISOString() }).eq("id", id);
    // Está firmado y con folio: no se pierde. Se reintenta con «enviar».
    return json({ ok: false, id, folio: d.folio, estado: "error", msg: `El documento quedó firmado (folio ${d.folio}) pero no se pudo enviar: ${msg}` }, recienEmitido ? 200 : 502);
  }
}

async function consultarDoc(almaId: string, id: string) {
  const d: any = await cargarDoc(almaId, id);
  if (!d.track_id) no("Ese documento aún no se envía al SII.");
  const e = await emisorDe(almaId);
  const f = await firmanteDe(almaId);
  const boleta = d.tipo === 39;
  const tok = await token(e.ambiente, f, boleta);
  const r = await consultar(e.ambiente, tok, d.track_id, e.rut, boleta);
  await admin.from("sii_documentos").update({ estado: r.estado, glosa: r.glosa.slice(0, 300), actualizado_en: new Date().toISOString() }).eq("id", id);
  return json({ ok: true, id, estado: r.estado, glosa: r.glosa });
}

// ---------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  try {
    const body = JSON.parse((await req.text()) || "{}");
    const almaId = String(body.alma_id || "");
    if (!(await almaDelUsuario(req, almaId))) return json({ ok: false, msg: "Sesión no válida." }, 401);
    switch (body.action) {
      case "guardar_emisor":     return await guardarEmisor(almaId, body);
      case "subir_certificado":  return await subirCertificado(almaId, body);
      case "quitar_certificado":
        await admin.rpc("sii_secret_forget", { p_name: nombreCert(almaId) });
        await admin.from("sii_emisor").update({ cert_vence: null }).eq("alma_id", almaId);
        return json({ ok: true });
      case "subir_caf":          return await subirCaf(almaId, body);
      case "emitir":             return await emitir(almaId, body);
      case "enviar":             return await enviarDoc(almaId, String(body.documento_id));
      case "consultar":          return await consultarDoc(almaId, String(body.documento_id));
      default: return json({ ok: false, msg: "Acción desconocida." }, 400);
    }
  } catch (e) {
    if (e instanceof Rechazo) return json({ ok: false, msg: e.message }, 400);
    // Lo inesperado se registra completo, pero al navegador no le llega el detalle.
    console.error("sii-dte", (e as Error).message || e);
    return json({ ok: false, msg: "Algo falló al procesar el documento. Intenta de nuevo." }, 500);
  }
});
