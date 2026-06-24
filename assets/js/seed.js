/* ===========================================================
   ANIMA TSC — Seed / configuración base
   (Sin Almas demo: la comunidad son las Almas reales en la nube)
   =========================================================== */

/* --- Camino del creador: niveles --- */
const LEVELS = [
  { key:"FOUNDING", label:"ORIGEN", name:"Fundador",      emoji:"○", color:"#d0aa63", xp:0,     desc:"Los primeros. Guardianes de la cultura ANIMA." },
  { key:"EMBER",    label:"CHISPA", name:"Brasa",         emoji:"✦", color:"#c0703a", xp:400,   desc:"La chispa. Aquí comienza el fuego de una Alma." },
  { key:"ROOT",     label:"RAÍZ",   name:"Raíz",          emoji:"🌱", color:"#5f8a3a", xp:1200,  desc:"Las raíces. La trayectoria empieza a sostenerse." },
  { key:"WILD",     label:"PULSO",  name:"Instinto",      emoji:"〰", color:"#8a6f3a", xp:2600,  desc:"El instinto. Crear sin miedo, con identidad propia." },
  { key:"TOTEM",    label:"HUELLA", name:"Identidad",     emoji:"✧", color:"#3a6f8a", xp:4800,  desc:"La identidad. El Alma se vuelve reconocible." },
  { key:"AETHER",   label:"TÓTEM",  name:"Visión",        emoji:"🜂", color:"#5a4f8a", xp:8000,  desc:"La visión. Más allá del oficio: dirección y propósito." },
  { key:"SPIRIT",   label:"AURA",   name:"Espíritu",      emoji:"◎", color:"#7b3a8a", xp:13000, desc:"El espíritu. Una Alma que guía y deja legado." },
  { key:"ANIMA",    label:"ANIMA",  name:"Alma Despierta",emoji:"∞", color:"#111111", xp:21000, desc:"Alma despierta. El círculo se completa." }
];
const levelByKey = k => LEVELS.find(l => l.key === k) || LEVELS[0];
const levelRank = k => { const i = LEVELS.findIndex(l => l.key === k); return i < 0 ? 0 : i; };

/* --- Almacenamiento por nivel (Alpha 2026) --- */
/* Espeja public.storage_quota() del backend (migración 0013). */
const LEVEL_STORAGE = {
  FOUNDING:{ images:3,  pdfs:1, mb:30  },   // ORIGEN
  EMBER:   { images:5,  pdfs:1, mb:50  },   // CHISPA
  ROOT:    { images:7,  pdfs:2, mb:80  },   // RAÍZ
  WILD:    { images:7,  pdfs:2, mb:80  },   // PULSO
  TOTEM:   { images:8,  pdfs:2, mb:90  },   // HUELLA
  AETHER:  { images:9,  pdfs:2, mb:95  },   // TÓTEM
  SPIRIT:  { images:10, pdfs:2, mb:100 },   // AURA
  ANIMA:   { images:10, pdfs:2, mb:100 }    // ANIMA
};
const storageLimit = k => LEVEL_STORAGE[k] || LEVEL_STORAGE.FOUNDING;
function levelProgress(xp){
  let cur = LEVELS[0];
  for(const l of LEVELS){ if(xp >= l.xp) cur = l; }
  const idx = LEVELS.indexOf(cur);
  const next = LEVELS[idx+1] || null;
  const pct = next ? Math.round(((xp - cur.xp) / (next.xp - cur.xp)) * 100) : 100;
  return { cur, next, pct, idx };
}

/* --- LUMBRE: modos del motor agente --- */
const LUMBRE_MODES = [
  { key:"OFF",    name:"OFF",          desc:"Solo organización manual." },
  { key:"BASIC",  name:"Básico",       desc:"Sin IA. Ordena docs, proyectos y Raíz." },
  { key:"LOCAL",  name:"IA Local",     desc:"Procesa PDF, CV e imágenes sin salir del dispositivo." },
  { key:"CLOUD",  name:"IA Conectada", desc:"Conecta Claude, OpenAI, Gemini u Ollama (opcional)." }
];

/* Modo discreto: oculta ingresos, ganancias y montos con •••••• (privacidad). */
let ANIMA_DISCREET = (()=>{ try{ return localStorage.getItem("anima_discreet")==="1"; }catch(e){ return false; } })();

/* --- Monedas del Flujo de valores (Raíz) ---
   El Alma elige la moneda con la que vive sus finanzas. money() formatea según
   esa elección. La lista crece con más países; añadir una es una línea. */
const CURRENCY_CATALOG = {
  CLP:{sym:"$",   loc:"es-CL", dec:0, name:"Peso chileno"},
  USD:{sym:"US$", loc:"en-US", dec:2, name:"Dólar (USD)"},
  EUR:{sym:"€",   loc:"es-ES", dec:2, name:"Euro"},
  MXN:{sym:"MX$", loc:"es-MX", dec:2, name:"Peso mexicano"},
  ARS:{sym:"AR$", loc:"es-AR", dec:2, name:"Peso argentino"},
  COP:{sym:"CO$", loc:"es-CO", dec:0, name:"Peso colombiano"},
  PEN:{sym:"S/",  loc:"es-PE", dec:2, name:"Sol peruano"},
  BRL:{sym:"R$",  loc:"pt-BR", dec:2, name:"Real brasileño"},
  UYU:{sym:"$U",  loc:"es-UY", dec:2, name:"Peso uruguayo"},
  BOB:{sym:"Bs",  loc:"es-BO", dec:2, name:"Boliviano"},
  PYG:{sym:"₲",   loc:"es-PY", dec:0, name:"Guaraní"},
  GTQ:{sym:"Q",   loc:"es-GT", dec:2, name:"Quetzal"},
  CRC:{sym:"₡",   loc:"es-CR", dec:0, name:"Colón costarricense"},
  DOP:{sym:"RD$", loc:"es-DO", dec:2, name:"Peso dominicano"},
  GBP:{sym:"£",   loc:"en-GB", dec:2, name:"Libra esterlina"},
  CAD:{sym:"C$",  loc:"en-CA", dec:2, name:"Dólar canadiense"},
  AUD:{sym:"A$",  loc:"en-AU", dec:2, name:"Dólar australiano"},
  JPY:{sym:"¥",   loc:"ja-JP", dec:0, name:"Yen"},
  CNY:{sym:"CN¥", loc:"zh-CN", dec:2, name:"Yuan"},
  CHF:{sym:"CHF", loc:"de-CH", dec:2, name:"Franco suizo"}
};
let ANIMA_CUR = (()=>{ try{ return localStorage.getItem("anima_currency")||"CLP"; }catch(e){ return "CLP"; } })();
function animaCur(){ return CURRENCY_CATALOG[ANIMA_CUR] || CURRENCY_CATALOG.CLP; }
function setAnimaCurrency(code){ if(CURRENCY_CATALOG[code]){ ANIMA_CUR=code; try{ localStorage.setItem("anima_currency",code); }catch(e){} } }
const money = n => {
  if(ANIMA_DISCREET) return "••••••";
  const c=animaCur();
  return c.sym + Number(n||0).toLocaleString(c.loc, {minimumFractionDigits:c.dec, maximumFractionDigits:c.dec});
};

/* --- Alma invitada (solo cuando no hay sesión) --- */
const SEED_ALMAS = [{
  id:"guest", name:"Invitada", color:"#9a8c70", level:"EMBER", xp:0,
  role:"", city:"", country:"", bio:"Entra o crea tu Alma para empezar a construir tu mundo.",
  tags:[], clan:null, plan:"SANTUARIO", team_role:null,
  finance:{ income:[], expense:[] }, projects:[], portfolio:[], trajectory:[],
  memories:[], library:[], agenda:[], clients:[], tasks:[]
}];

/* --- Clanes (Nivel 2) --- */
const SEED_CLANS = [
  { id:"blackink", name:"BLACK INK STUDIO", emoji:"🖤", desc:"Estudio de tatuaje y muralismo.", members:[] },
  { id:"aetherlab", name:"AETHER LAB", emoji:"☽", desc:"Laboratorio de IA, sonido y dirección de arte.", members:[] },
  { id:"wildhouse", name:"WILD HOUSE", emoji:"🐾", desc:"Casa de streetwear y muralismo comunitario.", members:[] }
];

/* --- Santuario (Nivel 3) --- */
const SEED_SANCTUARY = {
  name:"ANIMA — Founding Sanctuary",
  emoji:"🜁",
  desc:"El Santuario de ANIMA: todas las Almas reunidas en The Founding Era.",
  clans:["blackink","aetherlab","wildhouse"],
  departments:[
    { t:"Arte & Muralismo", lead:"" },
    { t:"Digital & IA",      lead:"" },
    { t:"Marca & Producto",  lead:"" }
  ]
};
