/* ===========================================================
   ANIMA — Rite helpers (partículas + transiciones de escena)
   =========================================================== */
(function (global) {
  "use strict";

  /* Campo de partículas suaves que ascienden como brasas. */
  function particles(count) {
    var field = document.querySelector(".field");
    if (!field) {
      field = document.createElement("div");
      field.className = "field";
      field.innerHTML = '<div class="core"></div>';
      document.body.insertBefore(field, document.body.firstChild);
    }
    count = count || 26;
    for (var i = 0; i < count; i++) {
      var s = document.createElement("span");
      s.className = "spark";
      s.style.left = Math.random() * 100 + "%";
      s.style.top = (100 + Math.random() * 20) + "%";
      var dur = 9 + Math.random() * 12;
      s.style.animationDuration = dur + "s";
      s.style.animationDelay = (-Math.random() * dur) + "s";
      var sc = 0.5 + Math.random() * 1.6;
      s.style.transform = "scale(" + sc + ")";
      s.style.opacity = "0";
      field.appendChild(s);
    }
  }

  /* Transición lenta y ceremonial hacia otra escena/URL. */
  function go(href, delay) {
    var wrap = document.querySelector(".rite-wrap") || document.body;
    wrap.classList.add("fade-out");
    setTimeout(function () { global.location.href = href; }, delay || 620);
  }

  /* Tirar hacia abajo para refrescar (móvil). onRefresh por defecto recarga. */
  function pullToRefresh(onRefresh) {
    if (document.querySelector(".ptr")) return;
    var ind = document.createElement("div");
    ind.className = "ptr";
    ind.innerHTML = '<div style="display:grid;place-items:center"><span class="ring"></span><span class="lbl">Tira para actualizar</span></div>';
    document.body.appendChild(ind);
    var lbl = ind.querySelector(".lbl");
    var startY = 0, pulling = false, dist = 0, MAX = 90, TRIG = 70;
    var atTop = function () { return (window.scrollY || document.documentElement.scrollTop || 0) <= 0; };
    window.addEventListener("touchstart", function (e) {
      if (!atTop()) { pulling = false; return; }
      startY = e.touches[0].clientY; pulling = true; dist = 0;
    }, { passive: true });
    window.addEventListener("touchmove", function (e) {
      if (!pulling) return;
      dist = e.touches[0].clientY - startY;
      if (dist <= 0) { ind.style.height = "0px"; return; }
      var h = Math.min(MAX, dist * 0.5);
      ind.style.height = h + "px";
      if (lbl) lbl.textContent = h >= TRIG * 0.5 ? "Suelta para actualizar" : "Tira para actualizar";
    }, { passive: true });
    window.addEventListener("touchend", function () {
      if (!pulling) return;
      pulling = false;
      if (ind.offsetHeight >= TRIG * 0.5) {
        ind.classList.add("spin"); ind.style.height = "52px";
        if (lbl) lbl.textContent = "Actualizando…";
        setTimeout(function () { onRefresh ? onRefresh() : location.reload(); }, 450);
      } else { ind.style.height = "0px"; }
    });
  }

  global.Rite = { particles: particles, go: go, pullToRefresh: pullToRefresh };

  /* ---------- Instalar / Añadir al inicio (abre siempre en el Home) ----------
     La PWA tiene start_url=home.html, así que el icono instalado abre el Home.
     Capturamos el prompt nativo (Android/escritorio) y damos instrucciones
     claras en iOS, donde "Agregar a inicio" guarda la página actual. */
  var deferredInstall = null;
  function isStandalone(){ return (global.matchMedia && global.matchMedia("(display-mode: standalone)").matches) || global.navigator.standalone === true; }
  function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  function install(){
    if (deferredInstall){ deferredInstall.prompt(); deferredInstall.userChoice.then(function(){ deferredInstall = null; }); return; }
    if (isIOS()){
      alert("Añade ANIMA a tu inicio (iPhone/iPad · Safari):\n\n1) Toca el botón Compartir ⬆️ (el cuadro con la flecha).\n2) Elige \"Agregar a inicio\".\n\nEl icono abrirá ANIMA siempre desde tu Home.");
      return;
    }
    alert("Instala ANIMA como app:\n\n• Android (Chrome): menú ⋮ → \"Instalar app\" / \"Agregar a pantalla principal\".\n• Computador (Chrome/Edge): icono de instalar ⊕ en la barra de direcciones.\n\nSe abrirá siempre desde tu Home.");
  }
  function initInstall(){
    if (isStandalone()){ document.querySelectorAll("[data-install]").forEach(function(b){ b.style.display = "none"; }); return; }
    document.querySelectorAll("[data-install]").forEach(function(b){ if (b.dataset.iw) return; b.dataset.iw = "1"; b.addEventListener("click", function(e){ e.preventDefault(); install(); }); });
  }
  global.addEventListener("beforeinstallprompt", function(e){ e.preventDefault(); deferredInstall = e; });
  global.addEventListener("appinstalled", function(){ deferredInstall = null; document.querySelectorAll("[data-install]").forEach(function(b){ b.style.display = "none"; }); });
  Rite.install = install; Rite.initInstall = initInstall; Rite.isStandalone = isStandalone;

  document.addEventListener("DOMContentLoaded", function () { particles(); initInstall(); });
})(window);
