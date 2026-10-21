/* ===========================================================
   ANIMA STUDIO — Facturas (Taller)
   -----------------------------------------------------------
   Emite factura (33), factura exenta (34), boleta (39) y nota de
   crédito (61) y las envía al SII. Todo el trabajo tributario ocurre
   en la Edge Function `sii-dte` (migración 0145): aquí solo se
   pide, se muestra y se descarga.

   LO QUE NO SE GUARDA EN EL TELÉFONO
   Receptores, montos y el certificado viven en `FA`, en memoria.
   La clave del certificado se escribe, viaja a la función y no se
   guarda en ninguna parte del navegador. En `state` solo queda la
   pestaña abierta.

   Se carga ANTES que anima.js: aquí solo se declaran funciones.
   =========================================================== */

const FA = { cargado: undefined, emisor: null, folios: [], docs: [], ocupado: "", form: null, msg: "" };

const FA_TIPOS = [
  [33, "Factura electrónica", "Afecta a IVA"],
  [34, "Factura exenta", "Sin IVA"],
  [39, "Boleta electrónica", "Consumidor final · precios con IVA"],
  [61, "Nota de crédito", "Anula o corrige un documento"]
];
const FA_TIPO_T = Object.fromEntries(FA_TIPOS.map(([k, t]) => [k, t]));
const FA_ESTADOS = {
  firmado:   ["Sin enviar",   "fa-st-pend"],
  enviado:   ["En el SII",    "fa-st-pend"],
  aceptado:  ["Aceptado",     "fa-st-ok"],
  reparos:   ["Con reparos",  "fa-st-warn"],
  rechazado: ["Rechazado",    "fa-st-mal"],
  error:     ["No se envió",  "fa-st-mal"]
};
const FA_CODREF = [[1, "Anula el documento"], [2, "Corrige el texto"], [3, "Corrige los montos"]];
const FA_IVA = 19;

const faPesos = n => "$" + Number(n || 0).toLocaleString("es-CL");
const faFecha = s => String(s || "").split("-").reverse().join("-");
function faHoy(){ const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }

/* Misma cuenta que hace la función (que es la que vale): solo para la vista previa. */
function faTotales(tipo, items){
  const l = items.map(i => ({ ex: tipo === 34 || !!i.exento, m: Math.round((Number(i.cantidad) || 0) * (Number(i.precio) || 0)) }));
  const exento = l.filter(x => x.ex).reduce((s, x) => s + x.m, 0);
  const afecto = l.filter(x => !x.ex).reduce((s, x) => s + x.m, 0);
  if(tipo === 39){ const neto = Math.round(afecto / (1 + FA_IVA / 100)); return { neto, exento, iva: afecto - neto, total: afecto + exento }; }
  const iva = Math.round(afecto * FA_IVA / 100);
  return { neto: afecto, exento, iva, total: afecto + iva + exento };
}

function faFormVacio(tipo){
  return { tipo: tipo || 33, fecha: faHoy(), forma_pago: "1", vencimiento: "",
    receptor: { rut: "", razon_social: "", giro: "", direccion: "", comuna: "", ciudad: "", email: "" },
    items: [{ nombre: "", cantidad: 1, precio: "", exento: false }],
    referencia: { tipo_doc: 33, folio: "", fecha: faHoy(), codigo: 1, razon: "" } };
}

/* ---------- datos ---------- */
async function faFn(body){
  const s = await Cloud.session();
  if(!s) throw new Error("Tu sesión expiró. Vuelve a entrar.");
  const r = await fetch(SB_URL + "/functions/v1/sii-dte", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + s.access_token, "apikey": SB_KEY },
    body: JSON.stringify({ ...body, alma_id: me().almaId })
  });
  const j = await r.json().catch(() => ({}));
  if(!r.ok && !j.estado) throw new Error(j.msg || ("Error " + r.status));
  return j;
}

async function faCargar(){
  if(FA.cargando) return;
  FA.cargando = true;
  try{
    const c = Cloud.client;
    const [e, f, d] = await Promise.all([
      c.from("sii_emisor").select("*").maybeSingle(),
      c.from("sii_folios").select("*").order("tipo").order("desde"),
      c.from("sii_documentos").select("id,ambiente,tipo,folio,fecha_emision,receptor,items,referencia,neto,exento,iva,total,estado,track_id,glosa,creado_en")
        .order("creado_en", { ascending: false }).limit(200)
    ]);
    if(e.error || f.error || d.error) throw (e.error || f.error || d.error);
    FA.emisor = e.data; FA.folios = f.data || []; FA.docs = d.data || []; FA.cargado = true;
    FA.almaId = me().almaId;
  }catch(err){ console.error(err); FA.cargado = null; }
  FA.cargando = false;
  if(state.view === "facturas") renderView();
}

/* Folios que quedan por tipo en el ambiente activo. */
function faDisponibles(tipo){
  const amb = FA.emisor && FA.emisor.ambiente;
  return FA.folios.filter(f => f.tipo === tipo && f.ambiente === amb).reduce((s, f) => s + Math.max(0, f.hasta - f.siguiente + 1), 0);
}
const faDocsAmbiente = () => FA.docs.filter(d => !FA.emisor || d.ambiente === FA.emisor.ambiente);

/* ---------- vista ---------- */
function vFacturas(a){
  if(!a.live || !Cloud.enabled)
    return `<div class="grid"><div class="card s12"><p class="muted">Las facturas necesitan tu sesión en la nube de ANIMA.</p></div></div>`;
  if(FA.almaId && FA.almaId !== a.almaId){ FA.cargado = undefined; FA.form = null; }
  if(FA.cargado === undefined){ setTimeout(faCargar, 0); return `<div class="grid"><div class="card s12 ld-cargando"><span class="ld-spin"></span>Cargando facturación…</div></div>`; }
  if(FA.cargado === null)
    return `<div class="grid"><div class="card s12"><p class="muted">No se pudo cargar la facturación.</p><button class="btn sm" data-fareload>Reintentar</button></div></div>`;

  const tab = state.facTab || (FA.emisor ? "emitir" : "config");
  const tabs = [["emitir", "Emitir"], ["emitidas", "Emitidas"], ["config", "Configuración"]]
    .map(([k, t]) => `<button class="ld-tab ${tab === k ? "on" : ""}" data-fatab="${k}" ${tab === k ? 'aria-current="true"' : ""}>${t}${k === "emitidas" && faDocsAmbiente().length ? `<span>${faDocsAmbiente().length}</span>` : ""}</button>`).join("");
  const amb = FA.emisor && FA.emisor.ambiente === "produccion"
    ? `<span class="fa-amb fa-amb-prod">Producción · valor tributario real</span>`
    : `<span class="fa-amb">Certificación · pruebas, sin valor tributario</span>`;
  const cuerpo = tab === "emitir" ? faVistaEmitir() : tab === "emitidas" ? faVistaEmitidas() : faVistaConfig();
  return `<div class="grid"><div class="card s12 fa-card">
      <div class="fa-top"><div class="ld-tabs" role="tablist">${tabs}</div>${FA.emisor ? amb : ""}</div>
      ${FA.msg ? `<div class="fa-msg" role="status">${esc(FA.msg)}</div>` : ""}
      ${cuerpo}
    </div></div>`;
}

function faListo(){
  const e = FA.emisor, faltan = [];
  if(!e) faltan.push("los datos del emisor");
  else if(!e.cert_vence) faltan.push("el certificado digital");
  return faltan;
}

function faVistaEmitir(){
  const faltan = faListo();
  if(faltan.length) return `<div class="fa-vacio"><p>Antes de emitir falta cargar ${faltan.join(" y ")}.</p><button class="btn" data-fatab="config">Ir a Configuración</button></div>`;
  if(!FA.form) FA.form = faFormVacio(33);
  const F = FA.form, boleta = F.tipo === 39, nc = F.tipo === 61;
  const disp = faDisponibles(F.tipo);
  const t = faTotales(F.tipo, F.items);
  const opt = (v, tt, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(tt)}</option>`;
  const inp = (ruta, label, ph, extra) => `<div class="field"><label>${label}</label><input data-faf="${ruta}" value="${esc(ruta.split(".").reduce((o, k) => o && o[k], F) ?? "")}" placeholder="${esc(ph || "")}" ${extra || ""}></div>`;
  const tipos = FA_TIPOS.map(([k, tt, d]) => `<button type="button" class="fa-tipo ${F.tipo === k ? "on" : ""}" data-fatipo="${k}"><b>${tt}</b><small>${d}</small><i>${k}</i></button>`).join("");
  const filas = F.items.map((i, n) => `<div class="fa-item">
      <div class="field fa-i-nom"><label>${n ? "" : "Descripción"}</label><input data-faitem="${n}.nombre" value="${esc(i.nombre)}" placeholder="Qué se factura" maxlength="80"></div>
      <div class="field fa-i-qty"><label>${n ? "" : "Cant."}</label><input data-faitem="${n}.cantidad" type="number" min="0" step="any" inputmode="decimal" value="${esc(i.cantidad)}"></div>
      <div class="field fa-i-pre"><label>${n ? "" : (boleta ? "Precio con IVA" : "Precio neto")}</label><input data-faitem="${n}.precio" type="number" min="0" step="1" inputmode="numeric" value="${esc(i.precio)}" placeholder="$"></div>
      ${F.tipo === 34 ? "" : `<label class="fa-i-ex" title="Esta línea no lleva IVA"><input type="checkbox" data-faitem="${n}.exento" ${i.exento ? "checked" : ""}> Exenta</label>`}
      <button type="button" class="btn ghost sm fa-i-del" data-faitemdel="${n}" aria-label="Quitar línea" ${F.items.length < 2 ? "disabled" : ""}>✕</button>
    </div>`).join("");
  const receptor = `<div class="fa-cols">
      ${inp("receptor.rut", boleta ? "RUT (opcional)" : "RUT", "12.345.678-5")}
      ${inp("receptor.razon_social", boleta ? "Nombre (opcional)" : "Razón social", "")}
      ${boleta ? "" : inp("receptor.giro", "Giro", "")}
      ${boleta ? "" : inp("receptor.email", "Correo", "")}
      ${inp("receptor.direccion", boleta ? "Dirección (opcional)" : "Dirección", "")}
      ${inp("receptor.comuna", boleta ? "Comuna (opcional)" : "Comuna", "")}
    </div>`;
  const ref = nc ? `<h3 class="fa-h">Documento que corrige</h3><div class="fa-cols">
      <div class="field"><label>Tipo</label><select data-faf="referencia.tipo_doc">${[33, 34, 39].map(k => opt(k, FA_TIPO_T[k], F.referencia.tipo_doc)).join("")}</select></div>
      ${inp("referencia.folio", "Folio", "", 'type="number" min="1" inputmode="numeric"')}
      ${inp("referencia.fecha", "Fecha del documento", "", 'type="date"')}
      <div class="field"><label>Motivo</label><select data-faf="referencia.codigo">${FA_CODREF.map(([k, tt]) => opt(k, tt, F.referencia.codigo)).join("")}</select></div>
      ${inp("referencia.razon", "Detalle (opcional)", "")}
    </div>` : "";
  const sinFolios = disp === 0 ? `<div class="fa-aviso">No quedan folios de ${FA_TIPO_T[F.tipo]} en este ambiente. <button class="btn ghost sm" data-fatab="config">Cargar un CAF</button></div>` : "";
  return `<div class="fa-form">
      <div class="fa-tipos">${tipos}</div>
      <div class="fa-cols fa-cols-3">
        ${inp("fecha", "Fecha de emisión", "", 'type="date"')}
        ${boleta ? "" : `<div class="field"><label>Forma de pago</label><select data-faf="forma_pago">${[[1, "Contado"], [2, "Crédito"], [3, "Sin costo"]].map(([k, tt]) => opt(k, tt, F.forma_pago)).join("")}</select></div>`}
        ${boleta ? "" : inp("vencimiento", "Vencimiento (opcional)", "", 'type="date"')}
      </div>
      <h3 class="fa-h">${boleta ? "Cliente" : "Receptor"}</h3>${receptor}
      ${ref}
      <h3 class="fa-h">Detalle</h3>${filas}
      <button type="button" class="btn ghost sm" data-faitemadd ${F.items.length >= 60 ? "disabled" : ""}>+ Agregar línea</button>
      <div class="fa-tot" id="faTot">${faTotalesHTML(F.tipo, t)}</div>
      ${sinFolios}
      <div class="fa-acc">
        <small class="muted">${disp} folio${disp === 1 ? "" : "s"} disponible${disp === 1 ? "" : "s"} · se firma con tu certificado y se envía al SII</small>
        <button class="btn gold" data-faemitir ${FA.ocupado || !disp ? "disabled" : ""}>${FA.ocupado === "emitir" ? "Emitiendo…" : "Emitir " + FA_TIPO_T[F.tipo].toLowerCase()}</button>
      </div>
    </div>`;
}

function faTotalesHTML(tipo, t){
  const fila = (k, v, fuerte) => `<div class="${fuerte ? "fa-tot-fuerte" : ""}"><span>${k}</span><b>${faPesos(v)}</b></div>`;
  return (t.neto ? fila(tipo === 39 ? "Neto" : "Monto neto", t.neto) : "") + (t.exento ? fila("Monto exento", t.exento) : "")
    + (t.iva ? fila(`IVA ${FA_IVA}%`, t.iva) : "") + fila("Total", t.total, true);
}

function faVistaEmitidas(){
  const L = faDocsAmbiente();
  if(!L.length) return `<div class="fa-vacio"><p>Aún no hay documentos en este ambiente.</p><button class="btn" data-fatab="emitir">Emitir el primero</button></div>`;
  return `<div class="fa-lista">${L.map(d => {
    const [t, cls] = FA_ESTADOS[d.estado] || [d.estado, ""];
    const quien = (d.receptor && (d.receptor.razon_social || d.receptor.rut)) || "Sin nombre";
    const puedeEnviar = d.estado === "firmado" || d.estado === "error";
    const ocupado = FA.ocupado === d.id;
    return `<div class="fa-doc">
      <div class="fa-doc-main"><b>${esc(FA_TIPO_T[d.tipo] || d.tipo)} N° ${d.folio}</b><span>${esc(quien)}</span><small class="muted">${faFecha(d.fecha_emision)}${d.track_id ? " · seguimiento " + esc(d.track_id) : ""}</small>
        ${d.glosa && d.estado !== "aceptado" ? `<small class="fa-glosa">${esc(d.glosa)}</small>` : ""}</div>
      <div class="fa-doc-monto">${faPesos(d.total)}</div>
      <span class="fa-st ${cls}">${t}</span>
      <div class="fa-doc-acc">
        ${puedeEnviar ? `<button class="btn sm" data-faenviar="${d.id}" ${ocupado ? "disabled" : ""}>${ocupado ? "Enviando…" : "Enviar al SII"}</button>` : ""}
        ${d.track_id && (d.estado === "enviado" || d.estado === "reparos") ? `<button class="btn ghost sm" data-faconsultar="${d.id}" ${ocupado ? "disabled" : ""}>${ocupado ? "Consultando…" : "Actualizar estado"}</button>` : ""}
        <button class="btn ghost sm" data-faxml="${d.id}">XML</button>
        ${d.tipo !== 61 && ["aceptado", "reparos", "enviado"].includes(d.estado) ? `<button class="btn ghost sm" data-fanc="${d.id}">Nota de crédito</button>` : ""}
      </div></div>`;
  }).join("")}</div>`;
}

function faVistaConfig(){
  const e = FA.emisor || {};
  const v = k => esc(e[k] ?? "");
  const hoy = e.cert_vence ? new Date(e.cert_vence) : null;
  const dias = hoy ? Math.ceil((hoy - new Date()) / 86400000) : null;
  const tiposCaf = FA_TIPOS.map(([k, t]) => {
    const fs = FA.folios.filter(f => f.tipo === k && f.ambiente === (e.ambiente || "certificacion"));
    return `<div><b>${t}</b> <span class="muted">${fs.length ? fs.map(f => `${f.desde}–${f.hasta} (usa ${Math.min(f.siguiente, f.hasta + 1)})`).join(" · ") : "sin folios"}</span> <i class="fa-n">${faDisponibles(k)} disp.</i></div>`;
  }).join("");
  return `<div class="fa-conf">
    <h3 class="fa-h">Emisor</h3>
    <p class="muted fa-ayuda">Los datos que el SII tiene de tu empresa o de ti. La resolución es la que te autorizó a emitir documentos electrónicos (en certificación el número es 0).</p>
    <form data-faemisor class="fa-cols">
      <div class="field"><label>RUT</label><input name="rut" value="${v("rut")}" placeholder="76.123.456-0" required></div>
      <div class="field"><label>Razón social</label><input name="razon_social" value="${v("razon_social")}" required></div>
      <div class="field"><label>Giro</label><input name="giro" value="${v("giro")}" required></div>
      <div class="field"><label>Código de actividad (Acteco)</label><input name="acteco" type="number" inputmode="numeric" value="${v("acteco")}" required></div>
      <div class="field"><label>Dirección</label><input name="direccion" value="${v("direccion")}" required></div>
      <div class="field"><label>Comuna</label><input name="comuna" value="${v("comuna")}" required></div>
      <div class="field"><label>Ciudad</label><input name="ciudad" value="${v("ciudad")}"></div>
      <div class="field"><label>Correo</label><input name="email" type="email" value="${v("email")}"></div>
      <div class="field"><label>RUT del titular del certificado</label><input name="rut_envia" value="${v("rut_envia")}" required></div>
      <div class="field"><label>Fecha de resolución</label><input name="resol_fecha" type="date" value="${v("resol_fecha")}" required></div>
      <div class="field"><label>N° de resolución</label><input name="resol_numero" type="number" inputmode="numeric" value="${v("resol_numero") || 0}"></div>
      <div class="field"><label>Ambiente</label><select name="ambiente"><option value="certificacion" ${e.ambiente !== "produccion" ? "selected" : ""}>Certificación (pruebas)</option><option value="produccion" ${e.ambiente === "produccion" ? "selected" : ""}>Producción (real)</option></select></div>
      <div class="fa-full"><button class="btn" type="submit" ${FA.ocupado ? "disabled" : ""}>Guardar emisor</button></div>
    </form>
    ${FA.emisor ? `
    <h3 class="fa-h">Certificado digital</h3>
    <p class="muted fa-ayuda">El archivo .pfx o .p12 de la persona autorizada en el SII. Se guarda cifrado en el servidor; la clave no se almacena.</p>
    ${e.cert_vence ? `<div class="fa-ok">Certificado cargado · vence el ${faFecha(e.cert_vence)}${dias != null && dias < 30 ? ` <b>(quedan ${Math.max(dias, 0)} días)</b>` : ""} <button class="btn ghost sm" data-faquitarcert>Quitar</button></div>` : ""}
    <div class="fa-cols">
      <div class="field"><label>Archivo .pfx / .p12</label><input id="faPfx" type="file" accept=".pfx,.p12"></div>
      <div class="field"><label>Clave del certificado</label><input id="faClave" type="password" autocomplete="off"></div>
      <div class="fa-full"><button class="btn" data-fasubircert ${FA.ocupado ? "disabled" : ""}>${e.cert_vence ? "Reemplazar certificado" : "Subir certificado"}</button></div>
    </div>
    <h3 class="fa-h">Folios (CAF)</h3>
    <p class="muted fa-ayuda">Los pides en el sitio del SII ${e.ambiente === "produccion" ? "(producción)" : "(certificación)"} y descargas un archivo .xml por tipo de documento. Cada ambiente tiene los suyos.</p>
    <div class="fa-folios">${tiposCaf}</div>
    <div class="fa-cols"><div class="field"><label>Archivo CAF (.xml)</label><input id="faCaf" type="file" accept=".xml" multiple></div>
      <div class="fa-full"><button class="btn" data-fasubircaf ${FA.ocupado ? "disabled" : ""}>Cargar folios</button></div></div>` : ""}
  </div>`;
}

/* ---------- acciones ---------- */
function faAviso(m){ FA.msg = m; if(state.view === "facturas") renderView(); }

async function faHacer(clave, fn){
  if(FA.ocupado) return;
  FA.ocupado = clave; FA.msg = ""; renderView();
  try{ await fn(); }
  catch(err){ console.error(err); FA.msg = err.message || String(err); }
  FA.ocupado = "";
  await faCargar();
}

function faFormEnviar(){
  const F = FA.form;
  return { action: "emitir", tipo: F.tipo, fecha: F.fecha, forma_pago: F.forma_pago, vencimiento: F.vencimiento || null,
    receptor: F.receptor, referencia: F.tipo === 61 ? F.referencia : null,
    items: F.items.map(i => ({ nombre: i.nombre, cantidad: Number(i.cantidad), precio: Number(i.precio), exento: !!i.exento })) };
}

function faEmitir(){
  const F = FA.form; if(!F) return;
  const t = faTotales(F.tipo, F.items);
  const prod = FA.emisor.ambiente === "produccion";
  if(!confirm(`${prod ? "ATENCIÓN: producción, tiene valor tributario real.\n\n" : ""}Emitir ${FA_TIPO_T[F.tipo].toLowerCase()} por ${faPesos(t.total)}?`)) return;
  faHacer("emitir", async () => {
    const r = await faFn(faFormEnviar());
    if(r.ok === false && !r.folio) throw new Error(r.msg || "No se pudo emitir.");
    FA.form = faFormVacio(F.tipo);
    state.facTab = "emitidas";
    FA.msg = r.ok ? `✓ ${FA_TIPO_T[F.tipo]} N° ${r.folio} enviada al SII (seguimiento ${r.track_id}).` : r.msg;
  });
}

function faDesdeDoc(id){
  const d = FA.docs.find(x => x.id === id); if(!d) return;
  const F = faFormVacio(61);
  F.receptor = { ...F.receptor, ...(d.receptor || {}) };
  F.items = (d.items || []).map(i => ({ nombre: i.nombre, cantidad: i.cantidad, precio: i.precio, exento: !!i.exento }));
  F.referencia = { tipo_doc: d.tipo, folio: d.folio, fecha: d.fecha_emision, codigo: 1, razon: "" };
  FA.form = F; state.facTab = "emitir"; FA.msg = ""; renderView();
}

async function faDescargarXml(id){
  const { data, error } = await Cloud.client.from("sii_documentos").select("xml,tipo,folio").eq("id", id).single();
  if(error || !data || !data.xml){ faAviso("No se pudo bajar el XML."); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([Uint8Array.from(data.xml, c => c.charCodeAt(0) & 255)], { type: "text/xml" }));
  a.download = `DTE_${data.tipo}_${data.folio}.xml`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const faLeerArchivo = (file, comoTexto) => new Promise((ok, mal) => {
  const r = new FileReader(); r.onerror = () => mal(new Error("No se pudo leer el archivo."));
  r.onload = () => ok(comoTexto ? r.result : String(r.result).split(",")[1]);
  comoTexto ? r.readAsText(file, "ISO-8859-1") : r.readAsDataURL(file);
});

/* ---------- eventos ---------- */
function faRuta(o, ruta, valor){ const k = ruta.split("."); const ult = k.pop(); const dst = k.reduce((x, p) => x[p], o); dst[ult] = valor; }

document.addEventListener("click", e => {
  const t = e.target; if(state.view !== "facturas") return;
  if(t.closest("[data-fareload]")){ FA.cargado = undefined; renderView(); return; }
  const tb = t.closest("[data-fatab]"); if(tb){ state.facTab = tb.dataset.fatab; FA.msg = ""; save(); renderView(); return; }
  const tp = t.closest("[data-fatipo]"); if(tp){ FA.form.tipo = Number(tp.dataset.fatipo); renderView(); return; }
  if(t.closest("[data-faitemadd]")){ FA.form.items.push({ nombre: "", cantidad: 1, precio: "", exento: false }); renderView(); return; }
  const di = t.closest("[data-faitemdel]"); if(di){ FA.form.items.splice(Number(di.dataset.faitemdel), 1); renderView(); return; }
  if(t.closest("[data-faemitir]")){ faEmitir(); return; }
  const en = t.closest("[data-faenviar]"); if(en){ faHacer(en.dataset.faenviar, async () => {
    const r = await faFn({ action: "enviar", documento_id: en.dataset.faenviar });
    FA.msg = r.ok ? `✓ Enviado al SII (seguimiento ${r.track_id}).` : r.msg; }); return; }
  const co = t.closest("[data-faconsultar]"); if(co){ faHacer(co.dataset.faconsultar, async () => {
    const r = await faFn({ action: "consultar", documento_id: co.dataset.faconsultar });
    FA.msg = r.ok ? `El SII dice: ${(FA_ESTADOS[r.estado] || [r.estado])[0]}${r.glosa ? " · " + r.glosa : ""}` : r.msg; }); return; }
  const xm = t.closest("[data-faxml]"); if(xm){ faDescargarXml(xm.dataset.faxml); return; }
  const nc = t.closest("[data-fanc]"); if(nc){ faDesdeDoc(nc.dataset.fanc); return; }
  if(t.closest("[data-faquitarcert]")){ if(confirm("¿Quitar el certificado? No podrás emitir hasta subir uno.")) faHacer("cert", async () => { await faFn({ action: "quitar_certificado" }); }); return; }
  if(t.closest("[data-fasubircert]")){
    const f = document.getElementById("faPfx").files[0], clave = document.getElementById("faClave").value;
    if(!f){ faAviso("Elige el archivo del certificado."); return; }
    faHacer("cert", async () => {
      const r = await faFn({ action: "subir_certificado", pfx_b64: await faLeerArchivo(f, false), clave });
      if(!r.ok) throw new Error(r.msg); FA.msg = `✓ Certificado cargado, vence el ${faFecha(r.vence)}.`; });
    return; }
  if(t.closest("[data-fasubircaf]")){
    const fs = [...document.getElementById("faCaf").files];
    if(!fs.length){ faAviso("Elige el archivo CAF (.xml)."); return; }
    faHacer("caf", async () => {
      const ok = [];
      for(const f of fs){
        const r = await faFn({ action: "subir_caf", xml: await faLeerArchivo(f, true) });
        if(!r.ok) throw new Error(`${f.name}: ${r.msg}`);
        ok.push(`${FA_TIPO_T[r.tipo] || r.tipo} ${r.desde}–${r.hasta}`);
      }
      FA.msg = "✓ Folios cargados: " + ok.join(" · "); });
    return; }
});

document.addEventListener("input", e => {
  if(state.view !== "facturas" || !FA.form) return;
  const el = e.target;
  const f = el.closest && el.closest("[data-faf]"); if(f){ faRuta(FA.form, f.dataset.faf, f.value); return; }
  const it = el.closest && el.closest("[data-faitem]"); if(it){
    const [n, campo] = it.dataset.faitem.split(".");
    FA.form.items[Number(n)][campo] = el.type === "checkbox" ? el.checked : el.value;
    const tot = document.getElementById("faTot"); if(tot) tot.innerHTML = faTotalesHTML(FA.form.tipo, faTotales(FA.form.tipo, FA.form.items));
  }
});
document.addEventListener("submit", e => {
  const f = e.target.closest && e.target.closest("[data-faemisor]"); if(!f) return;
  e.preventDefault();
  const emisor = Object.fromEntries(new FormData(f).entries());
  const prod = emisor.ambiente === "produccion" && !(FA.emisor && FA.emisor.ambiente === "produccion");
  if(prod && !confirm("Pasar a producción emite documentos con valor tributario real. ¿Confirmas?")) return;
  faHacer("emisor", async () => {
    const r = await faFn({ action: "guardar_emisor", emisor, confirmar_produccion: prod });
    if(!r.ok) throw new Error(r.msg); FA.msg = "✓ Emisor guardado."; });
});
