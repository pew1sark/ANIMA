/* ===========================================================
   ANIMA · ALPHA — el mundo vivo (motor)
   -----------------------------------------------------------
   Implementa el PROMPT MAESTRO FINAL:
   · Una sola ESENCIA (crece, nunca disminuye, nunca se reinicia)
   · Menú definitivo: Mi Alma · Taller · Clan · Mundo · Mi Plan
   · DESPERTARES dormidos en 500 / 2000 / 5000 / 10000
   · Primera experiencia ceremonial (una sola vez)
   · LUMBRE: presencia serena, nunca un chatbot
   · El Árbol vivo alimentado por la Esencia Global
   Sin build. Sin dependencias. Vive en localStorage.
   =========================================================== */
(function () {
  "use strict";

  var KEY = "anima_alpha";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); };
  var fmt = function (n) { return Number(n || 0).toLocaleString("es"); };
  var now = function () { return Date.now(); };
  var uid = function () { return Math.random().toString(36).slice(2, 9); };

  /* ---------- DESPERTARES (las funciones no se bloquean: duermen) ---------- */
  var DESPERTARES = [
    { at: 500,   key: "CLAN",      title: "Despertar Clan",      msg: "Tu voz ya no viaja sola." },
    { at: 2000,  key: "ECOS",      title: "Despertar Ecos",      msg: "Tus creaciones comienzan a resonar." },
    { at: 5000,  key: "CONSEJO",   title: "Despertar Consejo",   msg: "Lumbre reconoce tu trayectoria." },
    { at: 10000, key: "SANTUARIO", title: "Despertar Santuario", msg: "Tu espacio puede albergar más Almas." }
  ];
  var awake = function (key, ess) {
    var d = DESPERTARES.filter(function (x) { return x.key === key; })[0];
    return d ? (ess >= d.at) : true;
  };

  /* ---------- Esencia: cuánto entrega cada huella ---------- */
  var GIVES = {
    proyecto: 60, eco: 40, semilla: 120, memoria: 25, obra: 35,
    chispa: 15, vinculo: 20, agenda: 10, ritual: 50
  };

  /* ---------- El mundo poblado (otras Almas · objetivo Alpha: 30 Almas) ---------- */
  var WORLD_ALMAS = [
    { n: "Valentina Cruz", p: "Argentina", e: 4120, x: 18, y: 30 },
    { n: "Nicolás Herrera", p: "Colombia", e: 2880, x: 32, y: 64 },
    { n: "Diego Ramírez", p: "México", e: 6240, x: 12, y: 50 },
    { n: "Camila Soto", p: "Perú", e: 1740, x: 40, y: 44 },
    { n: "Lucía Fernández", p: "España", e: 9100, x: 78, y: 22 },
    { n: "Mateo Vargas", p: "Chile", e: 3320, x: 24, y: 78 },
    { n: "Sofía Morales", p: "México", e: 520, x: 16, y: 40 },
    { n: "Tomás Rojas", p: "Argentina", e: 2110, x: 28, y: 26 },
    { n: "Renata Díaz", p: "Colombia", e: 770, x: 35, y: 58 },
    { n: "Aitana Romero", p: "España", e: 5430, x: 82, y: 30 },
    { n: "João Mendes", p: "Brasil", e: 1290, x: 46, y: 70 },
    { n: "Emma Laurent", p: "Francia", e: 880, x: 70, y: 18 },
    { n: "Kenji Mori", p: "Japón", e: 410, x: 96, y: 46 },
    { n: "Sara Haddad", p: "Marruecos", e: 640, x: 64, y: 40 }
  ];

  /* Ecos del mundo (obras, fotografías, reflexiones, procesos) */
  var WORLD_ECOS = [
    { id: "w1", who: "Lucía Fernández", p: "España", body: "Terminé el primer boceto del mural. Tres años buscando esta pared.", kind: "Proceso", when: 1000 * 60 * 40 },
    { id: "w2", who: "Diego Ramírez", p: "México", body: "Una fotografía no detiene el tiempo. Lo deja respirar.", kind: "Reflexión", when: 1000 * 60 * 60 * 3 },
    { id: "w3", who: "Valentina Cruz", p: "Argentina", body: "Compartí mi serie de retratos en barro. Cada rostro recuerda a alguien.", kind: "Obra", when: 1000 * 60 * 60 * 9 },
    { id: "w4", who: "Aitana Romero", p: "España", body: "El silencio también es composición.", kind: "Reflexión", when: 1000 * 60 * 60 * 26 },
    { id: "w5", who: "Mateo Vargas", p: "Chile", body: "Subí el proceso completo de la escultura: del alambre a la forma.", kind: "Proceso", when: 1000 * 60 * 60 * 50 }
  ];

  var PAISES = (function () { var s = {}; WORLD_ALMAS.forEach(function (a) { s[a.p] = (s[a.p] || 0) + 1; }); return s; })();
  var WORLD_BASE = WORLD_ALMAS.reduce(function (a, b) { return a + b.e; }, 0);

  /* ---------- Etapas del Árbol según ESENCIA GLOBAL ---------- */
  var TREE_STAGES = [
    { at: 0,      name: "Latente",     sym: "○" },
    { at: 20000,  name: "Sereno",      sym: "✦" },
    { at: 38000,  name: "Resonando",   sym: "〰" },
    { at: 55000,  name: "Floreciendo", sym: "✧" },
    { at: 75000,  name: "Luminoso",    sym: "◎" },
    { at: 100000, name: "Despertar",   sym: "∞" }
  ];
  function treeStage(g) { var s = TREE_STAGES[0]; for (var i = 0; i < TREE_STAGES.length; i++) { if (g >= TREE_STAGES[i].at) s = TREE_STAGES[i]; } return s; }

  /* ===========================================================
     ESTADO
     =========================================================== */
  function defaults() {
    return {
      first_awakening: false,
      alma: null,
      semillas: [
        { id: uid(), t: "Compartir mi primer Eco", s: "floreciendo" },
        { id: uid(), t: "Crear mi Clan", s: "brotando" },
        { id: uid(), t: "Alcanzar Santuario", s: "dormida" }
      ],
      proyectos: [], vinculos: [], agenda: [], ecos: [],
      memorias: [], biblioteca: [], portafolio: [], cronologia: [],
      insignias: {}, awarded: {}, resonados: {}
    };
  }
  var S = null;
  function load() {
    try { var raw = JSON.parse(localStorage.getItem(KEY)); if (raw && typeof raw === "object") return Object.assign(defaults(), raw); } catch (e) {}
    return defaults();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  function essence() { return S.alma ? (S.alma.esencia || 0) : 0; }
  function essenceGlobal() { return WORLD_BASE + essence(); }

  /* Estado del Alma según última presencia */
  function soulState() {
    if (!S.alma) return { key: "activa", label: "Activa", glyph: "🟢" };
    var dt = now() - (S.alma.lastSeen || now());
    var day = 1000 * 60 * 60 * 24;
    if (dt > 7 * day) return { key: "dormida", label: "Dormida", glyph: "💫" };
    if (dt > 2 * day) return { key: "silencio", label: "En silencio", glyph: "🌙" };
    return { key: "activa", label: "Activa", glyph: "🟢" };
  }

  /* La Esencia SOLO crece. Cada huella entrega un mensaje del mundo, jamás "+XP". */
  function grow(amount, message, opts) {
    opts = opts || {};
    if (!S.alma) return;
    var prevEss = S.alma.esencia || 0;
    S.alma.esencia = prevEss + amount;          /* nunca disminuye */
    S.alma.lastSeen = now();
    save();
    if (message) toast(message);
    /* ¿Cruzó un Despertar? */
    DESPERTARES.forEach(function (d) {
      if (prevEss < d.at && S.alma.esencia >= d.at) {
        logHito("Despertar", d.title + " — " + d.msg);
        setTimeout(function () { lumbreSay([d.title + ".", d.msg], true); }, 700);
      }
    });
    if (opts.rerender !== false) render();
    syncTop();
  }
  function growOnce(akey, amount, message) {
    if (S.awarded[akey]) return false;
    S.awarded[akey] = true; grow(amount, message); return true;
  }

  function logHito(kind, text) {
    S.cronologia.unshift({ id: uid(), kind: kind, text: text, when: now() });
    if (S.cronologia.length > 120) S.cronologia.pop();
    save();
  }
  /* Un Eco propio resuena en el mundo (queda en MUNDO › Ecos) */
  function pushEco(body, kind) {
    var e = { id: uid(), who: S.alma.nombre, p: S.alma.pais, body: body, kind: kind || "Reflexión", when: now() };
    S.ecos.unshift(e); save(); return e;
  }

  function ago(ms) {
    var d = now() - ms, m = 60000, h = 3600000, day = 86400000;
    if (d < m) return "ahora";
    if (d < h) return Math.floor(d / m) + " min";
    if (d < day) return Math.floor(d / h) + " h";
    return Math.floor(d / day) + " d";
  }

  /* ===========================================================
     PIXEL ART
     =========================================================== */
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; } return h; }
  /* Sello del Alma: 8×8 simétrico, determinista por nombre */
  function makeAvatar(nombre) {
    var h = hash(nombre || "alma"), bits = [];
    for (var y = 0; y < 8; y++) for (var x = 0; x < 4; x++) {
      var on = ((h >>> ((y * 4 + x) % 31)) & 1) && (Math.abs((x - 1.5) * (y - 3.5)) % 3 < 2);
      bits.push(on ? 1 : 0);
    }
    return bits; /* 32 bits, se refleja para 8×8 */
  }
  function avatarHTML(bits, big) {
    var seed = 3; /* una celda viva en verde-Semilla */
    var cells = [];
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        var sx = x < 4 ? x : 7 - x;
        var on = bits[y * 4 + sx];
        var isSeed = on && (y * 4 + sx) % 11 === seed;
        cells.push('<span style="background:' + (on ? (isSeed ? "var(--seed)" : "var(--ink)") : "transparent") + '"></span>');
      }
    }
    return '<div class="avatar-grid' + (big ? " lg" : "") + '">' + cells.join("") + "</div>";
  }

  /* El Árbol vivo en pixel art — crece con la Esencia Global */
  function drawTree(canvas, g) {
    var stageIdx = 0; for (var i = 0; i < TREE_STAGES.length; i++) if (g >= TREE_STAGES[i].at) stageIdx = i;
    var P = 9, W = 34, H = 30; canvas.width = W * P; canvas.height = H * P;
    var ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var ink = "#0a0a0b", seed = "#3f7d4f", soft = "#c9c9cc";
    function px(x, y, c) { ctx.fillStyle = c; ctx.fillRect(x * P, y * P, P, P); }
    var cx = 17;
    /* raíces (siempre, se ramifican con la etapa) */
    for (var r = 0; r <= Math.min(4, stageIdx + 1); r++) {
      px(cx - r, 29 - 0, soft); px(cx + r, 29, soft);
      if (r) { px(cx - r, 28, soft); px(cx + r, 28, soft); }
    }
    /* tronco */
    var trunkH = 6 + stageIdx; /* crece */
    for (var t = 0; t < trunkH; t++) { px(cx, 28 - t, ink); if (t > 1) px(cx - 1, 28 - t, ink); }
    var topY = 28 - trunkH;
    /* ramas según etapa */
    function branch(dir, len, baseY) {
      for (var b = 1; b <= len; b++) { var x = cx + dir * b, y = baseY - Math.floor(b * 0.7); px(x, y, ink); }
    }
    if (stageIdx >= 1) { branch(-1, 3, topY + 2); branch(1, 3, topY + 3); }
    if (stageIdx >= 2) { branch(-1, 5, topY + 1); branch(1, 5, topY + 2); }
    if (stageIdx >= 3) { branch(-1, 6, topY); branch(1, 6, topY + 1); }
    /* copa: hojas (gris→ink) que crecen */
    var leaves = [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [0, -3]];
    if (stageIdx >= 2) leaves = leaves.concat([[-3, 0], [3, 0], [-2, -2], [2, -2], [0, -4], [-1, -3], [1, -3]]);
    if (stageIdx >= 3) leaves = leaves.concat([[-4, -1], [4, -1], [-3, -2], [3, -2], [-2, -4], [2, -4], [0, -5]]);
    if (stageIdx >= 4) leaves = leaves.concat([[-5, -1], [5, -1], [-4, -3], [4, -3], [-1, -5], [1, -5], [0, -6]]);
    leaves.forEach(function (p) { px(cx + p[0], topY + 1 + p[1], stageIdx >= 4 ? ink : (Math.abs(p[0]) > 2 ? soft : ink)); });
    /* flores / frutos al florecer (un punto de color, sin saturar) */
    if (stageIdx >= 3) { px(cx - 2, topY - 1, seed); px(cx + 2, topY - 2, seed); }
    if (stageIdx >= 4) { px(cx, topY - 3, seed); px(cx - 4, topY - 1, seed); px(cx + 4, topY - 2, seed); }
    if (stageIdx >= 5) { px(cx + 1, topY - 4, seed); px(cx - 1, topY - 4, seed); }
  }

  /* Pequeño sprite genérico (íconos del menú) — 5×5 */
  function sprite(map, cls) {
    var rows = map.trim().split("\n");
    var out = '<span class="px-sprite ' + (cls || "") + '" style="grid-template-columns:repeat(' + rows[0].length + ',var(--pixel))">';
    rows.forEach(function (row) { for (var i = 0; i < row.length; i++) out += '<i class="' + (row[i] === "#" ? "on" : row[i] === "+" ? "sd" : "") + '"></i>'; });
    return out + "</span>";
  }
  var ICONS = {
    alma:   "..#..\n.###.\n..#..\n.###.\n#...#",
    taller: "#...#\n.#.#.\n..#..\n.#.#.\n#...#",
    clan:   ".#.#.\n#.#.#\n.....\n#.#.#\n.#.#.",
    mundo:  ".###.\n#...#\n#.+.#\n#...#\n.###.",
    plan:   "#####\n#...#\n#.#.#\n#...#\n#####",
    lumbre: "..+..\n.+#+.\n+#+#+\n.+#+.\n..+.."
  };

  /* ===========================================================
     TOAST + LUMBRE
     =========================================================== */
  var toastTimer = null;
  function toast(msg) {
    var t = $("#toast"); if (!t) { t = el('<div class="toast" id="toast"></div>'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("in");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("in"); }, 3200);
  }

  var lumbreLines = null;
  function lumbreSay(lines, open) {
    lumbreLines = Array.isArray(lines) ? lines : [lines];
    var p = $("#lumbrePanel");
    if (p) p.innerHTML = lumbrePanelHTML();
    var dock = $("#lumbreDock");
    if (open && dock) { dock.classList.add("open"); renderLumbre(true); }
  }
  function lumbrePanelHTML() {
    var lines = lumbreLines || lumbreContextual();
    return '<div class="name">Lumbre</div>' + lines.map(function (l, i) { return '<p class="say">' + esc(l) + "</p>"; }).join("");
  }
  function lumbreContextual() {
    var e = essence(), st = soulState();
    if (st.key === "dormida") return ["Esta Alma permanece en silencio.", "Pero su Esencia aún alimenta las raíces del Árbol."];
    var next = DESPERTARES.filter(function (d) { return e < d.at; })[0];
    if (e < 120) return ["Bienvenida, Alma. Acabas de llegar al Origen.", "Cada cosa que crees dejará una huella: eso es la Esencia."];
    if (next) return ["El Árbol reconoce tu presencia.", "Aún duerme " + next.title + ". Despierta al alcanzar " + fmt(next.at) + " de Esencia."];
    return ["Tu trayectoria ya forma parte de ANIMA.", "Ninguna huella desaparece de aquí."];
  }
  function renderLumbre(forceOpen) {
    var dock = $("#lumbreDock");
    if (!dock) {
      dock = el(
        '<div class="lumbre-dock" id="lumbreDock">' +
        '<div class="lumbre-panel" id="lumbrePanel"></div>' +
        '<button class="lumbre-orb" id="lumbreOrb" title="Lumbre">' + sprite(ICONS.lumbre) + "</button>" +
        "</div>");
      document.body.appendChild(dock);
      $("#lumbreOrb").addEventListener("click", function () {
        dock.classList.toggle("open");
        $("#lumbrePanel").style.display = dock.classList.contains("open") ? "block" : "none";
      });
    }
    $("#lumbrePanel").innerHTML = lumbrePanelHTML();
    $("#lumbrePanel").style.display = (forceOpen || dock.classList.contains("open")) ? "block" : "none";
  }

  /* ===========================================================
     MODAL (crear huellas)
     =========================================================== */
  function modal(title, fields, onSave) {
    var body = fields.map(function (f) {
      if (f.type === "textarea") return '<label>' + esc(f.label) + '</label><textarea data-k="' + f.k + '" placeholder="' + esc(f.ph || "") + '"></textarea>';
      if (f.type === "select") return '<label>' + esc(f.label) + '</label><select data-k="' + f.k + '">' + f.opts.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + "</option>"; }).join("") + "</select>";
      return '<label>' + esc(f.label) + '</label><input data-k="' + f.k + '" placeholder="' + esc(f.ph || "") + '" />';
    }).join("");
    var m = el('<div class="modal"><div class="sheet"><h3>' + esc(title) + "</h3>" + body +
      '<div class="row"><button class="btn ghost sm" data-x>Cancelar</button><button class="btn sm" data-ok>Guardar</button></div></div></div>');
    document.body.appendChild(m);
    var close = function () { m.remove(); };
    m.addEventListener("click", function (e) { if (e.target === m || e.target.hasAttribute("data-x")) close(); });
    $("[data-ok]", m).addEventListener("click", function () {
      var data = {}; m.querySelectorAll("[data-k]").forEach(function (i) { data[i.getAttribute("data-k")] = i.value.trim(); });
      onSave(data); close();
    });
    var first = m.querySelector("[data-k]"); if (first) first.focus();
  }

  /* ===========================================================
     CEREMONIA — primera experiencia (SOLO UNA VEZ)
     =========================================================== */
  var CEREMONY = [
    { type: "landing" }, { type: "umbral" }, { type: "pacto" }, { type: "crear" },
    { type: "despertar" }, { type: "lumbre" }, { type: "arbol" }, { type: "esencia" }, { type: "entrar" }
  ];
  function runCeremony() {
    var root = $("#ceremony"); root.classList.remove("hide");
    var step = 0, draft = { nombre: "", pais: "" };

    function dots() {
      return '<div class="cer-progress">' + CEREMONY.map(function (_, i) { return '<span class="cer-dot' + (i <= step ? " on" : "") + '"></span>'; }).join("") + "</div>";
    }
    function show(html) {
      root.innerHTML = '<div class="cer-skip"><a href="#" id="cerSkip">saltar el Origen</a></div>' +
        '<div class="cer-stage" id="cerStage">' + html + "</div>" + dots();
      requestAnimationFrame(function () { $("#cerStage").classList.add("in"); });
      var sk = $("#cerSkip"); if (sk) sk.addEventListener("click", function (e) { e.preventDefault(); finish(); });
    }
    function next() { step++; if (step >= CEREMONY.length) return finish(); paint(); }

    function finish() {
      if (!S.alma) {
        S.alma = { nombre: draft.nombre || "Alma del Origen", pais: draft.pais || "", avatar: makeAvatar(draft.nombre), esencia: 0, plan: "ALMA", createdAt: now(), lastSeen: now() };
      }
      if (!S.alma.esencia) S.alma.esencia = 120;        /* primera Esencia */
      S.first_awakening = true;
      logHito("Origen", "Tu Alma despertó en ANIMA.");
      logHito("Esencia", "Recibiste tu primera Esencia.");
      save();
      root.classList.add("hide"); root.innerHTML = "";
      boot();
    }

    function paint() {
      var s = CEREMONY[step];
      if (s.type === "landing") show(
        '<div class="cer-eyebrow mono-up">The Founding Era</div>' +
        '<h1 class="pixel">ANIMA</h1>' +
        '<p>Aquí no existen usuarios. Existen Almas. Un mundo vivo que apenas comienza a despertar.</p>' +
        '<div class="cer-actions"><button class="btn" id="cn">Acercarse al umbral</button></div>');
      else if (s.type === "umbral") show(
        '<div class="cer-eyebrow mono-up">El Umbral</div>' +
        '<h2>Estás frente a un mundo que todavía está naciendo.</h2>' +
        '<p>Sus raíces son jóvenes. Sus ramas aún buscan el cielo. Lo que crees aquí ayudará a darle forma.</p>' +
        '<div class="cer-actions"><button class="btn ghost" id="cb">Volver</button><button class="btn" id="cn">Cruzar el umbral</button></div>');
      else if (s.type === "pacto") show(
        '<div class="cer-eyebrow mono-up">Pacto del Origen · Carta</div>' +
        '<div class="cer-letter">' +
        '<p>Bienvenido, Alma.</p>' +
        '<p>ANIMA aún está despertando. Sus raíces son jóvenes. Sus ramas todavía buscan el cielo.</p>' +
        '<p>Tus Ecos ayudarán a darle forma. Tu Esencia permanecerá aquí.</p>' +
        '<p>Y quizás, algún día, puedas decir: <strong>"Yo estuve en el Origen."</strong></p>' +
        '<div class="sign">— Lumbre, presencia de ANIMA</div></div>' +
        '<div class="cer-actions"><button class="btn" id="cn">Acepto el Pacto</button></div>');
      else if (s.type === "crear") show(
        '<div class="cer-eyebrow mono-up">Crear Alma</div>' +
        '<h2>¿Con qué nombre habitarás ANIMA?</h2>' +
        '<input class="cer-field" id="fN" placeholder="Tu nombre de Alma" value="' + esc(draft.nombre) + '" />' +
        '<input class="cer-field" id="fP" placeholder="¿Desde qué país creas?" value="' + esc(draft.pais) + '" />' +
        '<div id="avPrev" style="margin:18px 0 6px"></div>' +
        '<p class="faint" style="font-size:12px">Este sello pixel es único de tu Alma.</p>' +
        '<div class="cer-actions"><button class="btn" id="cn">Dar forma a mi Alma</button></div>');
      else if (s.type === "despertar") show(
        '<div class="cer-eyebrow mono-up">Primer Despertar</div>' +
        '<h2>' + esc(draft.nombre || "Tu Alma") + ' abre los ojos.</h2>' +
        '<div style="margin:22px 0">' + avatarHTML(makeAvatar(draft.nombre), true) + "</div>" +
        '<p>Naciste del Silencio. Ahora eres una chispa de conciencia dentro de ANIMA.</p>' +
        '<div class="cer-actions"><button class="btn" id="cn">Continuar</button></div>');
      else if (s.type === "lumbre") show(
        '<div class="cer-eyebrow mono-up">Lumbre</div>' +
        '<div style="margin:0 auto 18px;width:max-content">' + sprite(ICONS.lumbre) + "</div>" +
        '<h2>Yo soy Lumbre.</h2>' +
        '<p>No soy una aplicación ni un asistente. Soy una presencia. Escucho, recuerdo y acompaño. Te explicaré la Esencia y el Árbol cuando lo necesites.</p>' +
        '<div class="cer-actions"><button class="btn" id="cn">Gracias, Lumbre</button></div>');
      else if (s.type === "arbol") {
        show(
          '<div class="cer-eyebrow mono-up">El Árbol despierta</div>' +
          '<canvas class="tree-canvas" id="cerTree" style="margin:0 auto 18px;display:block"></canvas>' +
          '<h2>Este es el corazón de ANIMA.</h2>' +
          '<p>Vive de la Esencia de todas las Almas. Cada cosa que crees lo hará crecer: ramas, hojas, flores, raíces.</p>' +
          '<div class="cer-actions"><button class="btn" id="cn">Lo siento latir</button></div>');
        drawTree($("#cerTree"), essenceGlobal());
      }
      else if (s.type === "esencia") show(
        '<div class="cer-eyebrow mono-up">Tu primera Esencia</div>' +
        '<div class="essence-burst pixel">120</div>' +
        '<h2 style="margin-top:10px">El Árbol ha reconocido tu presencia.</h2>' +
        '<p>Esta Esencia nunca desaparecerá. Nunca disminuirá. Solo crecerá contigo. Porque ninguna huella desaparece de ANIMA.</p>' +
        '<div class="cer-actions"><button class="btn" id="cn">Recibir mi Esencia</button></div>');
      else if (s.type === "entrar") show(
        '<div class="cer-eyebrow mono-up">El Origen ha ocurrido</div>' +
        '<h2>Bienvenida a ANIMA, ' + esc(draft.nombre || "Alma") + '.</h2>' +
        '<p>Ya formas parte de su historia. Esto no volverá a ocurrir: a partir de ahora, entrarás directamente a tu Alma.</p>' +
        '<div class="cer-actions"><button class="btn" id="cn">Entrar a ANIMA</button></div>');

      var cn = $("#cn"); if (cn) cn.addEventListener("click", function () {
        if (s.type === "crear") {
          draft.nombre = $("#fN").value.trim(); draft.pais = $("#fP").value.trim();
          if (!draft.nombre) { $("#fN").focus(); $("#fN").style.borderColor = "var(--ink)"; return; }
        }
        next();
      });
      var cb = $("#cb"); if (cb) cb.addEventListener("click", function () { step = Math.max(0, step - 1); paint(); });
      if (s.type === "crear") {
        var redraw = function () { draft.nombre = $("#fN").value.trim(); $("#avPrev").innerHTML = avatarHTML(makeAvatar(draft.nombre)); };
        $("#fN").addEventListener("input", redraw); redraw();
      }
    }
    paint();
  }

  /* ===========================================================
     APP — el mundo habitado (menú definitivo)
     =========================================================== */
  var VIEWS = ["mialma", "taller", "clan", "mundo", "plan"];
  var MENU = [
    { v: "mialma", t: "Mi Alma", icon: "alma" },
    { v: "taller", t: "Taller", icon: "taller" },
    { v: "clan",   t: "Clan",   icon: "clan" },
    { v: "mundo",  t: "Mundo",  icon: "mundo" },
    { v: "plan",   t: "Mi Plan", icon: "plan" }
  ];
  var SOON = ["Mercados", "Viajes", "Reino", "Archivo Universal"];
  var current = "mialma";
  var subtab = {}; /* subtab por vista */

  function syncTop() {
    var e = $("#essVal"); if (e) e.textContent = fmt(essence());
    var ss = soulState(), sEl = $("#soulState");
    if (sEl) { sEl.className = "soul-state " + ss.key; sEl.innerHTML = '<span class="dot"></span>' + esc(ss.label); }
  }

  function shell() {
    return (
      '<div class="topbar">' +
        '<div class="brand"><span class="seal pixel">∞</span> ANIMA</div>' +
        '<div style="display:flex;align-items:center;gap:18px">' +
          '<span class="soul-state activa" id="soulState"><span class="dot"></span>Activa</span>' +
          '<span class="ess">Esencia <b id="essVal">0</b></span>' +
        '</div>' +
      '</div>' +
      '<div class="shell">' +
        '<nav class="menu">' +
          MENU.map(function (m) { return '<a href="#" data-v="' + m.v + '"><span class="px">' + sprite(ICONS[m.icon]) + '</span>' + esc(m.t) + "</a>"; }).join("") +
          '<div class="soon"><div class="mono-up" style="padding:0 14px 8px">Próximamente</div>' +
            SOON.map(function (s) { return '<a href="#" data-soon="' + esc(s) + '">✦ ' + esc(s) + "</a>"; }).join("") +
          "</div>" +
        '</nav>' +
        '<main class="view" id="view"></main>' +
      "</div>");
  }

  function render() {
    if (!S.alma) return;
    var v = $("#view"); if (!v) return;
    document.querySelectorAll(".menu a[data-v]").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-v") === current); });
    v.innerHTML = ({
      mialma: viewMiAlma, taller: viewTaller, clan: viewClan, mundo: viewMundo, plan: viewPlan
    })[current]();
    bindView();
    syncTop();
    renderLumbre();
  }

  /* ----- MI ALMA ----- */
  function viewMiAlma() {
    var a = S.alma, ss = soulState(), pr = progress();
    var sueno = a.sueno;
    return (
      head("Mi Alma", "La identidad. Tu Esencia, tu trayectoria y tu Senda.") +
      '<div class="grid c2" style="align-items:start">' +
        '<div class="block" style="display:flex;gap:20px;align-items:center">' +
          avatarHTML(a.avatar, true) +
          '<div><h3 style="font-size:22px">' + esc(a.nombre) + "</h3>" +
          '<p class="muted">' + (a.pais ? esc(a.pais) + " · " : "") + ss.glyph + " " + ss.label + "</p>" +
          '<p class="faint" style="font-size:12px;margin-top:6px">En el Origen desde ' + new Date(a.createdAt).toLocaleDateString("es") + "</p></div>" +
        "</div>" +
        '<div class="stat"><div class="k">Esencia</div><div class="v">' + fmt(essence()) + '</div>' +
          '<div class="essbar"><i style="width:' + pr.pct + '%"></i></div>' +
          '<p class="faint" style="font-size:12px;margin-top:8px">' + (pr.next ? "Faltan " + fmt(pr.next.at - essence()) + " para " + pr.next.title : "Todos los Despertares han ocurrido") + "</p></div>" +
      "</div>" +

      /* SENDA */
      '<div class="block" style="margin-top:14px"><div class="mono-up">Senda · El camino del Alma</div>' +
        '<div style="margin:14px 0 6px"><div class="muted" style="font-size:13px">¿Hacia dónde se dirige tu Alma?</div>' +
        (sueno ? '<h3 style="font-size:20px;margin-top:6px">' + esc(sueno) + "</h3>" : '<button class="btn ghost sm" data-act="sueno" style="margin-top:10px">Declarar mi Sueño</button>') + "</div>" +
        '<div class="mono-up" style="margin-top:18px">Semillas</div>' +
        S.semillas.map(function (sm) {
          return '<div class="seed-item"><span class="pixel">🌱</span><span>' + esc(sm.t) + '</span>' +
            '<span class="seed-state ' + sm.s + '">' + sm.s + "</span>" +
            (sm.s !== "floreciendo" ? '<button class="btn ghost sm" data-seed="' + sm.id + '">Hacer crecer</button>' : "") + "</div>";
        }).join("") +
        '<button class="btn ghost sm" data-act="semilla" style="margin-top:14px">Plantar Semilla</button>' +
      "</div>" +

      /* Trayectoria / Insignias */
      '<div class="grid c2" style="margin-top:14px;align-items:start">' +
        '<div class="block"><h3>Insignias</h3><p class="lead">No se anuncian, se descubren.</p>' +
          '<div class="grid c3" style="margin-top:14px">' + badgesHTML() + "</div></div>" +
        '<div class="block"><h3>Cronología</h3><p class="lead">Porque ANIMA recordará.</p>' +
          (S.cronologia.length ? '<ul class="list" style="margin-top:10px">' + S.cronologia.slice(0, 6).map(function (h) {
            return "<li><span>" + esc(h.text) + '</span><span class="when">' + ago(h.when) + "</span></li>";
          }).join("") + "</ul>" : '<div class="empty">Tu historia comienza ahora.</div>') +
        "</div>" +
      "</div>" +

      /* Portafolio · Memorias · Biblioteca · Ecos */
      '<div class="grid c2" style="margin-top:14px;align-items:start">' +
        collectionBlock("Portafolio", "portafolio", "obra", "Subir obra") +
        collectionBlock("Memorias", "memorias", "memoria", "Guardar memoria") +
        collectionBlock("Biblioteca", "biblioteca", "doc", "Añadir a la biblioteca") +
        ecosRecientesBlock() +
      "</div>");
  }
  function progress() {
    var e = essence(), next = DESPERTARES.filter(function (d) { return e < d.at; })[0];
    if (!next) return { pct: 100, next: null };
    var prev = DESPERTARES.filter(function (d) { return e >= d.at; }).pop();
    var lo = prev ? prev.at : 0;
    return { pct: Math.round(((e - lo) / (next.at - lo)) * 100), next: next };
  }
  function collectionBlock(title, key, kind, cta) {
    var items = S[key] || [];
    return '<div class="block"><h3>' + esc(title) + "</h3>" +
      (items.length ? '<ul class="list" style="margin-top:10px">' + items.slice(0, 5).map(function (it) {
        return "<li><span>" + esc(it.t) + (it.d ? ' — <span class="muted">' + esc(it.d) + "</span>" : "") + '</span><span class="when">' + ago(it.when) + "</span></li>";
      }).join("") + "</ul>" : '<div class="empty" style="margin-top:10px">Aún vacío.</div>') +
      '<button class="btn ghost sm" data-new="' + kind + '" style="margin-top:14px">' + esc(cta) + "</button></div>";
  }
  function ecosRecientesBlock() {
    return '<div class="block"><h3>Ecos recientes</h3>' +
      (S.ecos.length ? '<ul class="list" style="margin-top:10px">' + S.ecos.slice(0, 4).map(function (e) {
        return "<li><span>" + esc(e.body) + '</span><span class="when">' + ago(e.when) + "</span></li>";
      }).join("") + "</ul>" : '<div class="empty" style="margin-top:10px">Comparte tu primer Eco en el Mundo.</div>') +
      '<button class="btn ghost sm" data-new="eco" style="margin-top:14px">Compartir un Eco</button></div>';
  }
  var BADGES = [
    { k: "origen", n: "Alma del Origen", d: "Estuviste en el comienzo." },
    { k: "primer_eco", n: "Primer Eco", d: "Tu voz resonó." },
    { k: "constructor", n: "Constructor", d: "Tu primer proyecto." },
    { k: "jardinero", n: "Jardinero", d: "Una Semilla floreció." },
    { k: "vinculo", n: "Vínculo", d: "Conectaste con otra Alma." },
    { k: "persistencia", n: "Persistencia", d: "El Árbol te reconoce." }
  ];
  function badgesHTML() {
    return BADGES.map(function (b) {
      var has = !!S.insignias[b.k];
      return '<div class="badge' + (has ? "" : " locked") + '"><span class="pixel" style="font-size:18px">' + (has ? "✦" : "·") + "</span>" +
        "<b>" + (has ? esc(b.n) : "Por descubrir") + "</b><small>" + (has ? esc(b.d) : "—") + "</small></div>";
    }).join("");
  }
  function award(k) { if (!S.insignias[k]) { S.insignias[k] = now(); var b = BADGES.filter(function (x) { return x.k === k; })[0]; if (b) { logHito("Insignia", "Descubriste: " + b.n); grow(50, "Una Insignia se ha revelado: " + b.n + "."); } } }

  /* ----- TALLER ----- */
  function viewTaller() {
    var tab = subtab.taller || "proyectos";
    var body;
    if (tab === "proyectos") {
      if (subtab.proyecto) {
        var p = S.proyectos.filter(function (x) { return x.id === subtab.proyecto; })[0];
        body = p ? projectDetail(p) : "";
      } else {
        body = listBlock(S.proyectos, "Proyectos", "proyecto", "Crear proyecto", function (p) {
          return '<li data-open="' + p.id + '" style="cursor:pointer"><span><b>' + esc(p.t) + "</b>" + (p.d ? ' — <span class="muted">' + esc(p.d) + "</span>" : "") + '</span><span class="when">abrir →</span></li>';
        });
      }
    } else if (tab === "vinculos") {
      body = listBlock(S.vinculos, "Vínculos", "vinculo", "Añadir vínculo", function (v) {
        return "<li><span><b>" + esc(v.t) + "</b>" + (v.d ? ' — <span class="muted">' + esc(v.d) + "</span>" : "") + '</span><span class="when">' + ago(v.when) + "</span></li>";
      });
    } else {
      body = listBlock(S.agenda, "Agenda", "agenda", "Añadir a la agenda", function (g) {
        return "<li><span><b>" + esc(g.t) + "</b>" + (g.d ? ' — <span class="muted">' + esc(g.d) + "</span>" : "") + '</span><span class="when">' + ago(g.when) + "</span></li>";
      });
    }
    return head("Taller", "Tu espacio profesional. Lo que creas.") +
      tabs("taller", [["proyectos", "Proyectos"], ["vinculos", "Vínculos"], ["agenda", "Agenda"]]) + body;
  }
  function projectDetail(p) {
    var t = subtab.ptab || "resumen";
    var inner;
    if (t === "resumen") inner = '<div class="block"><h3>' + esc(p.t) + "</h3><p class=\"lead\">" + esc(p.d || "Sin descripción.") + "</p></div>";
    else if (t === "cotizaciones") inner = miniList(p, "cotizaciones", "Cotización", "Nueva cotización");
    else if (t === "finanzas") inner = miniList(p, "finanzas", "Movimiento", "Registrar movimiento");
    else if (t === "archivos") inner = miniList(p, "archivos", "Archivo", "Añadir archivo");
    else inner = '<div class="block"><h3>Actividad</h3>' + (p.log && p.log.length ? '<ul class="list" style="margin-top:10px">' + p.log.map(function (l) { return "<li><span>" + esc(l.t) + '</span><span class="when">' + ago(l.when) + "</span></li>"; }).join("") + "</ul>" : '<div class="empty" style="margin-top:10px">Sin actividad.</div>') + "</div>";
    return '<button class="btn ghost sm" data-back="taller" style="margin-bottom:16px">← Proyectos</button>' +
      '<h2 style="margin-bottom:14px">' + esc(p.t) + "</h2>" +
      tabs("ptab", [["resumen", "Resumen"], ["cotizaciones", "Cotizaciones"], ["finanzas", "Finanzas"], ["archivos", "Archivos"], ["actividad", "Actividad"]]) + inner;
  }
  function miniList(p, key, label, cta) {
    p[key] = p[key] || [];
    return '<div class="block"><h3>' + esc(label) + 's</h3>' +
      (p[key].length ? '<ul class="list" style="margin-top:10px">' + p[key].map(function (x) { return "<li><span>" + esc(x.t) + "</span><span class=\"when\">" + ago(x.when) + "</span></li>"; }).join("") + "</ul>" : '<div class="empty" style="margin-top:10px">Vacío.</div>') +
      '<button class="btn ghost sm" data-pnew="' + key + '" style="margin-top:14px">' + esc(cta) + "</button></div>";
  }
  function listBlock(arr, title, kind, cta, row) {
    return '<div class="block"><h3>' + esc(title) + "</h3>" +
      (arr.length ? '<ul class="list" style="margin-top:12px">' + arr.map(row).join("") + "</ul>" : '<div class="empty" style="margin-top:12px">Aún no hay nada aquí. Lo que crees dejará Esencia.</div>') +
      '<button class="btn ghost sm" data-new="' + kind + '" style="margin-top:16px">' + esc(cta) + "</button></div>";
  }

  /* ----- CLAN ----- */
  function viewClan() {
    if (!awake("CLAN", essence())) {
      return head("Clan", "Espacio colaborativo.") + dormantScreen("Clan", "Tu voz aún viaja sola.", 500);
    }
    var tab = subtab.clan || "panel";
    var almasConectadas = WORLD_ALMAS.slice(0, 4);
    var body;
    if (tab === "panel") body =
      '<div class="grid c2"><div class="block"><h3>Almas conectadas</h3><ul class="list" style="margin-top:10px">' +
      almasConectadas.map(function (a) { return "<li><span>" + esc(a.n) + ' <span class="muted">· ' + esc(a.p) + "</span></span></li>"; }).join("") + "</ul></div>" +
      '<div class="block"><h3>Actividad reciente</h3><ul class="list" style="margin-top:10px">' +
      '<li><span>Lucía compartió un proceso</span><span class="when">2 h</span></li>' +
      '<li><span>Mateo añadió un proyecto compartido</span><span class="when">1 d</span></li></ul></div></div>' +
      '<div class="block" style="margin-top:14px"><h3>Recordatorios</h3><div class="empty" style="margin-top:10px">Tu Clan está despertando. Pronto coordinarán juntos.</div></div>';
    else if (tab === "calendario") body = '<div class="block"><h3>Calendario</h3><div class="empty" style="margin-top:10px">Próximos eventos del Clan.</div></div>';
    else if (tab === "proyectos") body = '<div class="block"><h3>Proyectos compartidos</h3><div class="empty" style="margin-top:10px">Aún no hay proyectos compartidos.</div></div>';
    else body = '<div class="block"><h3>Plan de trabajo</h3><div class="empty" style="margin-top:10px">Define cómo crearán juntos.</div></div>';
    return head("Clan", "Con quién creo. De 2 a 8 Almas.") +
      tabs("clan", [["panel", "Panel"], ["calendario", "Calendario"], ["proyectos", "Proyectos compartidos"], ["plan", "Plan de trabajo"]]) + body;
  }

  /* ----- MUNDO ----- */
  function viewMundo() {
    var tab = subtab.mundo || "constelacion";
    var body;
    if (tab === "constelacion") body = mundoConstelacion();
    else if (tab === "arbol") body = mundoArbol();
    else if (tab === "ecos") body = mundoEcos();
    else body = mundoConsejo();
    return head("Mundo", "El mundo que habito. Debe sentirse inmenso.") +
      tabs("mundo", [["constelacion", "Constelación"], ["arbol", "Árbol"],
        ["ecos", "Ecos" + (awake("ECOS", essence()) ? "" : " ·dormido")],
        ["consejo", "Consejo" + (awake("CONSEJO", essence()) ? "" : " ·dormido")]]) + body;
  }
  function mundoConstelacion() {
    var stars = WORLD_ALMAS.map(function (a) {
      return '<span class="star alma" style="left:' + a.x + "%;top:" + a.y + "%;animation-delay:" + (a.x % 5) + 's" title="' + esc(a.n) + " · " + esc(a.p) + '"></span>';
    }).join("");
    var you = '<span class="you" style="left:52%;top:48%" title="' + esc(S.alma.nombre) + '"></span>';
    var paisRows = Object.keys(PAISES).sort(function (a, b) { return PAISES[b] - PAISES[a]; });
    return '<div class="grid c2" style="align-items:start"><div>' +
      '<div class="sky">' + stars + you + "</div>" +
      '<p class="faint" style="font-size:12px;margin-top:10px">Mapa vivo · ' + (WORLD_ALMAS.length + 1) + " Almas presentes</p></div>" +
      '<div><div class="grid c2"><div class="stat"><div class="k">Almas activas</div><div class="v">' + (WORLD_ALMAS.length + 1) + "</div></div>" +
      '<div class="stat"><div class="k">Países</div><div class="v">' + Object.keys(PAISES).length + "</div></div></div>" +
      '<div class="block" style="margin-top:14px"><h3>Almas por país</h3><ul class="list" style="margin-top:10px">' +
      paisRows.map(function (p) { return "<li><span>" + esc(p) + '</span><span class="when">' + PAISES[p] + "</span></li>"; }).join("") + "</ul></div></div></div>";
  }
  function mundoArbol() {
    var g = essenceGlobal(), st = treeStage(g);
    var nextStage = TREE_STAGES.filter(function (s) { return g < s.at; })[0];
    return '<div class="tree-stage"><canvas class="tree-canvas" id="worldTree"></canvas>' +
      '<div class="tree-meta">' +
      '<div><div class="k">Estado</div><div class="v">' + st.sym + " " + st.name + "</div></div>" +
      '<div><div class="k">Esencia Global</div><div class="v">' + fmt(g) + "</div></div>" +
      '<div><div class="k">Etapa actual</div><div class="v">' + st.name + "</div></div>" +
      (nextStage ? '<div><div class="k">Evolución</div><div class="v">' + fmt(nextStage.at - g) + " →</div></div>" : "") +
      "</div></div>" +
      '<p class="muted center" style="margin-top:16px;max-width:560px;margin-left:auto;margin-right:auto">El Árbol es el corazón de ANIMA. Se alimenta de la suma de la Esencia de todas las Almas. Toda huella lo transforma.</p>';
  }
  function mundoEcos() {
    if (!awake("ECOS", essence())) return dormantScreen("Ecos", "Tus creaciones aún no comienzan a resonar.", 2000);
    var all = S.ecos.concat(WORLD_ECOS).sort(function (a, b) {
      var aw = a.when > 1e11 ? a.when : now() - a.when, bw = b.when > 1e11 ? b.when : now() - b.when; return bw - aw;
    });
    return '<button class="btn sm" data-new="eco" style="margin-bottom:16px">Compartir un Eco</button>' +
      '<div class="grid" style="gap:12px">' + all.slice(0, 10).map(function (e) {
        var whenMs = e.when > 1e11 ? e.when : now() - e.when;
        var resonado = S.resonados[e.id];
        return '<div class="eco"><div class="who">' + esc(e.who) + ' <span class="flag">· ' + esc(e.p) + " · " + esc(e.kind) + '</span></div>' +
          '<div class="body">' + esc(e.body) + "</div>" +
          '<div class="meta">' + ago(whenMs) + " · " +
          (e.who === S.alma.nombre ? "tu Eco" : '<a href="#" data-spark="' + e.id + '">' + (resonado ? "✦ resonó contigo" : "Enviar una Chispa") + "</a>") +
          "</div></div>";
      }).join("") + "</div>";
  }
  function mundoConsejo() {
    if (!awake("CONSEJO", essence())) return dormantScreen("Consejo", "Lumbre aún reconoce tu trayectoria en silencio.", 5000);
    return '<div class="grid c2" style="align-items:start">' +
      '<div class="block"><div class="mono-up">Mensajes de Lumbre</div>' +
      '<p style="margin-top:12px;font-size:15.5px">Tu trayectoria ha sido reconocida. El Consejo escucha a las Almas que han dejado huella.</p></div>' +
      '<div class="block"><h3>Noticias del mundo</h3><ul class="list" style="margin-top:10px">' +
      '<li><span>El Árbol entró en una nueva etapa</span><span class="when">hoy</span></li>' +
      '<li><span>Nuevas Almas despertaron en el Origen</span><span class="when">2 d</span></li></ul></div>' +
      '<div class="block"><h3>Tutoriales</h3><ul class="list" style="margin-top:10px">' +
      '<li><span>¿Qué es la Esencia?</span></li><li><span>El Árbol y la Esencia Global</span></li></ul></div>' +
      '<div class="block"><h3>Eventos</h3><div class="empty" style="margin-top:10px">Los Rituales del mundo se anunciarán aquí.</div></div></div>';
  }

  /* ----- MI PLAN ----- */
  function viewPlan() {
    var plan = S.alma.plan || "ALMA";
    var cards = [
      { k: "ALMA", t: "Alma", d: "1 Alma. Tu espacio privado y tu Senda.", req: 0 },
      { k: "CLAN", t: "Clan", d: "De 2 a 8 Almas. Crear en comunidad.", req: 500 },
      { k: "SANTUARIO", t: "Santuario", d: "Más de 8 Almas. Un estado superior: Ecos privados, eventos, Árbol propio y símbolos únicos.", req: 10000 }
    ];
    return head("Mi Plan", "Lo que puedes llegar a ser.") +
      '<div class="grid c3">' + cards.map(function (c) {
        var unlocked = essence() >= c.req, active = plan === c.k;
        return '<div class="block" style="' + (active ? "border-color:var(--ink)" : "") + '"><div class="mono-up">' + (active ? "Tu estado" : c.req ? "Despierta en " + fmt(c.req) : "Base") + "</div>" +
          '<h3 style="font-size:22px;margin-top:10px">' + esc(c.t) + "</h3><p class=\"lead\" style=\"margin-top:6px\">" + esc(c.d) + "</p>" +
          (active ? '<p class="muted" style="margin-top:14px">● Habitando</p>'
            : unlocked ? '<button class="btn ghost sm" data-plan="' + c.k + '" style="margin-top:14px">Adoptar</button>'
            : '<p class="faint" style="margin-top:14px">Dormido — ' + fmt(c.req - essence()) + " de Esencia</p>") + "</div>";
      }).join("") + "</div>" +
      '<div class="block" style="margin-top:14px"><div class="mono-up">Santuario</div>' +
      '<p style="margin-top:12px;max-width:600px" class="muted">El Santuario no es una sección: es un estado superior. Cuando muchas Almas convergen, nace un espacio con su propio Árbol, sus Ecos privados y sus símbolos. Aún duerme.</p></div>';
  }

  /* ----- helpers de vista ----- */
  function head(t, sub) { return '<div class="view-head"><div class="mono-up">ANIMA · ' + esc(t) + '</div><h2>' + esc(t) + "</h2><p>" + esc(sub) + "</p></div>"; }
  function tabs(group, items) {
    var cur = group === "ptab" ? (subtab.ptab || items[0][0]) : (subtab[group] || items[0][0]);
    return '<div class="tabs">' + items.map(function (it) {
      return '<button data-tab="' + group + '" data-val="' + it[0] + '" class="' + (cur === it[0] ? "active" : "") + '">' + esc(it[1]) + "</button>";
    }).join("") + "</div>";
  }
  function dormantScreen(name, line, at) {
    return '<div class="dormant-screen"><div class="lock pixel">☾</div><h3>' + esc(name) + " duerme</h3>" +
      "<p>" + esc(line) + ' Despertará cuando tu Esencia alcance <b>' + fmt(at) + "</b>.</p>" +
      '<div class="essbar" style="max-width:320px;margin:22px auto 0"><i style="width:' + Math.min(100, Math.round(essence() / at * 100)) + '%"></i></div>' +
      '<p class="faint" style="margin-top:10px;font-size:12px">' + fmt(essence()) + " / " + fmt(at) + " de Esencia</p></div>";
  }

  /* ===========================================================
     EVENTOS DE VISTA
     =========================================================== */
  function bindView() {
    var v = $("#view");
    /* navegación de menú */
    document.querySelectorAll(".menu a[data-v]").forEach(function (a) {
      a.onclick = function (e) { e.preventDefault(); current = a.getAttribute("data-v"); subtab.proyecto = null; render(); };
    });
    document.querySelectorAll(".menu a[data-soon]").forEach(function (a) {
      a.onclick = function (e) { e.preventDefault(); var n = a.getAttribute("data-soon"); lumbreSay(["✦ " + n + " aún no despierta.", soonDesc(n)], true); };
    });
    /* tabs */
    v.querySelectorAll("[data-tab]").forEach(function (b) {
      b.onclick = function () { var g = b.getAttribute("data-tab"); subtab[g] = b.getAttribute("data-val"); if (g === "taller") subtab.proyecto = null; render(); };
    });
    /* abrir proyecto */
    v.querySelectorAll("[data-open]").forEach(function (li) { li.onclick = function () { subtab.proyecto = li.getAttribute("data-open"); subtab.ptab = "resumen"; render(); }; });
    v.querySelectorAll("[data-back]").forEach(function (b) { b.onclick = function () { subtab.proyecto = null; render(); }; });
    /* declarar sueño / plantar semilla */
    v.querySelectorAll("[data-act]").forEach(function (b) {
      b.onclick = function () {
        var act = b.getAttribute("data-act");
        if (act === "sueno") modal("Tu Sueño", [{ k: "v", label: "¿Hacia dónde se dirige tu Alma?", ph: "Convertirme en muralista internacional" }], function (d) { if (d.v) { S.alma.sueno = d.v; logHito("Senda", "Declaraste tu Sueño."); grow(40, "El Árbol ha reconocido tu presencia."); } });
        if (act === "semilla") modal("Plantar Semilla", [{ k: "v", label: "Nombre de la Semilla", ph: "Compartir mi primer Eco" }], function (d) { if (d.v) { S.semillas.push({ id: uid(), t: d.v, s: "dormida" }); save(); render(); } });
      };
    });
    /* hacer crecer una semilla */
    v.querySelectorAll("[data-seed]").forEach(function (b) {
      b.onclick = function () {
        var sm = S.semillas.filter(function (x) { return x.id === b.getAttribute("data-seed"); })[0]; if (!sm) return;
        if (sm.s === "dormida") sm.s = "brotando";
        else if (sm.s === "brotando") { sm.s = "floreciendo"; award("jardinero"); logHito("Semilla", '"' + sm.t + '" floreció.'); grow(GIVES.semilla, "Una Semilla ha florecido. Tu Esencia crece."); return; }
        save(); render();
      };
    });
    /* nuevas huellas */
    v.querySelectorAll("[data-new]").forEach(function (b) { b.onclick = function () { newHuella(b.getAttribute("data-new")); }; });
    v.querySelectorAll("[data-pnew]").forEach(function (b) { b.onclick = function () { newProjectItem(b.getAttribute("data-pnew")); }; });
    /* chispa a un Eco (ayudar a otra Alma) */
    v.querySelectorAll("[data-spark]").forEach(function (a) {
      a.onclick = function (e) { e.preventDefault(); var id = a.getAttribute("data-spark"); if (S.resonados[id]) return; S.resonados[id] = now(); grow(GIVES.chispa, "Tu Chispa ayudó a otra Alma a resonar."); };
    });
    /* adoptar plan */
    v.querySelectorAll("[data-plan]").forEach(function (b) {
      b.onclick = function () { S.alma.plan = b.getAttribute("data-plan"); logHito("Plan", "Adoptaste el estado " + b.getAttribute("data-plan") + "."); save(); render(); };
    });
  }
  function soonDesc(n) {
    return ({ "Mercados": "El intercambio de obras entre Almas.", "Viajes": "Encuentros reales entre Almas.", "Reino": "Comunidades masivas por venir.", "Archivo Universal": "La memoria eterna de ANIMA." })[n] || "Aún duerme.";
  }
  function newHuella(kind) {
    var map = {
      proyecto: { title: "Crear proyecto", arr: "proyectos", give: GIVES.proyecto, msg: "Has creado. Tu Esencia crece.", badge: "constructor", hito: "Creaste un proyecto" },
      vinculo: { title: "Añadir vínculo", arr: "vinculos", give: GIVES.vinculo, msg: "Tu voz ya no viaja sola.", badge: "vinculo", hito: "Sumaste un vínculo" },
      agenda: { title: "Añadir a la agenda", arr: "agenda", give: GIVES.agenda, msg: "El Árbol ha reconocido tu presencia.", hito: "Anotaste en tu agenda" },
      obra: { title: "Subir obra", arr: "portafolio", give: GIVES.obra, msg: "Tu obra deja huella en ANIMA.", hito: "Subiste una obra" },
      memoria: { title: "Guardar memoria", arr: "memorias", give: GIVES.memoria, msg: "ANIMA recordará.", hito: "Guardaste una memoria" },
      doc: { title: "Añadir a la biblioteca", arr: "biblioteca", give: GIVES.obra, msg: "Tu biblioteca crece.", hito: "Añadiste a tu biblioteca" },
      eco: { title: "Compartir un Eco", arr: "ecos", give: GIVES.eco, msg: "Tu Eco ha fortalecido tu Esencia.", badge: "primer_eco", hito: "Compartiste un Eco", eco: true }
    }[kind];
    if (!map) return;
    var fields = map.eco
      ? [{ k: "t", type: "textarea", label: "¿Qué quieres compartir con el mundo?", ph: "Una obra, una reflexión, un proceso…" }, { k: "kind", type: "select", label: "Tipo de Eco", opts: ["Reflexión", "Obra", "Fotografía", "Proceso"] }]
      : [{ k: "t", label: "Nombre", ph: "" }, { k: "d", type: "textarea", label: "Descripción (opcional)", ph: "" }];
    modal(map.title, fields, function (d) {
      if (!d.t) return;
      if (map.eco) { var e = pushEco(d.t, d.kind); }
      else S[map.arr].unshift({ id: uid(), t: d.t, d: d.d || "", when: now() });
      logHito("Huella", map.hito + ".");
      if (map.badge) award(map.badge);
      grow(map.give, map.msg);
    });
  }
  function newProjectItem(key) {
    var p = S.proyectos.filter(function (x) { return x.id === subtab.proyecto; })[0]; if (!p) return;
    modal("Nuevo", [{ k: "t", label: "Detalle", ph: "" }], function (d) {
      if (!d.t) return;
      p[key] = p[key] || []; p[key].unshift({ id: uid(), t: d.t, when: now() });
      p.log = p.log || []; p.log.unshift({ t: "Añadiste en " + key + ": " + d.t, when: now() });
      grow(20, "El proyecto crece. Tu Esencia también.");
    });
  }

  /* ===========================================================
     BOOT
     =========================================================== */
  function boot() {
    document.getElementById("app").innerHTML = shell();
    award("origen");                 /* insignia del Origen, una vez */
    render();
    renderLumbre();
    /* Saludo de Lumbre solo en la primera entrada de la sesión */
    if (!sessionStorage.getItem("anima_greeted")) {
      sessionStorage.setItem("anima_greeted", "1");
      setTimeout(function () { lumbreSay(lumbreContextual(), false); }, 400);
    }
  }

  function start() {
    S = load();
    if (!S.first_awakening) runCeremony();
    else { $("#ceremony").classList.add("hide"); boot(); }
    /* utilidades de desarrollo */
    window.ANIMA = {
      state: function () { return S; },
      reset: function () { localStorage.removeItem(KEY); sessionStorage.removeItem("anima_greeted"); location.reload(); },
      grow: function (n) { grow(n || 500, "Esencia otorgada."); }
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
