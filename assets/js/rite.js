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

  global.Rite = { particles: particles, go: go };
  document.addEventListener("DOMContentLoaded", function () { particles(); });
})(window);
