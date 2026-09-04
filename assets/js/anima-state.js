/* ===========================================================
   ANIMA — Estado del Alma (onboarding · esencia)
   -----------------------------------------------------------
   Fuente única de verdad para el RITO DE ENTRADA y el HOME.
   Vive en localStorage (la "primera etapa de la vida de ANIMA")
   y, cuando hay nube, se sincroniza con Supabase de forma
   best-effort. El Alma decide qué comparte: aquí solo guardamos
   lo mínimo para que el viaje continúe entre sesiones.

   La Esencia cuenta actividad, igual que en el Studio. El Camino
   del Alma (8 niveles) se retiró: nada aquí otorga permisos.
   =========================================================== */
(function (global) {
  "use strict";

  var LS_KEY = "anima_state";
  var LS_ONBOARDING = "anima_onboarding_completed";
  var LS_SEEN = "anima_last_seen";

  /* El código de invitación con el que se despierta un Alma. */
  var ALPHA_CODE = "ANIMA-2026";

  /* --- Afinidades: la naturaleza creadora de cada Alma --- */
  var AFINIDADES = [
    { key: "CREADOR",     glyph: "✶", name: "Creador",     desc: "Da forma a lo que no existe. Su fuerza es la expresión: arte, contenido, identidad y obra. Empieza con el impulso de crear." },
    { key: "CONSTRUCTOR", glyph: "▦", name: "Constructor", desc: "Convierte ideas en estructuras que perduran. Su fuerza es el método: sistemas, procesos y bases sólidas." },
    { key: "VISIONARIO",  glyph: "☽", name: "Visionario",  desc: "Ve el mapa antes que el camino. Su fuerza es la dirección: propósito, futuro y sentido de hacia dónde ir." },
    { key: "EXPLORADOR",  glyph: "➶", name: "Explorador",  desc: "Aprende moviéndose. Su fuerza es la curiosidad: probar, descubrir y conectar mundos distintos." },
    { key: "ESTRATEGA",   glyph: "♟", name: "Estratega",   desc: "Lee el tablero completo. Su fuerza es la decisión: prioridad, recursos y el siguiente movimiento correcto." }
  ];

  /* Aquí vivían los 8 niveles del Camino del Alma y el menú que se abría con
     ellos. Se retiraron con la capa de juego: la Esencia solo cuenta actividad
     y quien abre puertas es el plan contratado. */

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

  var API = {
    LS_KEY: LS_KEY,
    ALPHA_CODE: ALPHA_CODE,
    AFINIDADES: AFINIDADES,

    get: load,
    save: save,

    /* --- Onboarding --- */
    isCompleted: function () { return localStorage.getItem(LS_ONBOARDING) === "true"; },
    markCompleted: function () { localStorage.setItem(LS_ONBOARDING, "true"); },
    reset: function () { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_ONBOARDING); },

    /* --- Código de invitación --- */
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
      return s.esencia;
    },
    /* Otorga Esencia una sola vez por clave (perfil completo, primera chispa…). */
    addEsenciaOnce: function (key, amount, reason) {
      var s = load();
      if (s.awarded[key]) return s.esencia;
      s.awarded[key] = true; save(s);
      return API.addEsencia(amount, reason);
    },
    setEsencia: function (value) {
      var s = load(); s.esencia = Math.max(0, value || 0); save(s); return s.esencia;
    },
    wasAwarded: function (key) { return !!load().awarded[key]; },

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

    /* Ruta de entrada: el HOME es la morada principal para TODA Alma, en
       cualquier dispositivo. Quien no ha despertado verá el Resumen del Mundo;
       quien ya despertó verá su Alma. El rito (umbral) ya no se fuerza: se
       elige. Así ANIMA siempre inicia en el HOME PRINCIPAL. */
    entryHref: function () {
      return "home.html";
    },

    /* --- El sueño del Alma ---
       Cada vez que un Alma deja ANIMA, dejamos la hora de su última presencia.
       Al volver, sabemos cuánto durmió. Es por dispositivo (local) y honesto:
       describe el tiempo que esta morada estuvo en silencio. */
    lastSeen: function () {
      try { var v = parseInt(localStorage.getItem(LS_SEEN), 10); return isNaN(v) ? null : v; }
      catch (e) { return null; }
    },
    touch: function () {
      try { localStorage.setItem(LS_SEEN, String(Date.now())); } catch (e) {}
    },
    /* Texto poético del tiempo dormido desde 'fromMs' hasta ahora. */
    sleptText: function (fromMs) {
      if (!fromMs) return null;
      var ms = Date.now() - fromMs;
      if (ms < 60 * 1000) return "un instante";
      var mins = Math.floor(ms / 60000);
      if (mins < 60) return mins + (mins === 1 ? " minuto" : " minutos");
      var hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + (hrs === 1 ? " hora" : " horas");
      var days = Math.floor(hrs / 24);
      if (days < 30) return days + (days === 1 ? " día" : " días");
      var months = Math.floor(days / 30);
      return months + (months === 1 ? " mes" : " meses");
    }
  };

  /* Registrar la presencia al salir, sin forzar nada al entrar (así el HOME
     puede leer la última visita antes de actualizarla). */
  try {
    var _stamp = function () { API.touch(); };
    global.addEventListener("pagehide", _stamp);
    global.addEventListener("visibilitychange", function () {
      if (global.document && global.document.visibilityState === "hidden") _stamp();
    });
  } catch (e) {}

  global.AnimaState = API;
})(window);
