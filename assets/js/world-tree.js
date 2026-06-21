/* ===========================================================
   ANIMA — WorldTreeSystem · El Árbol Vivo del Mundo
   -----------------------------------------------------------
   El Árbol no es decoración ni una barra de progreso: es el
   corazón vivo de ANIMA. Reacciona a cada acción de las Almas.

   Principio:
     Toda acción deja una Huella.
     Toda Huella altera el Árbol.
     El Árbol cuenta la historia viva de ANIMA.

   Capas: SEMILLA · RAÍCES · TRONCO · RAMAS · HOJAS · FLORES · FRUTOS

   Funciona SIEMPRE: si hay nube (Supabase) el Árbol es global y
   en tiempo real; si no, vive en este dispositivo (localStorage).
   Fiel a la filosofía: ANIMA no depende obligatoriamente de internet.
   =========================================================== */
(function (global) {
  "use strict";

  var LS_KEY = "anima.worldtree.v1";

  /* Esencia que cada acción entrega al Árbol (no es XP frío). */
  var ENERGY = { alma: 10, huella: 7, chispa: 1, eco: 3, memoria: 5, constelacion: 15, nivel: 20, ritual: 12 };

  /* Caminos creativos = las Ramas del Árbol. */
  var BRANCHES = ["Muralismo", "Fotografía", "Ilustración", "Música", "Moda", "Escritura", "3D"];

  /* Lo que se registra en la historia viva del Mundo. */
  var TITLES = {
    alma:         "Una nueva Alma ha despertado",
    huella:       "Una nueva Huella fue dejada en el Mundo",
    chispa:       "El Árbol recibió una Chispa",
    eco:          "Un Eco resonó en el Mundo",
    memoria:      "Una Huella fue guardada en Memoria",
    constelacion: "Nació una Constelación",
    nivel:        "Un Alma alcanzó un nuevo nivel",
    ritual:       "El Ritual encendió el corazón del Árbol"
  };

  /* Colores del universo (Biblia · VIII). Cada hoja vibra distinto. */
  var LEAF_COLORS = ["#cbb26a", "#9a86c4", "#5f86b8", "#5f8a3a", "#c0703a", "#b56fae", "#7b6f57"];
  var FRUIT_COLOR = "#e7c873";   // Fruto de Memoria (dorado)
  var FLOWER_COLOR = "#f0d98a";  // Flor = nivel alcanzado

  /* Estados del Mundo (actividad reciente). */
  var WORLD_STATES = {
    LATENTE:     { label: "Latente",     sub: "El Mundo descansa.",                sky: ["#0d0f1a", "#161a2e"], glow: 0.16, drift: 0.20 },
    SERENO:      { label: "Sereno",      sub: "El Mundo respira con calma.",       sky: ["#101427", "#1d2340"], glow: 0.30, drift: 0.45 },
    RESONANDO:   { label: "Resonando",   sub: "Chispas y Ecos recorren el Árbol.", sky: ["#141733", "#2a2256"], glow: 0.52, drift: 0.85 },
    FLORECIENDO: { label: "Floreciendo", sub: "Nacen Almas y brotan Huellas.",     sky: ["#13231f", "#234a36"], glow: 0.60, drift: 0.75 },
    LUMINOSO:    { label: "Luminoso",    sub: "Colaboraciones y Memorias irradian.", sky: ["#241a33", "#4a2f63"], glow: 0.78, drift: 1.00 },
    DESPERTAR:   { label: "Despertar",   sub: "El Mundo entero resuena.",          sky: ["#2a1730", "#6b2f55"], glow: 1.00, drift: 1.45 }
  };

  /* Esencia del Árbol — magnitud acumulada, en tono ceremonial. */
  function essenceTier(e) {
    if (e >= 8000) return "Ancestral";
    if (e >= 3000) return "Luminosa";
    if (e >= 1200) return "Viva";
    if (e >= 400)  return "Resonante";
    if (e >= 100)  return "Serena";
    return "Latente";
  }

  /* Madurez del Árbol (0..7): cuántas Ramas y cuánta copa se dibujan. */
  function growthFromEnergy(e) {
    var t = [60, 200, 500, 1200, 3000, 8000];
    var g = 1;
    for (var i = 0; i < t.length; i++) if (e >= t[i]) g++;
    return Math.min(7, g);
  }

  function now() { return Date.now(); }
  function nowISO() { return new Date().toISOString(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* Ruido determinista por semilla → posiciones estables. */
  function rnd(seed) {
    var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function defaultState() {
    return {
      energy: 0, resonance: 0, growth_level: 1,
      world_state: "LATENTE", active_phenomenon: null, phenomenon_until: 0,
      total_almas: 0, total_huellas: 0, total_chispas: 0,
      total_ecos: 0, total_memorias: 0, total_constelaciones: 0,
      countries: [], events: [], last_updated: nowISO()
    };
  }

  /* Nodos vivos del Árbol (lo que se dibuja). No requiere la nube. */
  var nodes = [];        // { type, branch, color, born, seed, level }
  var connections = [];  // { a, b, born }  índices de hojas
  var particles = [];    // { x, y, vx, vy, life, max, color }  chispas en vuelo
  var pulses = [];       // { t, max }  pulsos de raíz (ecos)

  var CAPS = { leaf: 160, fruit: 60, flower: 80, root: 90 };

  var state = defaultState();
  var listeners = [];
  var cloud = false;

  /* ----------------------------------------------------------
     Persistencia local
     ---------------------------------------------------------- */
  function loadLocal() {
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        state = Object.assign(defaultState(), p.state || {});
        nodes = Array.isArray(p.nodes) ? p.nodes : [];
        connections = Array.isArray(p.connections) ? p.connections : [];
      }
    } catch (e) {}
  }
  function saveLocal() {
    try {
      global.localStorage.setItem(LS_KEY, JSON.stringify({
        state: state, nodes: nodes.slice(-360), connections: connections.slice(-120)
      }));
    } catch (e) {}
  }

  /* ----------------------------------------------------------
     Estado del Mundo + Fenómenos
     ---------------------------------------------------------- */
  function recentCounts(ms) {
    var since = now() - ms, c = {};
    for (var i = 0; i < state.events.length; i++) {
      var ev = state.events[i];
      var t = new Date(ev.created_at).getTime();
      if (t >= since) c[ev.type] = (c[ev.type] || 0) + 1;
    }
    c.__total = Object.keys(c).reduce(function (s, k) { return k === "__total" ? s : s + c[k]; }, 0);
    return c;
  }

  function recomputeWorldState() {
    var burst = recentCounts(5 * 60 * 1000);
    var win = recentCounts(20 * 60 * 1000);
    var resonance = (win.chispa || 0) + (win.eco || 0);
    var bloom = (win.alma || 0) * 2 + (win.huella || 0);
    var luminous = (win.constelacion || 0) * 2 + (win.memoria || 0);

    var s = "LATENTE";
    if (burst.__total >= 22)              s = "DESPERTAR";
    else if (luminous >= 6)               s = "LUMINOSO";
    else if (bloom >= 7)                  s = "FLORECIENDO";
    else if (resonance >= 8)              s = "RESONANDO";
    else if (win.__total > 0)             s = "SERENO";
    state.world_state = s;
    state.resonance = resonance;
  }

  /* Fenómenos del Mundo (nombres oficiales del universo). */
  function detectPhenomenon(type, opts) {
    var ph = null;
    var hour = recentCounts(60 * 60 * 1000);
    var day = recentCounts(24 * 60 * 60 * 1000);

    if (type === "nivel" && opts && opts.level === "ANIMA")        ph = "Aurora";                 // alguien alcanza el último nivel
    else if (state.growth_level >= 7)                              ph = "Origen Renacido";        // máxima evolución del Árbol
    else if (state.total_almas >= 1000)                            ph = "Latido Mayor";           // 1.000 Almas conectadas
    else if ((hour.chispa || 0) >= 100)                            ph = "Lluvia de Ecos";         // 100 Chispas en 1 hora
    else if ((day.memoria || 0) >= 50)                             ph = "Fruto del Árbol";        // 50 Memorias en el día
    else if ((day.constelacion || 0) >= 10)                        ph = "Nueva Rama";             // 10 colaboraciones en 24 h
    else if (type === "alma" && opts && opts.newCountry)           ph = "Nueva Estrella";         // primer Alma de un nuevo país

    if (ph) {
      state.active_phenomenon = ph;
      state.phenomenon_until = now() + 90 * 1000; // se enciende un rato, luego el Mundo se calma
    }
  }
  function expirePhenomenon() {
    if (state.active_phenomenon && now() > state.phenomenon_until) {
      state.active_phenomenon = null;
    }
  }

  /* ----------------------------------------------------------
     Nodos visuales por tipo de acción
     ---------------------------------------------------------- */
  function addLeaf(opts) {
    var seed = nodes.length + 1 + rnd(now());
    var color = (opts && opts.color) || LEAF_COLORS[Math.floor(rnd(seed) * LEAF_COLORS.length)];
    nodes.push({ type: "leaf", branch: opts && opts.branch || null, color: color, born: now(), seed: seed, level: (opts && opts.level) || "CHISPA" });
    capType("leaf");
  }
  function addFruit() { nodes.push({ type: "fruit", color: FRUIT_COLOR, born: now(), seed: nodes.length + rnd(now()) }); capType("fruit"); }
  function lightBranch(branch) {
    var seed = nodes.length + rnd(now());
    nodes.push({ type: "branchlight", branch: branch || BRANCHES[Math.floor(rnd(seed) * BRANCHES.length)], color: "#ffe9a8", born: now(), seed: seed });
    capType("branchlight", CAPS.leaf);
  }
  function bloomFlower() {
    // Convierte una hoja en flor, o crea una flor si no hay hojas.
    var leaves = [];
    for (var i = 0; i < nodes.length; i++) if (nodes[i].type === "leaf") leaves.push(i);
    if (leaves.length) {
      nodes[leaves[Math.floor(rnd(now()) * leaves.length)]].type = "flower";
      nodes[leaves[0]].born = now();
    } else {
      nodes.push({ type: "flower", color: FLOWER_COLOR, born: now(), seed: nodes.length + rnd(now()) });
    }
    capType("flower");
  }
  function addRoot() {
    nodes.push({ type: "root", color: "#6f5a33", born: now(), seed: nodes.length + rnd(now()) });
    capType("root");
    pulses.push({ t: 0, max: 1.1 });
  }
  function connectLeaves() {
    var leaves = [];
    for (var i = 0; i < nodes.length; i++) if (nodes[i].type === "leaf" || nodes[i].type === "flower") leaves.push(i);
    if (leaves.length >= 2) {
      var a = leaves[Math.floor(rnd(now()) * leaves.length)];
      var b = leaves[Math.floor(rnd(now() + 7) * leaves.length)];
      if (a !== b) connections.push({ a: a, b: b, born: now() });
      while (connections.length > 120) connections.shift();
    }
  }
  function emitParticles(n, color) {
    for (var i = 0; i < n; i++) {
      particles.push({
        x: 0.5 + (rnd(now() + i) - 0.5) * 0.5, y: 1.02,
        vx: (rnd(now() + i * 3) - 0.5) * 0.004,
        vy: -(0.010 + rnd(now() + i * 5) * 0.012),
        life: 0, max: 90 + Math.floor(rnd(now() + i) * 60),
        color: color || "#ffe9a8"
      });
    }
    if (particles.length > 220) particles.splice(0, particles.length - 220);
  }
  function capType(type, cap) {
    cap = cap || CAPS[type] || 160;
    var idx = [];
    for (var i = 0; i < nodes.length; i++) if (nodes[i].type === type) idx.push(i);
    while (idx.length > cap) { nodes.splice(idx.shift(), 1); for (var j = 0; j < idx.length; j++) idx[j]--; }
  }

  /* ----------------------------------------------------------
     Registrar una acción → repercusión en el Árbol
     ---------------------------------------------------------- */
  function applyVisual(type, opts) {
    opts = opts || {};
    switch (type) {
      case "alma":         addLeaf(opts); emitParticles(3, "#fff7df"); break;
      case "huella":       lightBranch(opts.branch); emitParticles(4, "#ffe9a8"); break;
      case "chispa":       emitParticles(6, "#ffd96b"); addRoot(); break;
      case "eco":          addRoot(); break;
      case "memoria":      addFruit(); emitParticles(4, FRUIT_COLOR); break;
      case "constelacion": connectLeaves(); addRoot(); emitParticles(5, "#bfa3e0"); break;
      case "nivel":        bloomFlower(); emitParticles(8, FLOWER_COLOR); break;
      case "ritual":       emitParticles(12, "#ffe9a8"); pulses.push({ t: 0, max: 1.4 }); break;
    }
  }

  function pushEvent(type, opts) {
    opts = opts || {};
    var nick = opts.almaName ? String(opts.almaName).split(" ")[0] : "Una Alma";
    var title = TITLES[type] || "El Árbol se movió";
    var desc = "";
    if (type === "alma")            desc = "✦ " + nick + (opts.country ? " despertó en " + opts.country : " despertó");
    else if (type === "huella")     desc = "✧ " + nick + " dejó una Huella" + (opts.branch ? " · " + opts.branch : "");
    else if (type === "chispa")     desc = "✦ " + nick + " entregó una Chispa";
    else if (type === "eco")        desc = "◎ " + nick + " dejó un Eco";
    else if (type === "memoria")    desc = "✧ " + nick + " atesoró una Huella en Memoria";
    else if (type === "constelacion") desc = "✺ Nació una Constelación";
    else if (type === "ritual")     desc = "🜂 " + nick + " completó un Ritual";
    else if (type === "nivel")      { title = "Un Alma alcanzó " + (opts.level || "un nuevo nivel"); desc = "🜂 " + nick + " alcanzó " + (opts.level || "un nuevo nivel"); }

    state.events.unshift({
      type: type, title: title, description: desc,
      energy_delta: ENERGY[type] || 0, alma_name: nick,
      created_at: nowISO()
    });
    if (state.events.length > 60) state.events.length = 60;
  }

  function record(type, opts) {
    opts = opts || {};
    if (!(type in ENERGY)) return state;

    // Contadores
    if (type === "alma")            state.total_almas++;
    else if (type === "huella")     state.total_huellas++;
    else if (type === "chispa")     state.total_chispas++;
    else if (type === "eco")        state.total_ecos++;
    else if (type === "memoria")    state.total_memorias++;
    else if (type === "constelacion") state.total_constelaciones++;

    // Nuevo país (para "Nueva Estrella")
    if (type === "alma" && opts.country) {
      if (state.countries.indexOf(opts.country) === -1) { state.countries.push(opts.country); opts.newCountry = true; }
    }

    // Energía (Esencia del Árbol)
    state.energy += ENERGY[type] || 0;
    state.growth_level = growthFromEnergy(state.energy);
    state.last_updated = nowISO();

    pushEvent(type, opts);
    applyVisual(type, opts);
    recomputeWorldState();
    detectPhenomenon(type, opts);

    saveLocal();
    emit();

    // Nube (best-effort, no bloquea). El servidor reconcilia los totales.
    if (cloud && global.Cloud && global.Cloud.worldTreeEvent) {
      try {
        global.Cloud.worldTreeEvent(type, {
          branch: opts.branch || null, target_id: opts.targetId || null,
          energy: ENERGY[type] || 0, title: TITLES[type] || null,
          description: state.events[0] ? state.events[0].description : null
        });
      } catch (e) {}
    }
    return state;
  }

  /* Poblar el Árbol con la realidad del Mundo (Almas que ya habitan ANIMA)
     sin emitir eventos: las hojas existentes aparecen ya brotadas. */
  function hydrate(opts) {
    opts = opts || {};
    var realAlmas = opts.almas || 0;
    var leaves = nodes.filter(function (n) { return n.type === "leaf" || n.type === "flower"; }).length;
    var faltan = Math.min(CAPS.leaf, realAlmas) - leaves;
    for (var i = 0; i < faltan; i++) {
      var seed = nodes.length + 1 + i * 1.7;
      nodes.push({ type: "leaf", branch: null, color: LEAF_COLORS[i % LEAF_COLORS.length], born: now() - 3000, seed: seed, level: "CHISPA" });
    }
    if (realAlmas > state.total_almas) {
      state.energy += (realAlmas - state.total_almas) * ENERGY.alma;
      state.total_almas = realAlmas;
    }
    state.growth_level = growthFromEnergy(state.energy);
    recomputeWorldState();
    saveLocal(); emit();
    return snapshot();
  }

  /* ----------------------------------------------------------
     Sincronización con la nube
     ---------------------------------------------------------- */
  function mergeServerState(srv) {
    if (!srv) return;
    // El servidor manda en los totales y la energía.
    ["energy", "resonance", "growth_level", "world_state", "active_phenomenon",
     "total_almas", "total_huellas", "total_chispas", "total_ecos",
     "total_memorias", "total_constelaciones", "last_updated"].forEach(function (k) {
      if (srv[k] != null) state[k] = srv[k];
    });
    state.growth_level = growthFromEnergy(state.energy);
    if (Array.isArray(srv.events) && srv.events.length) state.events = srv.events.slice(0, 60);
    saveLocal(); emit();
  }

  function syncCloud() {
    if (!(global.Cloud && global.Cloud.enabled && global.Cloud.worldTreeGet)) return;
    cloud = true;
    try {
      global.Cloud.worldTreeGet().then(function (srv) { mergeServerState(srv); }).catch(function () {});
      if (global.Cloud.subscribeWorldTree) {
        global.Cloud.subscribeWorldTree(function (payload) {
          if (payload && payload.event) {
            // Un Eco del Mundo entró: refleja la repercusión localmente.
            applyVisual(payload.event.type, payload.event);
            if (payload.event.description) {
              state.events.unshift({
                type: payload.event.type, title: payload.event.title || "",
                description: payload.event.description, energy_delta: payload.event.energy_delta || 0,
                created_at: payload.event.created_at || nowISO()
              });
              if (state.events.length > 60) state.events.length = 60;
            }
          }
          if (payload && payload.state) mergeServerState(payload.state);
          else { recomputeWorldState(); emit(); }
        });
      }
    } catch (e) {}
  }

  /* ----------------------------------------------------------
     Suscripción para la interfaz
     ---------------------------------------------------------- */
  function emit() {
    expirePhenomenon();
    for (var i = 0; i < listeners.length; i++) { try { listeners[i](snapshot()); } catch (e) {} }
  }
  function snapshot() {
    var ws = WORLD_STATES[state.world_state] || WORLD_STATES.LATENTE;
    return {
      energy: state.energy,
      essenceTier: essenceTier(state.energy),
      growth_level: state.growth_level,
      world_state: state.world_state,
      world_label: ws.label, world_sub: ws.sub,
      phenomenon: (function () { expirePhenomenon(); return state.active_phenomenon; })(),
      totals: {
        almas: state.total_almas, huellas: state.total_huellas, chispas: state.total_chispas,
        ecos: state.total_ecos, memorias: state.total_memorias, constelaciones: state.total_constelaciones
      },
      events: state.events.slice(0, 12),
      countries: state.countries.length
    };
  }

  /* ===========================================================
     RENDERER — Árbol vivo en pixel art (canvas)
     =========================================================== */
  var Renderer = (function () {
    var canvas, ctx, raf = null, t0 = now(), W = 0, H = 0, dpr = 1;

    function fit() {
      if (!canvas) return;
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(2, global.devicePixelRatio || 1);
      W = Math.max(240, r.width); H = Math.max(240, r.height);
      canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function px(x, y, s, color, alpha) {
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), s, s);
    }

    /* Geometría determinista del Árbol según madurez. */
    function branchAngle(i) { return -Math.PI / 2 + (i - (BRANCHES.length - 1) / 2) * 0.42; }

    function draw() {
      if (!ctx) return;
      var ws = WORLD_STATES[state.world_state] || WORLD_STATES.LATENTE;
      var time = (now() - t0) / 1000;
      var ground = H * 0.74, cx = W * 0.5;
      var pulse = 1 + Math.sin(time * 1.6) * 0.04 * ws.drift;
      var grow = state.growth_level / 7;

      // Cielo (cambia con el Estado del Mundo)
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, ws.sky[0]); g.addColorStop(1, ws.sky[1]);
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // Estrellas suaves de fondo
      for (var s = 0; s < 40; s++) {
        var sx = rnd(s + 1) * W, sy = rnd(s + 11) * ground * 0.9;
        var tw = 0.25 + Math.abs(Math.sin(time * 0.8 + s)) * 0.4 * ws.glow;
        px(sx, sy, 2, "#ffffff", tw * 0.5);
      }

      // Suelo
      ctx.globalAlpha = 1; ctx.fillStyle = "rgba(0,0,0,.22)";
      ctx.fillRect(0, ground, W, H - ground);

      // RAÍCES (ecos · chispas · constelaciones)
      var roots = nodes.filter(function (n) { return n.type === "root"; });
      for (var ri = 0; ri < roots.length; ri++) {
        var rseed = roots[ri].seed;
        var dir = rnd(rseed) > 0.5 ? 1 : -1;
        var len = (20 + rnd(rseed + 2) * 60) * (0.4 + grow);
        var steps = Math.floor(len / 5);
        var age = clamp((now() - roots[ri].born) / 1200, 0, 1);
        for (var k = 0; k < steps * age; k++) {
          var rx = cx + dir * (k * 4) + Math.sin(k * 0.6 + rseed) * 6;
          var ry = ground + k * 3 + Math.sin(k) * 2;
          if (ry < H) px(rx, ry, 2, "#5a4a2a", 0.5);
        }
      }
      // Pulsos de raíz (Ecos)
      for (var pi = pulses.length - 1; pi >= 0; pi--) {
        pulses[pi].t += 0.02;
        var pr = pulses[pi].t * 60;
        ctx.globalAlpha = clamp(pulses[pi].max - pulses[pi].t, 0, 0.6);
        ctx.strokeStyle = "#7a6336"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(cx, ground, pr, pr * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
        if (pulses[pi].t > pulses[pi].max) pulses.splice(pi, 1);
      }

      // TRONCO (la historia de ANIMA) — crece con la madurez
      var trunkH = (H * 0.30) * (0.5 + grow * 0.7) * pulse;
      var trunkTop = ground - trunkH, trunkW = 8 + grow * 8;
      ctx.globalAlpha = 1;
      for (var ty = 0; ty < trunkH; ty += 4) {
        var ww = trunkW * (1 - ty / trunkH * 0.45);
        var sway = Math.sin(time * 1.1 + ty * 0.03) * 2 * ws.drift;
        px(cx - ww / 2 + sway, ground - ty, Math.max(3, ww), "#6b4f2e", 1);
        px(cx - ww / 2 + sway, ground - ty, 3, "#84653e", 0.8);
      }

      // RAMAS (caminos creativos) — aparecen según madurez
      var nB = Math.min(BRANCHES.length, Math.max(2, state.growth_level));
      var branchTips = [];
      for (var bi = 0; bi < nB; bi++) {
        var ang = branchAngle(bi) + Math.sin(time * 0.9 + bi) * 0.05 * ws.drift;
        var bl = trunkH * (0.55 + rnd(bi + 3) * 0.35);
        var bx = cx, by = trunkTop + trunkH * 0.12;
        var ex = bx + Math.cos(ang) * bl, ey = by + Math.sin(ang) * bl;
        ctx.globalAlpha = 1; ctx.strokeStyle = "#6b4f2e"; ctx.lineWidth = Math.max(2, trunkW * 0.25);
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
        branchTips.push({ x: ex, y: ey, branch: BRANCHES[bi] });
      }

      // Luces de Rama (Huellas recién dejadas)
      var bl2 = nodes.filter(function (n) { return n.type === "branchlight"; });
      for (var li = 0; li < bl2.length; li++) {
        var tip = branchTips[Math.floor(rnd(bl2[li].seed) * branchTips.length)] || { x: cx, y: trunkTop };
        var fl = 0.5 + Math.abs(Math.sin(time * 3 + li)) * 0.5;
        px(tip.x + (rnd(bl2[li].seed + 1) - 0.5) * 16, tip.y + (rnd(bl2[li].seed + 2) - 0.5) * 16, 3, bl2[li].color, fl * ws.glow + 0.3);
      }

      // HOJAS (Almas) y FLORES (niveles) en la copa
      function canopyPos(seed) {
        var a = rnd(seed) * Math.PI * 2, rr = rnd(seed + 5);
        var radX = W * 0.30 * (0.4 + grow), radY = trunkH * 0.85 * (0.5 + grow * 0.5);
        return { x: cx + Math.cos(a) * radX * rr, y: trunkTop - 4 + Math.sin(a) * radY * rr };
      }
      var canopy = nodes.filter(function (n) { return n.type === "leaf" || n.type === "flower" || n.type === "fruit"; });
      // guarda posiciones para conexiones
      var posByIndex = {};
      for (var ci = 0; ci < nodes.length; ci++) {
        var nd = nodes[ci];
        if (nd.type !== "leaf" && nd.type !== "flower" && nd.type !== "fruit") continue;
        var p = canopyPos(nd.seed * 13.3);
        posByIndex[ci] = p;
        var appear = clamp((now() - nd.born) / 900, 0, 1);
        var fx = Math.sin(time * 1.4 + nd.seed) * 2 * ws.drift;
        var size = nd.type === "fruit" ? 4 : 3;
        var col = nd.type === "fruit" ? FRUIT_COLOR : (nd.type === "flower" ? FLOWER_COLOR : nd.color);
        var aa = (nd.type === "flower" ? 0.7 + 0.3 * Math.abs(Math.sin(time * 2 + nd.seed)) : 0.85) * appear;
        // halo para flores y frutos
        if (nd.type !== "leaf") px(p.x + fx - 1, p.y - 1, size + 2, col, 0.18 * appear);
        px(p.x + fx, p.y * (2 - appear) - p.y * (1 - appear), size, col, aa);
        px(p.x + fx, p.y + (1 - appear) * 24, size, col, aa);
      }

      // CONSTELACIONES (conexiones entre Almas)
      ctx.lineWidth = 1;
      for (var coi = 0; coi < connections.length; coi++) {
        var pa = posByIndex[connections[coi].a], pb = posByIndex[connections[coi].b];
        if (!pa || !pb) continue;
        var cage = clamp((now() - connections[coi].born) / 1400, 0, 1);
        ctx.globalAlpha = 0.22 * cage + 0.06;
        ctx.strokeStyle = "#cdb6ee";
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      }

      // PARTÍCULAS (Chispas en vuelo hacia la copa)
      for (var qi = particles.length - 1; qi >= 0; qi--) {
        var q = particles[qi];
        q.life++; q.x += q.vx; q.y += q.vy; q.vy *= 0.995;
        var qa = clamp(1 - q.life / q.max, 0, 1);
        px(cx + (q.x - 0.5) * W, ground - (1 - q.y) * (ground), 2, q.color, qa);
        if (q.life >= q.max || q.y < -0.05) particles.splice(qi, 1);
      }

      // Resplandor global según Estado del Mundo
      if (ws.glow > 0.4) {
        var rg = ctx.createRadialGradient(cx, trunkTop, 10, cx, trunkTop, W * 0.5);
        rg.addColorStop(0, "rgba(255,233,168," + (ws.glow * 0.10).toFixed(3) + ")");
        rg.addColorStop(1, "rgba(255,233,168,0)");
        ctx.globalAlpha = 1; ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      }

      // Fenómeno activo: lluvia de puntos suave
      if (state.active_phenomenon && now() < state.phenomenon_until) {
        for (var di = 0; di < 28; di++) {
          var dx = rnd(di + Math.floor(time * 2)) * W;
          var dy = ((time * 60 + di * 30) % H);
          px(dx, dy, 2, "#ffe9a8", 0.5);
        }
      }

      ctx.globalAlpha = 1;
    }

    function loop() { draw(); raf = global.requestAnimationFrame(loop); }

    return {
      mount: function (cv) {
        canvas = cv; ctx = canvas.getContext("2d");
        fit(); global.addEventListener("resize", fit);
        if (raf) global.cancelAnimationFrame(raf);
        t0 = now(); loop();
      },
      stop: function () { if (raf) global.cancelAnimationFrame(raf); raf = null; }
    };
  })();

  /* ===========================================================
     API pública
     =========================================================== */
  var WorldTree = {
    branches: BRANCHES,
    energyTable: ENERGY,

    init: function () { loadLocal(); recomputeWorldState(); syncCloud(); emit(); return this; },
    hydrate: hydrate,
    mount: function (canvas) { if (canvas) Renderer.mount(canvas); return this; },
    onChange: function (cb) { if (typeof cb === "function") { listeners.push(cb); cb(snapshot()); } return this; },
    snapshot: snapshot,

    /* Registrar acciones de las Almas */
    record: record,
    onAlmaBorn:     function (o) { return record("alma", o); },
    onHuella:       function (o) { return record("huella", o); },
    onChispa:       function (o) { return record("chispa", o); },
    onEco:          function (o) { return record("eco", o); },
    onMemoria:      function (o) { return record("memoria", o); },
    onConstelacion: function (o) { return record("constelacion", o); },
    onLevelUp:      function (o) { return record("nivel", o); },
    onRitual:       function (o) { return record("ritual", o); },

    /* Solo para demostración local del Núcleo (no toca la nube global salvo que haya sesión). */
    _demoSeed: function () {
      var paises = ["Chile", "Argentina", "México", "España", "Perú", "Colombia"];
      for (var i = 0; i < 14; i++) record("alma", { almaName: "Alma " + (i + 1), country: paises[i % paises.length] });
      for (var h = 0; h < 10; h++) record("huella", { almaName: "Alma " + h, branch: BRANCHES[h % BRANCHES.length] });
      for (var c = 0; c < 18; c++) record("chispa", { almaName: "Alma " + c });
      for (var e = 0; e < 8; e++) record("eco", { almaName: "Alma " + e });
      for (var m = 0; m < 4; m++) record("memoria", { almaName: "Alma " + m });
      record("constelacion", {}); record("nivel", { almaName: "Alma 1", level: "RAÍZ" });
      return snapshot();
    }
  };

  global.WorldTree = WorldTree;
})(window);
