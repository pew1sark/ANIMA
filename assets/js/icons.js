/* ===========================================================
   ANIMA — Iconografía oficial (pixel art)
   -----------------------------------------------------------
   Un solo sistema de iconos, mismo grid 9×9, monocromo
   (currentColor) para que el menú y las acciones respiren la
   misma estética: minimalista, limpia, profesional, pixel art.

   Cada icono es una puerta, un símbolo, una energía.
   "Usar únicamente los iconos definidos en esta ficha."
   =========================================================== */
(function (g) {
  "use strict";

  // 9×9 · 'X' = pixel encendido · '.' = vacío.
  var P = {
    /* 04 · Iconografía principal (menú) */
    nucleo: ["....X....","...XXX...","..XXXXX..",".XXXXXXX.","XXXXXXXXX",".XXXXXXX.","...XXX...","....X....","..XXXXX.."],
    alma:   ["...XXX...","...XXX...","....X....","..XXXXX..",".XXXXXXX.","XXXXXXXXX","XXXXXXXXX",".XXXXXXX.",".XX...XX."],
    huellas:["....X....","...X.X...","..X...X..",".X..X..X.","X..XXX..X",".X..X..X.","..X...X..","...X.X...","....X...."],
    memoria:[".........",".XXX.XXX.","XXXXXXXXX","XX..X..XX","XX..X..XX","XX..X..XX","XX..X..XX","XXXXXXXXX",".XXX.XXX."],
    constelacion:[".XX......",".XX......","..X......","...XX....","....XX...",".....X...","......XX.","......XX.","........."],
    rituales:["....X....","....X....","...XXX...","...X.X...","...X.X...","...XXX...","..XXXXX..",".XXXXXXX.",".XXXXXXX."],
    raiz:   ["...X.X...","..XXXXX..",".XX.X.XX.","..XXXXX..","...XXX...","....X....","..X.X.X..","...XXX...","....X...."],
    lumbre: ["....X....","...XX....","...XXX...","..XXXXX..","..XXXXX..",".XXXXXXX.",".XXXXXXX.","..XXXXX..","...XXX..."],

    /* 05 · Interacciones del Alma */
    esencia:["....X....","....X....","...XXX...",".X.XXX.X.","XXXXXXXXX",".X.XXX.X.","...XXX...","....X....","....X...."],
    eco:    [".XXXXXXX.","XX.....XX","X.......X","X.X.X.X.X","X.......X","XX.....XX",".XXXXXXX.","..XX.....",".XX......"],
    enlace: [".........","..XXX....",".X...X...",".X..XXX..","..XXX..X.","...X...X.","....XXX..",".........","........."],
    obra:   ["XXXXXXXXX","X.......X","X..X....X","X.X.X...X","X......XX","X....XX.X","X..XX...X","X.X.....X","XXXXXXXXX"],
    proceso:["..XXXXX..",".X.....X.","X.......X","X.......X","X.......X","X.......X",".X.....X.","..XXXXX..","........."],
    documento:[".XXXXXX..",".XX...X..",".XX...XX.",".XXXXXXX.",".X.....X.",".X.XXX.X.",".X.....X.",".X.XXX.X.",".XXXXXXX."],

    /* 06/11 · símbolos de nivel se mantienen como caracteres oficiales */

    /* 07 · Tipos de Huella / contenido */
    archivo:["XXXXXXXXX","X.......X","XXXXXXXXX","X..XXX..X","X.......X","XXXXXXXXX","X..XXX..X","X.......X","XXXXXXXXX"],

    /* 08 · Sistema / navegación auxiliares y reinos */
    ruta:   [".........","......XX.","......XX.","...XX....","...XX....","XX.......","XX.......",".........","........."],
    tiempo: ["..XXXXX..",".X.....X.","X...X...X","X...X...X","X...XXX.X","X.......X","X.......X",".X.....X.","..XXXXX.."],
    insignia:[".X.....X.",".X.....X.","..XXXXX..",".XXXXXXX.",".XX.X.XX.",".XXXXXXX.","..XXXXX..",".........","........."],
    agenda: [".X.....X.","XXXXXXXXX","XXXXXXXXX","X.......X","X.XX.XX.X","X.......X","X.XX.XX.X","X.......X","XXXXXXXXX"],
    susurro:["....X....","...XXX...","..XXXXX..","..XXXXX..",".XXXXXXX.","XXXXXXXXX","XXXXXXXXX","....X....","...XXX..."],
    panel:  ["XXXX.XXXX","X..X.X..X","X..X.X..X","XXXX.XXXX",".........","XXXX.XXXX","X..X.X..X","X..X.X..X","XXXX.XXXX"],
    consejo:["....X....","..XXXXX..",".X..X..X.","X...X...X","XXX.X.XXX",".X..X..X.","....X....","..XXXXX..","........."],
    santuario:["....X....","...XXX...","..XXXXX..",".XXXXXXX.","XXXXXXXXX",".X.X.X.X.",".X.X.X.X.",".X.X.X.X.","XXXXXXXXX"],
    plan:   ["..XXXXX..",".X.....X.","XXXXXXXXX",".X.....X.",".XXXXXXX.","..X...X..","..XXXXX..",".........","........."],
    taller: ["....X....","...X.X...","...X.X...","..X...X..","..X...X..",".X.....X.",".X.....X.","X.......X","X.X...X.X"],
    config: [".........","X.XXXXXXX","X.XXXXXXX",".........","XXXXX.XXX","XXXXX.XXX",".........","XXX.XXXXX","XXX.XXXXX"],
    lock:   ["..XXXXX..",".X.....X.",".X.....X.","XXXXXXXXX","XXXXXXXXX","XXX.X.XXX","XXX.X.XXX","XXXXXXXXX","........."]
  };

  function svg(map) {
    var r = "";
    for (var y = 0; y < map.length; y++) {
      var row = map[y];
      for (var x = 0; x < row.length; x++) {
        if (row[x] === "X") r += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
      }
    }
    return '<svg class="ai" viewBox="0 0 9 9" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true" focusable="false">' + r + "</svg>";
  }

  /* Devuelve el SVG del icono pixel; si no existe, cae al glifo de respaldo. */
  g.ANIMA_ICON = function (name, fallbackGlyph) {
    var m = P[name];
    if (!m) return fallbackGlyph != null ? fallbackGlyph : "";
    return svg(m);
  };
  g.ANIMA_ICONS = P;
})(window);
