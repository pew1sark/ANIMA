// ANIMA — widget para Scriptable (iPhone, sin Mac ni Xcode).
// Solo lectura: llama a resumen_modulo() con TU sesión; RLS decide qué ves.
// Nada de este archivo es secreto: URL, clave y sesión se piden la primera vez
// y quedan en el Keychain del teléfono.
//
// Personalizar: en el widget → Editar widget → Parameter: "vista,acento"
//   vista:  panel (por defecto) | clientes | ventas | proyectos | agenda
//   acento: grafito (por defecto) | ambar | salvia | cielo
//   ej.: "ventas,salvia"

const K = { cfg: "anima.cfg", ses: "anima.ses", emp: "anima.emp" };
const leer = k => (Keychain.contains(k) ? JSON.parse(Keychain.get(k)) : null);
const guardar = (k, v) => Keychain.set(k, JSON.stringify(v));

const MODULOS = { clientes: "crm", ventas: "commerce", proyectos: "creator", agenda: "agenda" };
const TITULOS = { panel: "PANEL", clientes: "CLIENTES", ventas: "VENTAS", proyectos: "PROYECTOS", agenda: "ACTIVIDADES" };
const ACENTOS = { grafito: "#737373", ambar: "#D99433", salvia: "#6B9E80", cielo: "#598CD1" };
const TONOS = { ok: "#59A673", aviso: "#D99433", malo: "#CC4D4D" };

async function pedir(ruta, { metodo = "GET", cuerpo, token } = {}) {
  const cfg = leer(K.cfg);
  const r = new Request(`https://${cfg.host}/${ruta}`);
  r.method = metodo;
  r.headers = { apikey: cfg.key, Authorization: "Bearer " + (token || cfg.key), "Content-Type": "application/json" };
  if (cuerpo) r.body = JSON.stringify(cuerpo);
  const d = await r.loadJSON();
  const c = r.response.statusCode;
  if (c < 200 || c >= 300) throw new Error(c === 400 || c === 401 ? "credenciales" : "http " + c);
  return d;
}

function guardarSesion(a) {
  guardar(K.ses, { token: a.access_token, refresh: a.refresh_token, expira: Date.now() + a.expires_in * 1000 });
}

async function token() {
  const s = leer(K.ses);
  if (!s) throw new Error("sin sesión");
  if (s.expira - Date.now() > 60000) return s.token;
  try {
    const a = await pedir("auth/v1/token?grant_type=refresh_token", { metodo: "POST", cuerpo: { refresh_token: s.refresh } });
    guardarSesion(a);
    return a.access_token;
  } catch (e) { Keychain.remove(K.ses); throw new Error("sin sesión"); }
}

async function preguntar(titulo, campos) {
  const a = new Alert();
  a.title = titulo;
  campos.forEach(([ph, secreto, val]) => (secreto ? a.addSecureTextField(ph, val || "") : a.addTextField(ph, val || "")));
  a.addAction("Continuar"); a.addCancelAction("Cancelar");
  if ((await a.present()) === -1) return null;
  return campos.map((_, i) => a.textFieldValue(i).trim());
}

async function configurar() {
  const prev = leer(K.cfg) || {};
  const c = await preguntar("Proyecto ANIMA (staging)", [["host: xxxx.supabase.co", false, prev.host], ["clave anónima (anon key)", false, prev.key]]);
  if (!c || !c[0] || !c[1]) return false;
  guardar(K.cfg, { host: c[0].replace(/^https?:\/\//, "").replace(/\/$/, ""), key: c[1] });
  const l = await preguntar("Inicia sesión", [["correo", false], ["contraseña", true]]);
  if (!l) return false;
  try {
    guardarSesion(await pedir("auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: l[0], password: l[1] } }));
  } catch (e) { await aviso("No pude entrar", "Revisa correo, contraseña y la clave."); return false; }
  return elegirEmpresa();
}

async function elegirEmpresa() {
  const lista = await pedir("rest/v1/companies?select=id,name&order=name", { token: await token() });
  if (!lista.length) { await aviso("Sin empresas", "Tu usuario no pertenece a ninguna."); return false; }
  let e = lista[0];
  if (lista.length > 1) {
    const a = new Alert(); a.title = "Empresa del widget";
    lista.forEach(x => a.addAction(x.name)); a.addCancelAction("Cancelar");
    const i = await a.present(); if (i === -1) return false; e = lista[i];
  }
  guardar(K.emp, e);
  return true;
}

async function aviso(t, m) { const a = new Alert(); a.title = t; a.message = m; a.addAction("OK"); await a.present(); }

const resumen = async (modulo) =>
  pedir("rest/v1/rpc/resumen_modulo", { metodo: "POST", cuerpo: { p_company: leer(K.emp).id, p_modulo: modulo }, token: await token() });

// ---- formato (espejo de lib/formato.ts, compacto para que quepa) ----
function escribir(v, f) {
  v = Number(v) || 0;
  if (f === "dinero") {
    const a = Math.abs(v);
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(1).replace(".", ",") + " M";
    if (a >= 1e4) return "$" + Math.round(v / 1e3) + " mil";
    return "$" + Math.round(v).toLocaleString("es-CL");
  }
  if (f === "porcentaje") return Math.round(v) + "%";
  if (f === "dias") return Math.round(v) + " d";
  if (f === "meses") return Math.round(v) + " m";
  return String(Math.round(v));
}
const celda = (v, f) => (typeof v === "number" ? escribir(v, f) : v == null ? "—" : String(v));

// ---- datos ----
async function datos(vista) {
  if (vista !== "panel") return { resumen: await resumen(MODULOS[vista]) };
  // Monitoreo: de cada módulo sube la cifra que pide atención y, si no hay, la primera.
  const filas = [];
  await Promise.all(Object.keys(MODULOS).map(async (v, i) => {
    try {
      const c = (await resumen(MODULOS[v])).cifras || [];
      const f = c.find(x => x.tono === "malo" && x.valor > 0) || c.find(x => x.tono === "aviso" && x.valor > 0) || c[0];
      if (f) filas[i] = { titulo: v[0].toUpperCase() + v.slice(1), c: f };
    } catch (e) { /* un módulo que el plan no incluye no tumba el panel */ }
  }));
  return { panel: filas.filter(Boolean) };
}

// ---- dibujo ----
function texto(pila, s, tam, opts = {}) {
  const t = pila.addText(s);
  t.font = opts.peso ? Font.semiboldRoundedSystemFont(tam) : Font.systemFont(tam);
  t.textColor = opts.color ? new Color(opts.color) : opts.sec ? Color.gray() : Color.dynamic(Color.black(), Color.white());
  t.lineLimit = 1; t.minimumScaleFactor = 0.6;
  return t;
}

function construir(vista, acento, d, fam) {
  const w = new ListWidget();
  w.backgroundColor = Color.dynamic(new Color("#F6F5F2"), new Color("#1A1A1A"));
  w.url = "https://animatsc.com/app/";
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  const cab = w.addStack(); cab.centerAlignContent();
  const punto = cab.addText("●"); punto.font = Font.systemFont(8); punto.textColor = new Color(acento);
  cab.addSpacer(5);
  texto(cab, TITULOS[vista], 11, { peso: true, sec: true });
  if (fam !== "small") { cab.addSpacer(); texto(cab, leer(K.emp).name, 11, { sec: true }); }
  w.addSpacer(8);

  if (d.panel) {
    d.panel.slice(0, 4).forEach(f => {
      const r = w.addStack(); r.centerAlignContent();
      const izq = r.addStack(); izq.layoutVertically();
      texto(izq, f.titulo, fam === "small" ? 12 : 14, { peso: fam !== "small" });
      if (fam !== "small") texto(izq, f.c.etiqueta, 10, { sec: true });
      r.addSpacer();
      texto(r, escribir(f.c.valor, f.c.formato), fam === "small" ? 15 : 19, { peso: true, color: TONOS[f.c.tono] });
      w.addSpacer(fam === "small" ? 6 : 9);
    });
    return w;
  }
  const c = d.resumen.cifras || [];
  if (c[0]) {
    texto(w, escribir(c[0].valor, c[0].formato), fam === "small" ? 34 : 40, { peso: true, color: TONOS[c[0].tono] });
    texto(w, c[0].etiqueta, 12, { sec: true });
  }
  w.addSpacer(8);
  if (fam === "small") { if (c[1]) texto(w, `${c[1].etiqueta}: ${escribir(c[1].valor, c[1].formato)}`, 10, { sec: true }); return w; }
  const fila = w.addStack();
  c.slice(1, 4).forEach(x => {
    const v = fila.addStack(); v.layoutVertically();
    texto(v, escribir(x.valor, x.formato), 16, { peso: true, color: TONOS[x.tono] });
    texto(v, x.etiqueta, 10, { sec: true });
    fila.addSpacer(16);
  });
  const l = (d.resumen.listas || [])[0];
  if (fam === "large" && l) {
    w.addSpacer(10); texto(w, l.titulo, 11, { peso: true, sec: true }); w.addSpacer(4);
    const a = l.columnas[0], b = l.columnas[l.columnas.length - 1];
    l.filas.slice(0, 5).forEach(f => {
      const r = w.addStack(); texto(r, celda(f[a.k], a.formato), 13); r.addSpacer();
      if (l.columnas.length > 1) texto(r, celda(f[b.k], b.formato), 13, { color: TONOS[b.tono], sec: !b.tono });
      w.addSpacer(3);
    });
  }
  return w;
}

function mensaje(txt) {
  const w = new ListWidget(); w.url = "scriptable:///run/" + encodeURIComponent(Script.name());
  const t = w.addText(txt); t.font = Font.systemFont(13); t.textColor = Color.gray();
  return w;
}

// ---- arranque ----
const [vistaP, acentoP] = (args.widgetParameter || "").split(",").map(s => s.trim().toLowerCase());
const vista = TITULOS[vistaP] ? vistaP : "panel";
const acento = ACENTOS[acentoP] || ACENTOS.grafito;

if (config.runsInWidget) {
  let w;
  try {
    if (!leer(K.cfg) || !leer(K.emp)) w = mensaje("Abre el script ANIMA en Scriptable para configurar.");
    else w = construir(vista, acento, await datos(vista), config.widgetFamily || "medium");
  } catch (e) {
    w = mensaje(e.message === "sin sesión" ? "Sesión vencida. Abre el script ANIMA." : "Sin conexión. Reintenta en un rato.");
  }
  Script.setWidget(w);
} else {
  // Dentro de la app: configurar la primera vez, o menú.
  if (!leer(K.cfg) || !leer(K.emp)) {
    if (await configurar()) await aviso("Listo", "Ahora añade un widget de Scriptable a tu pantalla de inicio y elige este script.");
  } else {
    const m = new Alert(); m.title = "ANIMA";
    ["Vista previa (mediano)", "Cambiar empresa", "Cambiar proyecto o sesión", "Cerrar sesión"].forEach(x => m.addAction(x));
    m.addCancelAction("Cerrar");
    const i = await m.present();
    if (i === 0) { try { (await construir(vista, acento, await datos(vista), "medium")).presentMedium(); } catch (e) { await aviso("Error", e.message); } }
    else if (i === 1) await elegirEmpresa();
    else if (i === 2) await configurar();
    else if (i === 3) { Keychain.remove(K.ses); Keychain.remove(K.emp); }
  }
  Script.complete();
}
