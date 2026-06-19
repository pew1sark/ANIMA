/* ===========================================================
   ANIMA TSC — Seed data (Alpha · Founding Era)
   10 Almas Fundadoras · sistema de niveles · LUMBRE
   =========================================================== */

/* --- Camino del creador: niveles --- */
const LEVELS = [
  { key:"FOUNDING", label:"ORIGEN", name:"Fundador",      emoji:"👑", color:"#d0aa63", xp:0,     desc:"Los primeros 100. Guardianes de la cultura ANIMA." },
  { key:"EMBER",    label:"CHISPA", name:"Brasa",         emoji:"🌱", color:"#c0703a", xp:400,   desc:"La chispa. Aquí comienza el fuego de una Alma." },
  { key:"ROOT",     label:"RAÍZ",   name:"Raíz",          emoji:"🌿", color:"#5f8a3a", xp:1200,  desc:"Las raíces. La trayectoria empieza a sostenerse." },
  { key:"WILD",     label:"PULSO",  name:"Instinto",      emoji:"🐾", color:"#8a6f3a", xp:2600,  desc:"El instinto. Crear sin miedo, con identidad propia." },
  { key:"TOTEM",    label:"HUELLA", name:"Identidad",     emoji:"🦅", color:"#3a6f8a", xp:4800,  desc:"La identidad. El Alma se vuelve reconocible." },
  { key:"AETHER",   label:"TÓTEM",  name:"Visión",        emoji:"☽",  color:"#5a4f8a", xp:8000,  desc:"La visión. Más allá del oficio: dirección y propósito." },
  { key:"SPIRIT",   label:"AURA",   name:"Espíritu",      emoji:"🜁", color:"#7b3a8a", xp:13000, desc:"El espíritu. Una Alma que guía y deja legado." },
  { key:"ANIMA",    label:"ANIMA",  name:"Alma Despierta",emoji:"∞",  color:"#111111", xp:21000, desc:"Alma despierta. El círculo se completa." }
];
const levelByKey = k => LEVELS.find(l => l.key === k) || LEVELS[0];
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
  { key:"BASIC",  name:"Básico",       desc:"Sin IA. Ordena docs, proyectos y finanzas." },
  { key:"LOCAL",  name:"IA Local",     desc:"Procesa PDF, CV e imágenes sin salir del dispositivo." },
  { key:"CLOUD",  name:"IA Conectada", desc:"Conecta Claude, OpenAI, Gemini u Ollama (opcional)." }
];

/* --- Helpers de siembra --- */
const money = n => "$" + n.toLocaleString("es-CL");

/* === 10 ALMAS FUNDADORAS === */
const SEED_ALMAS = [
  {
    id:"sark", name:"SARK", color:"#111111", level:"FOUNDING", xp:21400,
    role:"Muralista · Director", city:"Santiago", country:"🇨🇱 Chile",
    bio:"Creador de ANIMA. Primera Alma. Muralismo a gran escala, dirección creativa y construcción de un mundo vivo para creadores.",
    tags:["Muralismo","Dirección","Streetwear","IA"],
    clan:"BLACK INK STUDIO",
    finance:{ income:[
        {t:"Mural Corporativo — Banco Andes", a:4200000, d:"2026-05"},
        {t:"Dirección creativa — Marca deportiva", a:1800000, d:"2026-04"},
        {t:"Drop streetwear (cápsula)", a:920000, d:"2026-03"}
      ], expense:[
        {t:"Materiales y pintura", a:540000, d:"2026-05"},
        {t:"Arriendo taller", a:380000, d:"2026-05"},
        {t:"Equipo y asistentes", a:650000, d:"2026-04"}
      ]},
    projects:[
      {t:"Mural Metro Línea 7", st:"En curso", pct:65, client:"Metro de Santiago"},
      {t:"Identidad ANIMA World", st:"En curso", pct:80, client:"ANIMA TSC"},
      {t:"Cápsula Otoño 2026", st:"Planificado", pct:15, client:"Tienda propia"}
    ],
    portfolio:[
      {t:"Despertar", k:"Mural · 12m", c:"#b8a892"},
      {t:"Raíz Urbana", k:"Mural · 8m", c:"#5f8a3a"},
      {t:"Totem", k:"Lienzo", c:"#3a6f8a"}
    ],
    trajectory:[
      {y:"2019", t:"Primer mural a gran escala", d:"Fachada de 200m² en barrio Yungay."},
      {y:"2022", t:"Estudio propio", d:"Funda BLACK INK STUDIO con su clan."},
      {y:"2026", t:"Nace ANIMA TSC", d:"The Founding Era: un sistema vivo para creadores."}
    ],
    memories:[
      {t:"La idea del Alma", d:"No usuarios: Almas. Todo gira en torno a recordar, crecer y crear."},
      {t:"Paleta fundacional", d:"Cálido, dorado, vivo. Nada genérico."}
    ],
    library:[
      {t:"Manifiesto ANIMA.pdf", k:"Documento"},
      {t:"Contrato Metro L7.pdf", k:"Contrato"},
      {t:"Brief marca deportiva.pdf", k:"Brief"}
    ],
    agenda:[
      {h:"11:00", t:"Revisión mural Metro L7"},
      {h:"15:00", t:"Sesión dirección ANIMA World"},
      {h:"18:30", t:"Reunión clan — BLACK INK"}
    ]
  },
  {
    id:"valentina", name:"Valentina Cruz", color:"#b23b6f", level:"TOTEM", xp:5200,
    role:"Tatuadora · Fine line", city:"Buenos Aires", country:"🇦🇷 Argentina",
    bio:"Tatuaje fine line y blackwork. Convierte historias personales en piezas que duran toda la vida.",
    tags:["Tattoo","Fine line","Blackwork","Ilustración"],
    clan:"BLACK INK STUDIO",
    finance:{ income:[
        {t:"Sesiones de tatuaje (mayo)", a:1450000, d:"2026-05"},
        {t:"Diseños personalizados", a:380000, d:"2026-04"}
      ], expense:[
        {t:"Insumos y agujas", a:210000, d:"2026-05"},
        {t:"Comisión estudio", a:290000, d:"2026-05"}
      ]},
    projects:[
      {t:"Serie 'Raíces'", st:"En curso", pct:45, client:"Clientes recurrentes"},
      {t:"Flash day colectivo", st:"Planificado", pct:20, client:"Black Ink"}
    ],
    portfolio:[
      {t:"Serpiente", k:"Blackwork", c:"#b23b6f"},
      {t:"Flora", k:"Fine line", c:"#5f8a3a"},
      {t:"Luna", k:"Micro", c:"#5a4f8a"}
    ],
    trajectory:[
      {y:"2020", t:"Primeros tatuajes", d:"Aprendiz en estudio de Palermo."},
      {y:"2024", t:"Estilo propio", d:"Consolida su fine line reconocible."}
    ],
    memories:[ {t:"Cliente especial", d:"Tatuaje en memoria de su abuela — el más emotivo."} ],
    library:[ {t:"Consentimientos.pdf", k:"Documento"}, {t:"Catálogo flash.pdf", k:"Portafolio"} ],
    agenda:[ {h:"13:00", t:"Sesión — cliente serie Raíces"}, {h:"17:00", t:"Diseño nuevo flash"} ]
  },
  {
    id:"nicolas", name:"Nicolás Herrera", color:"#3a6f8a", level:"AETHER", xp:8600,
    role:"Artista Digital · IA", city:"Medellín", country:"🇨🇴 Colombia",
    bio:"Dirige proyectos audiovisuales con IA generativa. Diseña workflows y agentes para estudios creativos.",
    tags:["Digital","IA","Motion","Workflows"],
    clan:"AETHER LAB",
    finance:{ income:[
        {t:"Campaña audiovisual IA", a:3100000, d:"2026-05"},
        {t:"Consultoría workflows", a:1200000, d:"2026-04"}
      ], expense:[
        {t:"Créditos de cómputo / IA", a:480000, d:"2026-05"},
        {t:"Software y licencias", a:160000, d:"2026-05"}
      ]},
    projects:[
      {t:"Spot 30s — marca de moda", st:"En curso", pct:70, client:"Atelier Norte"},
      {t:"Agente productor para estudio", st:"En curso", pct:55, client:"AETHER LAB"}
    ],
    portfolio:[
      {t:"Eter", k:"Motion", c:"#3a6f8a"},
      {t:"Síntesis", k:"AI Art", c:"#5a4f8a"},
      {t:"Flujo", k:"Workflow", c:"#111"}
    ],
    trajectory:[
      {y:"2021", t:"Del diseño a la IA", d:"Migra a herramientas generativas."},
      {y:"2025", t:"AETHER LAB", d:"Funda su laboratorio de IA creativa."}
    ],
    memories:[ {t:"Primer agente", d:"El día que un workflow hizo el trabajo de una semana en una tarde."} ],
    library:[ {t:"Pipeline IA.pdf", k:"Documento"}, {t:"Brief Atelier Norte.pdf", k:"Brief"} ],
    agenda:[ {h:"10:00", t:"Render final spot"}, {h:"16:00", t:"Demo agente productor"} ]
  },
  {
    id:"diego", name:"Diego Ramírez", color:"#c0703a", level:"WILD", xp:3100,
    role:"Streetwear · Diseñador", city:"Ciudad de México", country:"🇲🇽 México",
    bio:"Funda drops de streetwear con identidad barrial. Del boceto a la prenda y al Shopify.",
    tags:["Streetwear","Branding","Drops","Shopify"],
    clan:"WILD HOUSE",
    finance:{ income:[
        {t:"Drop 'Barrio' (50 piezas)", a:1900000, d:"2026-05"},
        {t:"Colaboración cápsula", a:620000, d:"2026-03"}
      ], expense:[
        {t:"Producción textil", a:740000, d:"2026-05"},
        {t:"Fotografía y lookbook", a:180000, d:"2026-04"}
      ]},
    projects:[
      {t:"Drop invierno", st:"En curso", pct:40, client:"Marca propia"},
      {t:"Tienda Shopify v2", st:"Planificado", pct:10, client:"WILD HOUSE"}
    ],
    portfolio:[
      {t:"Barrio Tee", k:"Prenda", c:"#c0703a"},
      {t:"Hoodie 01", k:"Prenda", c:"#111"},
      {t:"Lookbook", k:"Editorial", c:"#8a6f3a"}
    ],
    trajectory:[ {y:"2023", t:"Primer drop", d:"Agota 30 piezas en un fin de semana."} ],
    memories:[ {t:"El primer sold out", d:"Entendió que el barrio era la marca."} ],
    library:[ {t:"Ficha técnica textil.pdf", k:"Documento"} ],
    agenda:[ {h:"12:00", t:"Muestra de tela"}, {h:"19:00", t:"Sesión lookbook"} ]
  },
  {
    id:"camila", name:"Camila Soto", color:"#5f8a3a", level:"ROOT", xp:1500,
    role:"Ilustradora", city:"Lima", country:"🇵🇪 Perú",
    bio:"Ilustración editorial y botánica. Tinta, acuarela y narrativa visual.",
    tags:["Ilustración","Editorial","Acuarela"],
    clan:null,
    finance:{ income:[
        {t:"Portada de libro", a:680000, d:"2026-05"},
        {t:"Set de stickers", a:140000, d:"2026-04"}
      ], expense:[
        {t:"Materiales", a:90000, d:"2026-05"}
      ]},
    projects:[
      {t:"Serie botánica", st:"En curso", pct:50, client:"Editorial Sur"}
    ],
    portfolio:[
      {t:"Helecho", k:"Acuarela", c:"#5f8a3a"},
      {t:"Colibrí", k:"Tinta", c:"#3a6f8a"},
      {t:"Selva", k:"Editorial", c:"#8a6f3a"}
    ],
    trajectory:[ {y:"2024", t:"Primera portada", d:"Ilustra para Editorial Sur."} ],
    memories:[ {t:"Cuaderno de campo", d:"Dibuja plantas reales antes de cada serie."} ],
    library:[ {t:"Brief portada.pdf", k:"Brief"} ],
    agenda:[ {h:"09:30", t:"Bocetos botánica"}, {h:"14:00", t:"Entrega editorial"} ]
  },
  {
    id:"lucia", name:"Lucía Fernández", color:"#7b3a8a", level:"SPIRIT", xp:14200,
    role:"Fine Art · Pintora", city:"Madrid", country:"🇪🇸 España",
    bio:"Obra de gran formato y exposiciones. Mentora de jóvenes Almas en Creator Academy.",
    tags:["Fine Art","Óleo","Exposición","Mentoría"],
    clan:"AETHER LAB",
    finance:{ income:[
        {t:"Venta de obra — galería", a:5800000, d:"2026-05"},
        {t:"Comisión retrato", a:1300000, d:"2026-04"},
        {t:"Mentorías Academy", a:540000, d:"2026-05"}
      ], expense:[
        {t:"Materiales óleo/lienzo", a:620000, d:"2026-05"},
        {t:"Transporte de obra", a:230000, d:"2026-05"}
      ]},
    projects:[
      {t:"Exposición 'Espíritu'", st:"En curso", pct:75, client:"Galería Centro"},
      {t:"Mentoría — 5 Almas", st:"En curso", pct:60, client:"ANIMA Academy"}
    ],
    portfolio:[
      {t:"Espíritu I", k:"Óleo", c:"#7b3a8a"},
      {t:"Silencio", k:"Óleo", c:"#5a4f8a"},
      {t:"Retrato", k:"Comisión", c:"#b8a892"}
    ],
    trajectory:[
      {y:"2015", t:"Primera exposición", d:"Colectiva en Madrid."},
      {y:"2023", t:"Reconocimiento", d:"Obra adquirida por colección privada."}
    ],
    memories:[ {t:"Enseñar", d:"Descubre que guiar a otras Almas también es crear."} ],
    library:[ {t:"Dossier expo Espíritu.pdf", k:"Dossier"}, {t:"Certificados de obra.pdf", k:"Documento"} ],
    agenda:[ {h:"11:00", t:"Montaje galería"}, {h:"17:00", t:"Mentoría grupal"} ]
  },
  {
    id:"mateo", name:"Mateo Vargas", color:"#3a8a7a", level:"EMBER", xp:620,
    role:"Fotógrafo", city:"Valparaíso", country:"🇨🇱 Chile",
    bio:"Fotografía documental y de retrato. Recién empieza a ordenar su trayectoria en ANIMA.",
    tags:["Fotografía","Documental","Retrato"],
    clan:null,
    finance:{ income:[
        {t:"Sesión de retrato", a:220000, d:"2026-05"},
        {t:"Cobertura de evento", a:350000, d:"2026-04"}
      ], expense:[
        {t:"Equipo (lente usado)", a:280000, d:"2026-04"}
      ]},
    projects:[ {t:"Ensayo 'Puerto'", st:"En curso", pct:30, client:"Proyecto personal"} ],
    portfolio:[
      {t:"Puerto", k:"Documental", c:"#3a8a7a"},
      {t:"Retrato 01", k:"Retrato", c:"#111"},
      {t:"Niebla", k:"Paisaje", c:"#b8a892"}
    ],
    trajectory:[ {y:"2026", t:"Entra a ANIMA", d:"Primera Alma fundadora de Valparaíso."} ],
    memories:[ {t:"Primera cámara", d:"Heredada de su padre."} ],
    library:[ {t:"Portafolio inicial.pdf", k:"Portafolio"} ],
    agenda:[ {h:"08:00", t:"Salida fotográfica puerto"}, {h:"16:00", t:"Edición"} ]
  },
  {
    id:"sofia", name:"Sofía Morales", color:"#8a6f3a", level:"WILD", xp:2900,
    role:"Muralista", city:"Guadalajara", country:"🇲🇽 México",
    bio:"Muralismo comunitario con color y símbolos del folclor mexicano.",
    tags:["Muralismo","Comunitario","Color"],
    clan:"WILD HOUSE",
    finance:{ income:[
        {t:"Mural comunitario (municipio)", a:2400000, d:"2026-05"},
        {t:"Taller con jóvenes", a:300000, d:"2026-04"}
      ], expense:[
        {t:"Pintura y andamios", a:560000, d:"2026-05"}
      ]},
    projects:[
      {t:"Mural plaza central", st:"En curso", pct:55, client:"Municipio GDL"},
      {t:"Taller comunitario", st:"En curso", pct:40, client:"Casa de Cultura"}
    ],
    portfolio:[
      {t:"Folclor", k:"Mural · 15m", c:"#8a6f3a"},
      {t:"Manos", k:"Mural", c:"#c0703a"},
      {t:"Sol", k:"Boceto", c:"#d0aa63"}
    ],
    trajectory:[ {y:"2022", t:"Primer mural público", d:"Encargo del municipio."} ],
    memories:[ {t:"La comunidad pinta", d:"Vecinos terminaron el mural con ella."} ],
    library:[ {t:"Permiso municipal.pdf", k:"Documento"} ],
    agenda:[ {h:"07:30", t:"Andamios plaza"}, {h:"15:00", t:"Taller jóvenes"} ]
  },
  {
    id:"tomas", name:"Tomás Rojas", color:"#5a4f8a", level:"ROOT", xp:1800,
    role:"Productor Musical", city:"Córdoba", country:"🇦🇷 Argentina",
    bio:"Producción musical y diseño sonoro para artistas independientes y audiovisual.",
    tags:["Música","Sound design","Producción"],
    clan:"AETHER LAB",
    finance:{ income:[
        {t:"Producción EP indie", a:900000, d:"2026-05"},
        {t:"Sound design — corto", a:420000, d:"2026-04"}
      ], expense:[
        {t:"Plugins y samples", a:130000, d:"2026-05"}
      ]},
    projects:[
      {t:"EP — artista emergente", st:"En curso", pct:60, client:"Artista indie"},
      {t:"Banda sonora corto", st:"Planificado", pct:15, client:"Productora"}
    ],
    portfolio:[
      {t:"EP 'Raíz'", k:"Producción", c:"#5a4f8a"},
      {t:"Score", k:"Sound design", c:"#111"},
      {t:"Beat tape", k:"Música", c:"#3a6f8a"}
    ],
    trajectory:[ {y:"2023", t:"Primer EP producido", d:"Para artista local de Córdoba."} ],
    memories:[ {t:"Estudio en casa", d:"Construyó su cabina con paneles caseros."} ],
    library:[ {t:"Stems EP.pdf", k:"Documento"} ],
    agenda:[ {h:"14:00", t:"Mezcla EP"}, {h:"20:00", t:"Sesión grabación voces"} ]
  },
  {
    id:"renata", name:"Renata Díaz", color:"#b8862f", level:"AETHER", xp:9100,
    role:"Diseñadora de Marca", city:"Bogotá", country:"🇨🇴 Colombia",
    bio:"Identidad de marca y dirección de arte. Ayuda a otras Almas a tener una marca clara.",
    tags:["Branding","Dirección de arte","Identidad"],
    clan:"AETHER LAB",
    finance:{ income:[
        {t:"Identidad de marca — restaurante", a:2600000, d:"2026-05"},
        {t:"Rediseño cafetería", a:1100000, d:"2026-04"},
        {t:"Manual de marca", a:740000, d:"2026-03"}
      ], expense:[
        {t:"Tipografías y assets", a:190000, d:"2026-05"}
      ]},
    projects:[
      {t:"Identidad restaurante 'Hoja'", st:"En curso", pct:80, client:"Hoja Cocina"},
      {t:"Sistema visual — clan AETHER", st:"En curso", pct:50, client:"AETHER LAB"}
    ],
    portfolio:[
      {t:"Hoja", k:"Identidad", c:"#b8862f"},
      {t:"Sistema", k:"Branding", c:"#111"},
      {t:"Tipo", k:"Lettering", c:"#8a6f3a"}
    ],
    trajectory:[
      {y:"2020", t:"Primer cliente grande", d:"Identidad para cadena local."},
      {y:"2025", t:"Se une a AETHER LAB", d:"Lidera la dirección de arte del clan."}
    ],
    memories:[ {t:"La marca es una historia", d:"Cada logo nace de una conversación honesta."} ],
    library:[ {t:"Manual Hoja.pdf", k:"Manual"}, {t:"Brief AETHER.pdf", k:"Brief"} ],
    agenda:[ {h:"10:30", t:"Presentación logo Hoja"}, {h:"15:30", t:"Sistema visual clan"} ]
  }
];

/* === CLANES (Nivel 2) === */
const SEED_CLANS = [
  { id:"blackink", name:"BLACK INK STUDIO", emoji:"🖤", desc:"Estudio de tatuaje y muralismo.", members:["sark","valentina"] },
  { id:"aetherlab", name:"AETHER LAB", emoji:"☽", desc:"Laboratorio de IA, sonido y dirección de arte.", members:["nicolas","lucia","tomas","renata"] },
  { id:"wildhouse", name:"WILD HOUSE", emoji:"🐾", desc:"Casa de streetwear y muralismo comunitario.", members:["diego","sofia"] }
];

/* === SANTUARIO (Nivel 3) === */
/* Más de 8 Almas: organización avanzada que agrupa múltiples Clanes. */
const SEED_SANCTUARY = {
  name:"ANIMA — Founding Sanctuary",
  emoji:"🜁",
  desc:"El primer Santuario de ANIMA: las 10 Almas Fundadoras y sus tres Clanes, unidos en The Founding Era.",
  clans:["blackink","aetherlab","wildhouse"],
  departments:[
    { t:"Arte & Muralismo", lead:"sark" },
    { t:"Digital & IA",      lead:"nicolas" },
    { t:"Marca & Producto",  lead:"renata" }
  ]
};
