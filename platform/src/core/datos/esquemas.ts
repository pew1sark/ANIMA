import type { Esquema, Opcion } from '@/core/datos/tipos';

/* Las entidades de ANIMA COMPANY, declaradas sobre las tablas que ya trajo la
   arquitectura de Bilagay. Aquí no se inventa nada: se describe lo que la base
   ya sabe guardar, y el motor dibuja las pantallas.

   Agregar un módulo nuevo es agregar un esquema a esta lista. */

const ESTADO: Opcion[] = [
  { valor: 'activo',    nombre: 'Activo',    tono: 'ok' },
  { valor: 'inactivo',  nombre: 'Inactivo',  tono: 'neutro' },
  { valor: 'archivado', nombre: 'Archivado', tono: 'neutro' }
];

const UNIDAD: Opcion[] = [
  { valor: 'kg', nombre: 'Kilos' }, { valor: 'g', nombre: 'Gramos' },
  { valor: 'unidad', nombre: 'Unidad' }, { valor: 'caja', nombre: 'Caja' },
  { valor: 'bandeja', nombre: 'Bandeja' }
];

/* Los estados de un pedido, en el orden en que ocurren. Es el mismo enum
   `order_status` de la base: el tablero no inventa columnas, las lee. */
export const ESTADO_PEDIDO: Opcion[] = [
  { valor: 'nuevo',           nombre: 'Nuevo',           tono: 'neutro' },
  { valor: 'confirmado',      nombre: 'Confirmado',      tono: 'acento' },
  { valor: 'en_preparacion',  nombre: 'En preparación',  tono: 'acento' },
  { valor: 'preparado',       nombre: 'Preparado',       tono: 'acento' },
  { valor: 'en_reparto',      nombre: 'En reparto',      tono: 'aviso' },
  { valor: 'entregado',       nombre: 'Entregado',       tono: 'ok' },
  { valor: 'cancelado',       nombre: 'Cancelado',       tono: 'malo' }
];

const PAGO: Opcion[] = [
  { valor: 'pendiente', nombre: 'Pendiente', tono: 'aviso' },
  { valor: 'parcial',   nombre: 'Parcial',   tono: 'aviso' },
  { valor: 'pagado',    nombre: 'Pagado',    tono: 'ok' },
  { valor: 'vencido',   nombre: 'Vencido',   tono: 'malo' }
];

const METODO: Opcion[] = [
  { valor: 'efectivo', nombre: 'Efectivo' }, { valor: 'transferencia', nombre: 'Transferencia' },
  { valor: 'tarjeta', nombre: 'Tarjeta' }, { valor: 'cheque', nombre: 'Cheque' },
  { valor: 'credito', nombre: 'Crédito' }, { valor: 'otro', nombre: 'Otro' }
];

// ----------------------------------------------------------------- clientes

const TIPO_CLIENTE: Opcion[] = [
  { valor: 'particular',   nombre: 'Particular' },
  { valor: 'restaurante',  nombre: 'Restaurante' },
  { valor: 'hotel',        nombre: 'Hotel' },
  { valor: 'supermercado', nombre: 'Supermercado' },
  { valor: 'mayorista',    nombre: 'Mayorista' },
  { valor: 'distribuidor', nombre: 'Distribuidor' },
  { valor: 'otro',         nombre: 'Otro' }
];

export const CLIENTES: Esquema = {
  tabla: 'customers',
  titulo: 'Clientes', singular: 'Cliente', principal: 'name',
  vacio: 'Los clientes son la base de los pedidos, los precios y la cobranza. Conviene empezar por aquí.',
  campos: [
    { key: 'name',          label: 'Nombre',    tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(180px,2fr)' },
    { key: 'customer_type', label: 'Tipo',      tipo: 'seleccion', opciones: TIPO_CLIENTE,
      enTabla: true, enLinea: true, ancho: '140px', porDefecto: 'particular' },
    { key: 'rut',           label: 'RUT',       tipo: 'texto', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'phone',         label: 'Teléfono',  tipo: 'texto', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'comuna',        label: 'Comuna',    tipo: 'texto', enTabla: true, enLinea: true, ancho: '140px' },
    { key: 'credit_limit',  label: 'Crédito',   tipo: 'moneda', enTabla: true, enLinea: true, ancho: '110px', porDefecto: 0 },
    { key: 'status',        label: 'Estado',    tipo: 'seleccion', opciones: ESTADO,
      enTabla: true, enLinea: true, ancho: '120px', porDefecto: 'activo' },
    { key: 'company',       label: 'Razón social', tipo: 'texto' },
    { key: 'contact_name',  label: 'Contacto',  tipo: 'texto' },
    { key: 'email',         label: 'Correo',    tipo: 'texto' },
    { key: 'whatsapp',      label: 'WhatsApp',  tipo: 'texto' },
    { key: 'address',       label: 'Dirección', tipo: 'texto' },
    { key: 'region',        label: 'Región',    tipo: 'texto' },
    { key: 'payment_terms_days', label: 'Días de pago', tipo: 'entero', porDefecto: 0 },
    { key: 'price_list_id', label: 'Lista de precios', tipo: 'relacion',
      relacion: { tabla: 'price_lists', etiqueta: 'name' } },
    { key: 'notes',         label: 'Notas',     tipo: 'texto-largo' }
  ],
  tablero: 'customer_type',
  orden: { campo: 'name', asc: true }
};

// ---------------------------------------------------------------- productos

export const PRODUCTOS: Esquema = {
  tabla: 'products',
  titulo: 'Productos', singular: 'Producto', principal: 'name',
  vacio: 'El catálogo es la base de los pedidos y de los precios. Conviene empezar por aquí.',
  campos: [
    { key: 'name',        label: 'Nombre',     tipo: 'texto',      requerido: true, enTabla: true, ancho: 'minmax(180px,2fr)' },
    { key: 'sku',         label: 'SKU',        tipo: 'texto',      enTabla: true, enLinea: true, ancho: '110px' },
    { key: 'category_id', label: 'Categoría',  tipo: 'relacion',   enTabla: true, ancho: '140px',
      relacion: { tabla: 'product_categories', etiqueta: 'name' } },
    { key: 'base_unit',   label: 'Unidad',     tipo: 'seleccion',  opciones: UNIDAD, requerido: true,
      enTabla: true, enLinea: true, ancho: '110px', porDefecto: 'kg' },
    { key: 'sale_price',  label: 'Precio',     tipo: 'moneda',     enTabla: true, enLinea: true, ancho: '110px' },
    { key: 'min_stock',   label: 'Stock mín.', tipo: 'numero',     enTabla: true, enLinea: true, ancho: '100px' },
    { key: 'status',      label: 'Estado',     tipo: 'seleccion',  opciones: ESTADO, enTabla: true,
      enLinea: true, ancho: '120px', porDefecto: 'activo' },
    { key: 'presentation',   label: 'Presentación',   tipo: 'texto' },
    { key: 'package_format', label: 'Formato',        tipo: 'texto' },
    { key: 'package_weight', label: 'Peso del bulto', tipo: 'numero' },
    { key: 'is_perishable',  label: 'Perecible',      tipo: 'booleano' },
    { key: 'shelf_life_days',label: 'Vida útil (días)', tipo: 'entero' },
    { key: 'last_cost',   label: 'Último costo', tipo: 'moneda', soloLectura: true },
    { key: 'avg_cost',    label: 'Costo medio',  tipo: 'moneda', soloLectura: true },
    { key: 'notes',       label: 'Notas',        tipo: 'texto-largo' }
  ],
  tablero: 'category_id',
  orden: { campo: 'name', asc: true }
};

// ------------------------------------------------------------- proveedores

export const PROVEEDORES: Esquema = {
  tabla: 'suppliers',
  titulo: 'Proveedores', singular: 'Proveedor', principal: 'name',
  vacio: 'De aquí sale lo que se compra. Sin proveedores no hay compras que registrar.',
  campos: [
    { key: 'name',    label: 'Nombre',   tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(180px,2fr)' },
    { key: 'rut',     label: 'RUT',      tipo: 'texto', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'contact_name', label: 'Contacto', tipo: 'texto', enTabla: true, ancho: '150px' },
    { key: 'phone',   label: 'Teléfono', tipo: 'texto', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'payment_terms_days', label: 'Días de pago', tipo: 'entero', enTabla: true, enLinea: true,
      ancho: '110px', porDefecto: 0 },
    { key: 'status',  label: 'Estado',   tipo: 'seleccion', opciones: ESTADO, enTabla: true,
      enLinea: true, ancho: '120px', porDefecto: 'activo' },
    { key: 'company', label: 'Razón social', tipo: 'texto' },
    { key: 'email',   label: 'Correo',   tipo: 'texto' },
    { key: 'whatsapp',label: 'WhatsApp', tipo: 'texto' },
    { key: 'address', label: 'Dirección',tipo: 'texto' },
    { key: 'comuna',  label: 'Comuna',   tipo: 'texto' },
    { key: 'region',  label: 'Región',   tipo: 'texto' },
    { key: 'rating',  label: 'Evaluación (1-5)', tipo: 'entero' },
    { key: 'notes',   label: 'Notas',    tipo: 'texto-largo' }
  ],
  orden: { campo: 'name', asc: true }
};

// ---------------------------------------------------------------- categorías

export const CATEGORIAS: Esquema = {
  tabla: 'product_categories',
  titulo: 'Categorías', singular: 'Categoría', principal: 'name',
  vacio: 'Las categorías ordenan el catálogo. Con pocas basta.',
  campos: [
    { key: 'name',        label: 'Nombre',      tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(200px,2fr)' },
    { key: 'sort_order',  label: 'Orden',       tipo: 'entero', enTabla: true, enLinea: true, ancho: '90px', porDefecto: 0 },
    { key: 'description', label: 'Descripción', tipo: 'texto-largo', enTabla: true }
  ],
  orden: { campo: 'sort_order', asc: true }
};

// ------------------------------------------------------------------ pedidos

export const PEDIDOS: Esquema = {
  tabla: 'orders',
  titulo: 'Pedidos', singular: 'Pedido', principal: 'code',
  vacio: 'Aquí vive la venta: quién pidió, qué, cuándo se entrega y si está pagado.',
  campos: [
    { key: 'code',        label: 'Código',   tipo: 'texto', soloLectura: true, enTabla: true, ancho: '110px' },
    { key: 'customer_id', label: 'Cliente',  tipo: 'relacion', requerido: true, enTabla: true,
      ancho: 'minmax(160px,2fr)', relacion: { tabla: 'customers', etiqueta: 'name' } },
    { key: 'status',      label: 'Estado',   tipo: 'seleccion', opciones: ESTADO_PEDIDO,
      enTabla: true, enLinea: true, ancho: '150px', porDefecto: 'nuevo' },
    { key: 'delivery_date', label: 'Entrega', tipo: 'fecha', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'total',       label: 'Total',    tipo: 'moneda', soloLectura: true, enTabla: true, ancho: '120px' },
    { key: 'payment_status', label: 'Pago',  tipo: 'seleccion', opciones: PAGO, enTabla: true,
      enLinea: true, ancho: '120px', porDefecto: 'pendiente' },
    { key: 'payment_method', label: 'Forma de pago', tipo: 'seleccion', opciones: METODO, porDefecto: 'efectivo' },
    { key: 'delivery_window', label: 'Horario de entrega', tipo: 'texto' },
    { key: 'due_date',    label: 'Vence',    tipo: 'fecha' },
    { key: 'freight',     label: 'Flete',    tipo: 'moneda', porDefecto: 0 },
    { key: 'discount',    label: 'Descuento',tipo: 'moneda', porDefecto: 0 },
    { key: 'subtotal',    label: 'Subtotal', tipo: 'moneda', soloLectura: true },
    { key: 'amount_paid', label: 'Abonado',  tipo: 'moneda', porDefecto: 0 },
    { key: 'notes',       label: 'Notas',    tipo: 'texto-largo' }
  ],
  tablero: 'status',
  orden: { campo: 'order_date', asc: false }
};

/** Todo lo que el motor sabe dibujar, por módulo de la plataforma. */
export const ESQUEMAS_POR_MODULO: Record<string, Esquema[]> = {
  crm:        [CLIENTES],
  commerce:   [PEDIDOS, PRODUCTOS, CATEGORIAS],
  operations: [PROVEEDORES]
};
