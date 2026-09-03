/* ===========================================================
   ANIMA TSC — Seed / configuración base
   (Sin Almas demo: la comunidad son las Almas reales en la nube)
   =========================================================== */

/* --- Cuota de archivos por plan ---
   Antes la abría el Camino del Alma: el Alma desbloqueaba obras y megas al
   subir de nivel. Ahora la abre el plan contratado. La fuente de verdad es el
   plan en la base; esto es el espejo local para avisar antes de subir. */
const PLAN_STORAGE = {
  ALMA:      { images:10,  pdfs:2,  mb:100  },
  CLAN:      { images:30,  pdfs:6,  mb:300  },
  SANTUARIO: { images:100, pdfs:20, mb:1000 }
};
const normalizeStorageKey = k => PLAN_STORAGE[String(k||"").toUpperCase()] ? String(k).toUpperCase() : "ALMA";
const storageLimit = k => PLAN_STORAGE[normalizeStorageKey(k)];

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
  id:"guest", name:"Invitada", color:"#9a8c70", xp:0,
  role:"", city:"", country:"", bio:"Entra o crea tu Alma para empezar a construir tu mundo.",
  tags:[], clan:null, plan:"SANTUARIO", team_role:null,
  finance:{ income:[], expense:[] }, projects:[], portfolio:[], trajectory:[],
  memories:[], library:[], agenda:[], clients:[], tasks:[]
}];

/* --- Clanes --- */
const SEED_CLANS = [
  { id:"blackink", name:"BLACK INK STUDIO", emoji:"🖤", desc:"Estudio de tatuaje y muralismo.", members:[] },
  { id:"aetherlab", name:"AETHER LAB", emoji:"☽", desc:"Laboratorio de IA, sonido y dirección de arte.", members:[] },
  { id:"wildhouse", name:"WILD HOUSE", emoji:"🐾", desc:"Casa de streetwear y muralismo comunitario.", members:[] }
];

/* --- Santuario --- */
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
