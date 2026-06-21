/* ===========================================================
   ANIMA — Estado del Alma (onboarding · niveles · esencia)
   -----------------------------------------------------------
   Fuente única de verdad para el RITO DE ENTRADA y el HOME.
   Vive en localStorage (la "primera etapa de la vida de ANIMA")
   y, cuando hay nube, se sincroniza con Supabase de forma
   best-effort. El Alma decide qué comparte: aquí solo guardamos
   lo mínimo para que el viaje continúe entre sesiones.

   NO depende del studio.html ni rompe su sistema de XP propio:
   esta capa describe el CAMINO ceremonial y el menú progresivo.
   =========================================================== */
(function (global) {
  "use strict";

  var LS_KEY = "anima_state";
  var LS_ONBOARDING = "anima_onboarding_completed";

  /* Código Alpha de la Founding Era */
  var ALPHA_CODE = "ANIMA-2026";

  /* --- Afinidades: la naturaleza creadora de cada Alma --- */
  var AFINIDADES = [
    { key: "CREADOR",     glyph: "✶", name: "Creador",     desc: "Da forma a lo que no existe. Su fuerza es la expresión: arte, contenido, identidad y obra. Empieza con el impulso de crear." },
    { key: "CONSTRUCTOR", glyph: "▦", name: "Constructor", desc: "Convierte ideas en estructuras que perduran. Su fuerza es el método: sistemas, procesos y bases sólidas." },
    { key: "VISIONARIO",  glyph: "☽", name: "Visionario",  desc: "Ve el mapa antes que el camino. Su fuerza es la dirección: propósito, futuro y sentido de hacia dónde ir." },
    { key: "EXPLORADOR",  glyph: "➶", name: "Explorador",  desc: "Aprende moviéndose. Su fuerza es la curiosidad: probar, descubrir y conectar mundos distintos." },
    { key: "ESTRATEGA",   glyph: "♟", name: "Estratega",   desc: "Lee el tablero completo. Su fuerza es la decisión: prioridad, recursos y el siguiente movimiento correcto." }
  ];

  /* --- El Camino del Alma: 7 niveles ---
     'span'  = esencia para completar ESE nivel.
     'enter' = esencia acumulada necesaria para ENTRAR (calculada).
     Un Alma se sostiene en un nivel hasta SUPERAR (no igualar) su umbral:
     así CHISPA queda 100/100 "completada" y solo asciende con la
     siguiente acción — la lógica para subir a RAÍZ ya queda lista. */
  var LEVELS = [
    { key: "CHISPA", n: 1, glyph: "✨", name: "Chispa", color: "#f2c64e", span: 100,
      desc: "Acabas de nacer. Una chispa de conciencia dentro de ANIMA.",
      unlocks: ["Mi Alma", "Alma básica", "Primer logro"] },
    { key: "RAIZ",   n: 2, glyph: "🌱", name: "Raíz",   color: "#5f8a3a", span: 200,
      desc: "Echas raíces. Empiezas a conectar con otras Almas.",
      unlocks: ["Constelación", "Vínculos", "Contactos"] },
    { key: "PULSO",  n: 3, glyph: "💓", name: "Pulso",  color: "#8a6f3a", span: 300,
      desc: "Tu Alma late. Lo que creas empieza a moverse.",
      unlocks: ["Proyectos", "Tareas", "Estados"] },
    { key: "HUELLA", n: 4, glyph: "📜", name: "Huella", color: "#3a6f8a", span: 400,
      desc: "Dejas huella. Tu obra y tu memoria toman cuerpo.",
      unlocks: ["Biblioteca", "Archivos", "PDFs", "Imágenes", "Portafolio"] },
    { key: "TOTEM",  n: 5, glyph: "🔥", name: "Tótem",  color: "#5a4f8a", span: 500,
      desc: "Despierta LUMBRE. La IA acompaña tu camino.",
      unlocks: ["Lumbre", "IA asistente", "Lectura de archivos", "Organización de ideas"] },
    { key: "AURA",   n: 6, glyph: "🜂", name: "Aura",   color: "#7b3a8a", span: 600,
      desc: "Tu Alma irradia. El sistema empieza a trabajar por ti.",
      unlocks: ["Automatizaciones", "Recordatorios", "Flujos", "Integraciones"] },
    { key: "ANIMA",  n: 7, glyph: "∞", name: "ANIMA",  color: "#111111", span: 0,
      desc: "Alma despierta. El ecosistema completo es tuyo.",
      unlocks: ["Ecosistema completo", "Agentes", "Memoria", "Vista avanzada"] }
  ];
  // Umbral de entrada acumulado por nivel.
  (function () { var acc = 0; for (var i = 0; i < LEVELS.length; i++) { LEVELS[i].enter = acc; acc += LEVELS[i].span; } })();

  /* --- Menú progresivo de ANIMA (req. 8) --- */
  var MENU = [
    { glyph: "✨", t: "Mi Alma",    level: "CHISPA", view: "mialma" },
    { glyph: "🌱", t: "Constelación", level: "RAIZ",   view: "clientes" },
    { glyph: "💓", t: "Pulso",      level: "PULSO",  view: "proyectos" },
    { glyph: "📜", t: "Huella",     level: "HUELLA", view: "portafolio" },
    { glyph: "🔥", t: "Lumbre",     level: "TOTEM",  view: "lumbre" },
    { glyph: "🜂", t: "Aura",       level: "AURA",   view: "agenda" },
    { glyph: "∞",  t: "ANIMA",      level: "ANIMA",  view: "santuario" }
  ];

  function defaults() {
    return {
      name: "", email: "", affinity: "", code: "",
      esencia: 0, createdAt: null,
      steps: { despertar: false, nacer: false, primerDespertar: false, tutorial: false, logro: false },
      awarded: {},   // claves de acciones de Esencia que solo se otorgan una vez
      synced: false
    };
  }

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s && typeof s === "object") {
        var d = defaults();
        d.steps = Object.assign(d.steps, s.steps || {});
        d.awarded = Object.assign(d.awarded, s.awarded || {});
        return Object.assign(d, s, { steps: d.steps, awarded: d.awarded });
      }
    } catch (e) {}
    return defaults();
  }
  function save(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

  /* Nivel actual según esencia. Se sostiene en un nivel hasta SUPERAR su umbral. */
  function levelOf(esencia) {
    var idx = 0;
    for (var i = LEVELS.length - 1; i >= 0; i--) {
      if (esencia > LEVELS[i].enter) { idx = i; break; }
    }
    return idx;
  }

  function progress(esencia) {
    var idx = levelOf(esencia);
    var lv = LEVELS[idx];
    var next = LEVELS[idx + 1] || null;
    var into = esencia - lv.enter;
    var span = lv.span || 1;
    var pct = next ? Math.min(100, Math.round((into / span) * 100)) : 100;
    return { idx: idx, level: lv, next: next, into: into, span: span, pct: pct };
  }

  var API = {
    LS_KEY: LS_KEY,
    ALPHA_CODE: ALPHA_CODE,
    AFINIDADES: AFINIDADES,
    LEVELS: LEVELS,
    MENU: MENU,

    get: load,
    save: save,

    /* --- Onboarding --- */
    isCompleted: function () { return localStorage.getItem(LS_ONBOARDING) === "true"; },
    markCompleted: function () { localStorage.setItem(LS_ONBOARDING, "true"); },
    reset: function () { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_ONBOARDING); },

    /* --- Código Alpha --- */
    checkAlphaCode: function (code) {
      return String(code || "").trim().toUpperCase() === ALPHA_CODE;
    },

    /* --- Afinidad --- */
    affinity: function (key) {
      return AFINIDADES.filter(function (a) { return a.key === key; })[0] || null;
    },

    /* --- Esencia ---
       Suma local inmediata (la primera etapa de la vida del Alma vive en el
       dispositivo) y, si hay sesión en la nube, suma de forma atómica con el
       RPC add_essence y reconcilia con el valor servidor (fuente de verdad). */
    addEsencia: function (amount, reason) {
      var s = load();
      s.esencia = Math.max(0, (s.esencia || 0) + (amount || 0));
      save(s);
      try {
        var C = global.Cloud;
        if (C && C.enabled && amount) {
          C.session().then(function (sess) {
            if (!sess) return;
            C.addEssence(amount).then(function (serverEssence) {
              if (serverEssence != null) { var s2 = load(); s2.esencia = serverEssence; s2.synced = true; save(s2); }
            }).catch(function () {});
          }).catch(function () {});
        }
      } catch (e) {}
      return API.progress();
    },
    /* Otorga Esencia una sola vez por clave (perfil completo, primera chispa…). */
    addEsenciaOnce: function (key, amount, reason) {
      var s = load();
      if (s.awarded[key]) return API.progress();
      s.awarded[key] = true; save(s);
      return API.addEsencia(amount, reason);
    },
    setEsencia: function (value) {
      var s = load(); s.esencia = Math.max(0, value || 0); save(s); return API.progress();
    },
    wasAwarded: function (key) { return !!load().awarded[key]; },

    /* --- Niveles --- */
    levelOf: function (esencia) { return LEVELS[levelOf(esencia == null ? load().esencia : esencia)]; },
    progress: function (esencia) { return progress(esencia == null ? load().esencia : esencia); },
    levelByKey: function (key) { return LEVELS.filter(function (l) { return l.key === key; })[0] || LEVELS[0]; },

    /* ¿La sección del menú está desbloqueada al nivel actual? */
    isUnlocked: function (levelKey, esencia) {
      var cur = levelOf(esencia == null ? load().esencia : esencia);
      var target = -1;
      for (var i = 0; i < LEVELS.length; i++) { if (LEVELS[i].key === levelKey) { target = i; break; } }
      return target <= cur;
    },

    /* --- Crear Alma (guarda local + nube best-effort) --- */
    createAlma: function (data) {
      var s = load();
      s.name = data.name || s.name;
      s.email = data.email || s.email;
      s.affinity = data.affinity || s.affinity;
      s.code = data.code || s.code;
      if (!s.createdAt) s.createdAt = new Date().toISOString();
      s.steps.nacer = true;
      save(s);
      return s;
    },

    /* Puente local → nube: cuando hay sesión, sube la Esencia y la Afinidad
       acumuladas en el rito (sin tocar xp del studio). La Esencia servidor
       queda como el máximo entre local y nube; luego el servidor manda.
       Nunca bloquea: si falla o no hay nube, el Alma sigue en localStorage. */
    syncCloud: function (row) {
      var s = load();
      try {
        var C = global.Cloud;
        if (!C || !C.enabled) return Promise.resolve(false);
        var apply = function (r) {
          if (!r) return false;
          var patch = {};
          var merged = Math.max(r.essence || 0, s.esencia || 0);
          if (merged !== (r.essence || 0)) patch.essence = merged;
          if (s.affinity && !r.affinity) patch.affinity = s.affinity;
          // reconciliar local hacia el valor efectivo del servidor
          if (merged !== s.esencia) { s.esencia = merged; }
          s.synced = true; save(s);
          if (!Object.keys(patch).length) return true;
          return C.updateAlma(r.id, patch).then(function () { return true; }).catch(function () { return false; });
        };
        if (row) return Promise.resolve(apply(row));
        return C.session().then(function (sess) {
          if (!sess) return false;
          return C.myAlma().then(apply).catch(function () { return false; });
        }).catch(function () { return false; });
      } catch (e) { return Promise.resolve(false); }
    },

    /* Ruta de entrada según estado (req. 11) */
    entryHref: function () {
      return API.isCompleted() ? "home.html" : "umbral.html";
    }
  };

  global.AnimaState = API;
})(window);
