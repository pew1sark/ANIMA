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
    { key: 'phone', grupo: 'Contacto',         label: 'Teléfono',  tipo: 'texto', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'comuna', grupo: 'Dónde está',        label: 'Comuna',    tipo: 'texto', enTabla: true, enLinea: true, ancho: '140px' },
    { key: 'credit_limit', grupo: 'Comercial',  label: 'Crédito',   tipo: 'moneda', enTabla: true, enLinea: true, ancho: '110px', porDefecto: 0 },
    { key: 'status',        label: 'Estado',    tipo: 'seleccion', opciones: ESTADO,
      enTabla: true, enLinea: true, ancho: '120px', porDefecto: 'activo' },
    { key: 'company', grupo: 'Comercial',       label: 'Razón social', tipo: 'texto' },
    { key: 'contact_name', grupo: 'Contacto',  label: 'Persona de contacto', tipo: 'texto' },
    { key: 'email', grupo: 'Contacto',         label: 'Correo',    tipo: 'texto' },
    { key: 'whatsapp', grupo: 'Contacto',      label: 'WhatsApp',  tipo: 'texto' },
    { key: 'address', grupo: 'Dónde está',       label: 'Dirección', tipo: 'texto' },
    { key: 'region', grupo: 'Dónde está',        label: 'Región',    tipo: 'texto' },
    { key: 'payment_terms_days', grupo: 'Comercial', label: 'Días de pago', tipo: 'entero', porDefecto: 0 },
    { key: 'price_list_id', grupo: 'Comercial', label: 'Lista de precios', tipo: 'relacion',
      relacion: { tabla: 'price_lists', etiqueta: 'name' } },
    { key: 'notes', grupo: 'Comercial',         label: 'Notas',     tipo: 'texto-largo' }
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
    { key: 'base_unit', grupo: 'Formato',   label: 'Unidad',     tipo: 'seleccion',  opciones: UNIDAD, requerido: true,
      enTabla: true, enLinea: true, ancho: '110px', porDefecto: 'kg' },
    { key: 'sale_price', grupo: 'Precio y stock',  label: 'Precio',     tipo: 'moneda',     enTabla: true, enLinea: true, ancho: '110px' },
    { key: 'min_stock', grupo: 'Precio y stock',   label: 'Stock mín.', tipo: 'numero',     enTabla: true, enLinea: true, ancho: '100px' },
    { key: 'status',      label: 'Estado',     tipo: 'seleccion',  opciones: ESTADO, enTabla: true,
      enLinea: true, ancho: '120px', porDefecto: 'activo' },
    { key: 'presentation', grupo: 'Formato',   label: 'Presentación',   tipo: 'texto' },
    { key: 'package_format', grupo: 'Formato', label: 'Formato',        tipo: 'texto' },
    { key: 'package_weight', grupo: 'Formato', label: 'Peso del bulto', tipo: 'numero' },
    { key: 'is_perishable', grupo: 'Frescura',  label: 'Perecible',      tipo: 'booleano' },
    { key: 'shelf_life_days', grupo: 'Frescura',label: 'Vida útil (días)', tipo: 'entero' },
    { key: 'last_cost', grupo: 'Precio y stock',   label: 'Último costo', tipo: 'moneda', soloLectura: true },
    { key: 'avg_cost', grupo: 'Precio y stock',    label: 'Costo medio',  tipo: 'moneda', soloLectura: true },
    { key: 'notes', grupo: 'Frescura',       label: 'Notas',        tipo: 'texto-largo' }
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
    { key: 'contact_name', grupo: 'Contacto', label: 'Persona de contacto', tipo: 'texto', enTabla: true, ancho: '150px' },
    { key: 'phone', grupo: 'Contacto',   label: 'Teléfono', tipo: 'texto', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'payment_terms_days', grupo: 'Comercial', label: 'Días de pago', tipo: 'entero', enTabla: true, enLinea: true,
      ancho: '110px', porDefecto: 0 },
    { key: 'status',  label: 'Estado',   tipo: 'seleccion', opciones: ESTADO, enTabla: true,
      enLinea: true, ancho: '120px', porDefecto: 'activo' },
    { key: 'company', grupo: 'Comercial', label: 'Razón social', tipo: 'texto' },
    { key: 'email', grupo: 'Contacto',   label: 'Correo',   tipo: 'texto' },
    { key: 'whatsapp', grupo: 'Contacto',label: 'WhatsApp', tipo: 'texto' },
    { key: 'address', grupo: 'Dónde está', label: 'Dirección',tipo: 'texto' },
    { key: 'comuna', grupo: 'Dónde está',  label: 'Comuna',   tipo: 'texto' },
    { key: 'region', grupo: 'Dónde está',  label: 'Región',   tipo: 'texto' },
    { key: 'rating', grupo: 'Comercial',  label: 'Evaluación (1-5)', tipo: 'entero' },
    { key: 'notes', grupo: 'Comercial',   label: 'Notas',    tipo: 'texto-largo' }
  ],
  orden: { campo: 'name', asc: true }
};

// ---------------------------------------------------------------- categorías

export const CATEGORIAS: Esquema = {
  tabla: 'product_categories',
  titulo: 'Categorías', singular: 'Categoría', femenino: true, principal: 'name',
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
    { key: 'delivery_date', grupo: 'Entrega', label: 'Entrega', tipo: 'fecha', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'total',       label: 'Total',    tipo: 'moneda', soloLectura: true, enTabla: true, ancho: '120px' },
    { key: 'payment_status', grupo: 'Cobro', label: 'Pago',  tipo: 'seleccion', opciones: PAGO, enTabla: true,
      enLinea: true, ancho: '120px', porDefecto: 'pendiente' },
    { key: 'payment_method', grupo: 'Cobro', label: 'Forma de pago', tipo: 'seleccion', opciones: METODO, porDefecto: 'efectivo' },
    { key: 'delivery_window', grupo: 'Entrega', label: 'Horario de entrega', tipo: 'texto' },
    { key: 'due_date', grupo: 'Cobro',    label: 'Vence',    tipo: 'fecha' },
    { key: 'freight', grupo: 'Entrega',     label: 'Flete',    tipo: 'moneda', porDefecto: 0 },
    { key: 'discount', grupo: 'Cobro',    label: 'Descuento',tipo: 'moneda', porDefecto: 0 },
    { key: 'subtotal',    label: 'Subtotal', tipo: 'moneda', soloLectura: true },
    { key: 'amount_paid', grupo: 'Cobro', label: 'Abonado',  tipo: 'moneda', porDefecto: 0 },
    { key: 'notes', grupo: 'Cobro',       label: 'Notas',    tipo: 'texto-largo' }
  ],
  tablero: 'status',
  orden: { campo: 'order_date', asc: false },
  detalle: {
    tabla: 'order_items', padre: 'order_id',
    titulo: 'Productos del pedido', singular: 'producto',
    total: 'line_total',
    campos: [
      { key: 'product_id', label: 'Producto', tipo: 'relacion', requerido: true, enTabla: true,
        relacion: { tabla: 'products', etiqueta: 'name' } },
      { key: 'quantity_ordered', label: 'Cantidad', tipo: 'numero', requerido: true, enTabla: true },
      { key: 'unit', label: 'Unidad', tipo: 'seleccion', opciones: UNIDAD, enTabla: true, porDefecto: 'kg' },
      { key: 'unit_price', label: 'Precio unitario', tipo: 'moneda', requerido: true, enTabla: true },
      { key: 'discount', label: 'Descuento', tipo: 'moneda', porDefecto: 0 },
      { key: 'notes', label: 'Notas', tipo: 'texto' }
    ]
  }
};

// ------------------------------------------------------------------ compras

const ESTADO_COMPRA: Opcion[] = [
  { valor: 'borrador', nombre: 'Borrador', tono: 'neutro' },
  { valor: 'recibida', nombre: 'Recibida', tono: 'ok' },
  { valor: 'anulada',  nombre: 'Anulada',  tono: 'malo' }
];

export const COMPRAS: Esquema = {
  tabla: 'purchases',
  titulo: 'Compras', singular: 'Compra', femenino: true, principal: 'code',
  vacio: 'Por aquí entra lo que después se vende. Cada compra alimenta el inventario.',
  nivelEscritura: 60,
  campos: [
    { key: 'code',        label: 'Código',   tipo: 'texto', soloLectura: true, enTabla: true, ancho: '120px' },
    { key: 'supplier_id', label: 'Proveedor',tipo: 'relacion', requerido: true, enTabla: true,
      ancho: 'minmax(160px,2fr)', relacion: { tabla: 'suppliers', etiqueta: 'name' } },
    { key: 'status',      label: 'Estado',   tipo: 'seleccion', opciones: ESTADO_COMPRA,
      enTabla: true, enLinea: true, ancho: '130px', porDefecto: 'borrador' },
    { key: 'purchase_date', label: 'Fecha',  tipo: 'fecha', enTabla: true, enLinea: true, ancho: '120px' },
    { key: 'total',       label: 'Total',    tipo: 'moneda', soloLectura: true, enTabla: true, ancho: '120px' },
    { key: 'payment_status', label: 'Pago',  tipo: 'seleccion', opciones: PAGO, enTabla: true,
      enLinea: true, ancho: '120px', porDefecto: 'pendiente' },
    { key: 'payment_method', label: 'Forma de pago', tipo: 'seleccion', opciones: METODO, porDefecto: 'efectivo' },
    { key: 'freight_cost',label: 'Flete',    tipo: 'moneda', porDefecto: 0 },
    { key: 'other_costs', label: 'Otros costos', tipo: 'moneda', porDefecto: 0 },
    { key: 'due_date',    label: 'Vence',    tipo: 'fecha' },
    { key: 'invoice_number', label: 'N° de documento', tipo: 'texto' },
    { key: 'origin',      label: 'Origen',   tipo: 'texto' },
    { key: 'subtotal',    label: 'Subtotal', tipo: 'moneda', soloLectura: true },
    { key: 'amount_paid', label: 'Pagado',   tipo: 'moneda', soloLectura: true },
    { key: 'notes',       label: 'Notas',    tipo: 'texto-largo' }
  ],
  tablero: 'status',
  orden: { campo: 'purchase_date', asc: false },
  detalle: {
    tabla: 'purchase_items', padre: 'purchase_id',
    titulo: 'Productos de la compra', singular: 'producto',
    total: 'line_total',
    campos: [
      { key: 'product_id', label: 'Producto', tipo: 'relacion', requerido: true, enTabla: true,
        relacion: { tabla: 'products', etiqueta: 'name' } },
      { key: 'quantity',   label: 'Cantidad', tipo: 'numero', requerido: true, enTabla: true },
      { key: 'unit',       label: 'Unidad',   tipo: 'seleccion', opciones: UNIDAD, enTabla: true, porDefecto: 'kg' },
      { key: 'unit_price', label: 'Precio unitario', tipo: 'moneda', requerido: true, enTabla: true },
      { key: 'notes',      label: 'Notas',    tipo: 'texto' }
    ]
  }
};

// --------------------------------------------------------------- inventario

const ESTADO_LOTE: Opcion[] = [
  { valor: 'disponible', nombre: 'Disponible', tono: 'ok' },
  { valor: 'agotado',    nombre: 'Agotado',    tono: 'neutro' },
  { valor: 'vencido',    nombre: 'Vencido',    tono: 'malo' },
  { valor: 'bloqueado',  nombre: 'Bloqueado',  tono: 'aviso' }
];

export const LOTES: Esquema = {
  tabla: 'inventory_lots',
  titulo: 'Inventario', singular: 'Lote', principal: 'code',
  vacio: 'Cada entrada de mercadería crea un lote. De ahí sale el stock y el costo.',
  campos: [
    { key: 'code',       label: 'Lote',      tipo: 'texto', soloLectura: true, enTabla: true, ancho: '120px' },
    { key: 'product_id', label: 'Producto',  tipo: 'relacion', requerido: true, enTabla: true,
      ancho: 'minmax(160px,2fr)', relacion: { tabla: 'products', etiqueta: 'name' } },
    { key: 'quantity_on_hand', label: 'En mano', tipo: 'numero', enTabla: true, enLinea: true, ancho: '100px' },
    { key: 'quantity_available', label: 'Disponible', tipo: 'numero', soloLectura: true, enTabla: true, ancho: '110px' },
    { key: 'unit',       label: 'Unidad',    tipo: 'seleccion', opciones: UNIDAD, enTabla: true, ancho: '100px', porDefecto: 'kg' },
    { key: 'unit_cost',  label: 'Costo',     tipo: 'moneda', enTabla: true, enLinea: true, ancho: '110px' },
    { key: 'expires_at', label: 'Vence',     tipo: 'fecha', enTabla: true, enLinea: true, ancho: '120px' },
    { key: 'status',     label: 'Estado',    tipo: 'seleccion', opciones: ESTADO_LOTE, enTabla: true,
      enLinea: true, ancho: '130px', porDefecto: 'disponible' },
    { key: 'initial_quantity', label: 'Cantidad inicial', tipo: 'numero', requerido: true },
    { key: 'supplier_id',label: 'Proveedor', tipo: 'relacion', relacion: { tabla: 'suppliers', etiqueta: 'name' } },
    { key: 'location_id',label: 'Bodega',    tipo: 'relacion', relacion: { tabla: 'locations', etiqueta: 'name' } },
    { key: 'production_date', label: 'Producción', tipo: 'fecha' },
    { key: 'origin',     label: 'Origen',    tipo: 'texto' },
    { key: 'quantity_reserved', label: 'Reservado', tipo: 'numero', soloLectura: true },
    { key: 'notes',      label: 'Notas',     tipo: 'texto-largo' }
  ],
  tablero: 'status',
  orden: { campo: 'received_at', asc: false }
};

const TIPO_MOV: Opcion[] = [
  { valor: 'entrada_compra',      nombre: 'Entrada por compra',  tono: 'ok' },
  { valor: 'ajuste_positivo',     nombre: 'Ajuste +',            tono: 'ok' },
  { valor: 'salida_venta',        nombre: 'Salida por venta',    tono: 'acento' },
  { valor: 'reserva',             nombre: 'Reserva',             tono: 'neutro' },
  { valor: 'liberacion_reserva',  nombre: 'Liberación',          tono: 'neutro' },
  { valor: 'merma',               nombre: 'Merma',               tono: 'malo' },
  { valor: 'ajuste_negativo',     nombre: 'Ajuste −',            tono: 'malo' },
  { valor: 'devolucion',          nombre: 'Devolución',          tono: 'aviso' },
  { valor: 'traslado',            nombre: 'Traslado',            tono: 'neutro' },
  { valor: 'proceso_consumo',     nombre: 'Consumo de proceso',  tono: 'neutro' },
  { valor: 'proceso_produccion',  nombre: 'Producción',          tono: 'ok' }
];

/* Los movimientos los escribe la base: son el registro de lo que pasó, no algo
   que alguien teclee. Se muestran para poder auditar el stock. */
export const MOVIMIENTOS: Esquema = {
  tabla: 'inventory_movements',
  titulo: 'Movimientos', singular: 'Movimiento', principal: 'reference_code',
  vacio: 'Cada entrada, salida, merma o ajuste deja aquí su rastro. Lo escribe el sistema.',
  campos: [
    { key: 'created_at', label: 'Cuándo',   tipo: 'fecha', soloLectura: true, enTabla: true, ancho: '120px' },
    { key: 'type',       label: 'Tipo',     tipo: 'seleccion', opciones: TIPO_MOV, soloLectura: true,
      enTabla: true, ancho: '170px' },
    { key: 'product_id', label: 'Producto', tipo: 'relacion', soloLectura: true, enTabla: true,
      ancho: 'minmax(160px,2fr)', relacion: { tabla: 'products', etiqueta: 'name' } },
    { key: 'quantity',   label: 'Cantidad', tipo: 'numero', soloLectura: true, enTabla: true, ancho: '110px' },
    { key: 'unit',       label: 'Unidad',   tipo: 'seleccion', opciones: UNIDAD, soloLectura: true, enTabla: true, ancho: '100px' },
    { key: 'reference_code', label: 'Documento', tipo: 'texto', soloLectura: true, enTabla: true, ancho: '130px' },
    { key: 'reason',     label: 'Motivo',   tipo: 'texto', soloLectura: true }
  ],
  orden: { campo: 'created_at', asc: false }
};

export const BODEGAS: Esquema = {
  tabla: 'locations',
  titulo: 'Bodegas', singular: 'Bodega', femenino: true, principal: 'name',
  vacio: 'Dónde se guarda lo que hay: bodegas, cámaras, vehículos.',
  campos: [
    { key: 'name',        label: 'Nombre',    tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(180px,2fr)' },
    { key: 'type',        label: 'Tipo',      tipo: 'texto', enTabla: true, enLinea: true, ancho: '140px', porDefecto: 'bodega' },
    { key: 'capacity_kg', label: 'Capacidad (kg)', tipo: 'numero', enTabla: true, enLinea: true, ancho: '140px' },
    { key: 'status',      label: 'Estado',    tipo: 'seleccion', opciones: ESTADO, enTabla: true,
      enLinea: true, ancho: '120px', porDefecto: 'activo' },
    { key: 'notes',       label: 'Notas',     tipo: 'texto-largo' }
  ],
  orden: { campo: 'name', asc: true }
};

const MOTIVO_MERMA: Opcion[] = [
  { valor: 'merma_proceso',    nombre: 'Merma de proceso' },
  { valor: 'dano',             nombre: 'Daño' },
  { valor: 'vencimiento',      nombre: 'Vencimiento' },
  { valor: 'diferencia_peso',  nombre: 'Diferencia de peso' },
  { valor: 'robo',             nombre: 'Robo' },
  { valor: 'devolucion',       nombre: 'Devolución' },
  { valor: 'otro',             nombre: 'Otro' }
];

export const MERMAS: Esquema = {
  tabla: 'losses',
  titulo: 'Mermas', singular: 'Merma', femenino: true, principal: 'code',
  vacio: 'Lo que se perdió y por qué. Cada merma descuenta del inventario.',
  campos: [
    { key: 'code',       label: 'Código',   tipo: 'texto', soloLectura: true, enTabla: true, ancho: '110px' },
    { key: 'product_id', label: 'Producto', tipo: 'relacion', requerido: true, enTabla: true,
      ancho: 'minmax(160px,2fr)', relacion: { tabla: 'products', etiqueta: 'name' } },
    { key: 'quantity',   label: 'Cantidad', tipo: 'numero', requerido: true, enTabla: true, ancho: '110px' },
    { key: 'unit',       label: 'Unidad',   tipo: 'seleccion', opciones: UNIDAD, enTabla: true, ancho: '100px', porDefecto: 'kg' },
    { key: 'reason',     label: 'Motivo',   tipo: 'seleccion', opciones: MOTIVO_MERMA, enTabla: true,
      enLinea: true, ancho: '170px', porDefecto: 'otro' },
    { key: 'cost',       label: 'Costo',    tipo: 'moneda', enTabla: true, enLinea: true, ancho: '110px', porDefecto: 0 },
    { key: 'lot_id',     label: 'Lote',     tipo: 'relacion', relacion: { tabla: 'inventory_lots', etiqueta: 'code' } },
    { key: 'notes',      label: 'Notas',    tipo: 'texto-largo' }
  ],
  tablero: 'reason',
  orden: { campo: 'created_at', asc: false }
};

// ------------------------------------------------------------------ reparto

const ESTADO_ENTREGA: Opcion[] = [
  { valor: 'pendiente', nombre: 'Pendiente', tono: 'neutro' },
  { valor: 'asignada',  nombre: 'Asignada',  tono: 'acento' },
  { valor: 'en_camino', nombre: 'En camino', tono: 'aviso' },
  { valor: 'entregada', nombre: 'Entregada', tono: 'ok' },
  { valor: 'fallida',   nombre: 'Fallida',   tono: 'malo' }
];

export const ENTREGAS: Esquema = {
  tabla: 'deliveries',
  titulo: 'Entregas', singular: 'Entrega', femenino: true, principal: 'code',
  vacio: 'Cada pedido que sale a la calle se sigue desde aquí.',
  campos: [
    { key: 'code',      label: 'Código',  tipo: 'texto', soloLectura: true, enTabla: true, ancho: '120px' },
    { key: 'order_id',  label: 'Pedido',  tipo: 'relacion', requerido: true, enTabla: true,
      ancho: 'minmax(150px,2fr)', relacion: { tabla: 'orders', etiqueta: 'code' } },
    { key: 'status',    label: 'Estado',  tipo: 'seleccion', opciones: ESTADO_ENTREGA,
      enTabla: true, enLinea: true, ancho: '140px', porDefecto: 'pendiente' },
    { key: 'scheduled_date', label: 'Programada', tipo: 'fecha', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'route_id',  label: 'Ruta',    tipo: 'relacion', enTabla: true, ancho: '150px',
      relacion: { tabla: 'routes', etiqueta: 'name' } },
    { key: 'amount_collected', label: 'Cobrado', tipo: 'moneda', enTabla: true, enLinea: true,
      ancho: '120px', porDefecto: 0 },
    { key: 'sequence',  label: 'Orden en la ruta', tipo: 'entero' },
    { key: 'received_by_name', label: 'Recibió',   tipo: 'texto' },
    { key: 'payment_method',   label: 'Forma de pago', tipo: 'seleccion', opciones: METODO },
    { key: 'failure_reason',   label: 'Motivo del fallo', tipo: 'texto' },
    { key: 'notes',     label: 'Notas',   tipo: 'texto-largo' }
  ],
  tablero: 'status',
  orden: { campo: 'scheduled_date', asc: false }
};

export const RUTAS: Esquema = {
  tabla: 'routes',
  titulo: 'Rutas', singular: 'Ruta', femenino: true, principal: 'name',
  vacio: 'Una ruta agrupa las entregas de un día. Se arma antes de salir.',
  campos: [
    { key: 'name',       label: 'Nombre', tipo: 'texto', enTabla: true, ancho: 'minmax(180px,2fr)' },
    { key: 'route_date', label: 'Fecha',  tipo: 'fecha', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'status',     label: 'Estado', tipo: 'texto', enTabla: true, enLinea: true, ancho: '140px',
      porDefecto: 'planificada' },
    { key: 'code',       label: 'Código', tipo: 'texto', soloLectura: true, enTabla: true, ancho: '110px' },
    { key: 'notes',      label: 'Notas',  tipo: 'texto-largo' }
  ],
  orden: { campo: 'route_date', asc: false }
};

// ----------------------------------------------------------------- finanzas

const DIRECCION_PAGO: Opcion[] = [
  { valor: 'cobro', nombre: 'Cobro (entra)', tono: 'ok' },
  { valor: 'pago',  nombre: 'Pago (sale)',   tono: 'malo' }
];

/* Registrar un pago no solo guarda una fila: el trigger `trg_apply_payment`
   actualiza el saldo y el estado de pago del pedido o de la compra. Es el
   ejemplo más claro de por qué el frontend no debe calcular nada. */
export const PAGOS: Esquema = {
  tabla: 'payments',
  titulo: 'Pagos', singular: 'Pago', principal: 'code',
  vacio: 'Lo que entró y lo que salió. Cada pago ajusta solo el saldo de su pedido o compra.',
  nivelEscritura: 60,
  campos: [
    { key: 'code',      label: 'Código',    tipo: 'texto', soloLectura: true, enTabla: true, ancho: '120px' },
    { key: 'direction', label: 'Dirección', tipo: 'seleccion', opciones: DIRECCION_PAGO, requerido: true,
      enTabla: true, ancho: '150px', porDefecto: 'cobro' },
    { key: 'amount',    label: 'Monto',     tipo: 'moneda', requerido: true, enTabla: true, ancho: '130px' },
    { key: 'method',    label: 'Medio',     tipo: 'seleccion', opciones: METODO, enTabla: true,
      enLinea: true, ancho: '140px', porDefecto: 'efectivo' },
    { key: 'paid_at',   label: 'Fecha',     tipo: 'fecha', enTabla: true, enLinea: true, ancho: '120px' },
    { key: 'reference', label: 'Referencia',tipo: 'texto', enTabla: true, enLinea: true, ancho: '140px' },
    { key: 'order_id',  label: 'Pedido',    tipo: 'relacion', relacion: { tabla: 'orders', etiqueta: 'code' } },
    { key: 'purchase_id', label: 'Compra',  tipo: 'relacion', relacion: { tabla: 'purchases', etiqueta: 'code' } },
    { key: 'customer_id', label: 'Cliente', tipo: 'relacion', relacion: { tabla: 'customers', etiqueta: 'name' } },
    { key: 'supplier_id', label: 'Proveedor', tipo: 'relacion', relacion: { tabla: 'suppliers', etiqueta: 'name' } },
    { key: 'notes',     label: 'Notas',     tipo: 'texto-largo' }
  ],
  tablero: 'direction',
  orden: { campo: 'paid_at', asc: false }
};

export const POR_COBRAR: Esquema = {
  tabla: 'opening_receivables',
  titulo: 'Por cobrar (apertura)', singular: 'Documento', principal: 'customer_name',
  vacio: 'Lo que ya se debía cuando la empresa entró a ANIMA. Se carga una vez.',
  nivelEscritura: 60,
  campos: [
    { key: 'customer_name',  label: 'Cliente',   tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(170px,2fr)' },
    { key: 'document_number',label: 'Documento', tipo: 'texto', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'amount',         label: 'Monto',     tipo: 'moneda', requerido: true, enTabla: true, ancho: '130px' },
    { key: 'amount_paid',    label: 'Abonado',   tipo: 'moneda', enTabla: true, enLinea: true, ancho: '120px', porDefecto: 0 },
    { key: 'due_date',       label: 'Vence',     tipo: 'fecha', enTabla: true, enLinea: true, ancho: '120px' },
    { key: 'issued_at',      label: 'Emitido',   tipo: 'fecha' },
    { key: 'customer_id',    label: 'Cliente en ANIMA', tipo: 'relacion',
      relacion: { tabla: 'customers', etiqueta: 'name' } },
    { key: 'notes',          label: 'Notas',     tipo: 'texto-largo' }
  ],
  orden: { campo: 'due_date', asc: true }
};

export const POR_PAGAR: Esquema = {
  tabla: 'opening_payables',
  titulo: 'Por pagar (apertura)', singular: 'Documento', principal: 'supplier_name',
  vacio: 'Lo que la empresa ya debía al entrar a ANIMA.',
  nivelEscritura: 60,
  campos: [
    { key: 'supplier_name',  label: 'Proveedor', tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(170px,2fr)' },
    { key: 'document_number',label: 'Documento', tipo: 'texto', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'amount',         label: 'Monto',     tipo: 'moneda', requerido: true, enTabla: true, ancho: '130px' },
    { key: 'amount_paid',    label: 'Pagado',    tipo: 'moneda', enTabla: true, enLinea: true, ancho: '120px', porDefecto: 0 },
    { key: 'due_date',       label: 'Vence',     tipo: 'fecha', enTabla: true, enLinea: true, ancho: '120px' },
    { key: 'issued_at',      label: 'Emitido',   tipo: 'fecha' },
    { key: 'supplier_id',    label: 'Proveedor en ANIMA', tipo: 'relacion',
      relacion: { tabla: 'suppliers', etiqueta: 'name' } },
    { key: 'notes',          label: 'Notas',     tipo: 'texto-largo' }
  ],
  orden: { campo: 'due_date', asc: true }
};

// ------------------------------------------------------------------ precios

export const LISTAS_PRECIO: Esquema = {
  tabla: 'price_lists',
  titulo: 'Listas de precio', singular: 'Lista', femenino: true, principal: 'name',
  vacio: 'Una lista por segmento: mayorista, restaurante, público. Cada cliente puede tener la suya.',
  campos: [
    { key: 'name',        label: 'Nombre', tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(180px,2fr)' },
    { key: 'code',        label: 'Código', tipo: 'texto', requerido: true, enTabla: true, enLinea: true, ancho: '120px' },
    { key: 'is_default',  label: 'Por defecto', tipo: 'booleano', enTabla: true, enLinea: true, ancho: '120px' },
    { key: 'status',      label: 'Estado', tipo: 'seleccion', opciones: ESTADO, enTabla: true,
      enLinea: true, ancho: '120px', porDefecto: 'activo' },
    { key: 'description', label: 'Descripción', tipo: 'texto-largo' }
  ],
  orden: { campo: 'name', asc: true },
  detalle: {
    tabla: 'price_list_items', padre: 'price_list_id',
    titulo: 'Precios de la lista', singular: 'precio',
    campos: [
      { key: 'product_id', label: 'Producto', tipo: 'relacion', requerido: true, enTabla: true,
        relacion: { tabla: 'products', etiqueta: 'name' } },
      { key: 'price',      label: 'Precio',   tipo: 'moneda', requerido: true, enTabla: true }
    ]
  }
};

export const DIRECCIONES: Esquema = {
  tabla: 'customer_addresses',
  titulo: 'Direcciones de despacho', singular: 'Dirección', femenino: true, principal: 'address',
  vacio: 'Un cliente puede recibir en varios lugares. Aquí viven esas direcciones.',
  campos: [
    { key: 'customer_id', label: 'Cliente',  tipo: 'relacion', requerido: true, enTabla: true,
      ancho: 'minmax(160px,1fr)', relacion: { tabla: 'customers', etiqueta: 'name' } },
    { key: 'address',     label: 'Dirección',tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(180px,2fr)' },
    { key: 'comuna',      label: 'Comuna',   tipo: 'texto', enTabla: true, enLinea: true, ancho: '140px' },
    { key: 'label',       label: 'Etiqueta', tipo: 'texto', enTabla: true, enLinea: true, ancho: '120px', porDefecto: 'Principal' },
    { key: 'is_default',  label: 'Principal',tipo: 'booleano', enTabla: true, enLinea: true, ancho: '110px' },
    { key: 'region',      label: 'Región',   tipo: 'texto' },
    { key: 'reference',   label: 'Referencia', tipo: 'texto' },
    { key: 'contact_name',label: 'Contacto', tipo: 'texto' },
    { key: 'contact_phone', label: 'Teléfono', tipo: 'texto' }
  ],
  orden: { campo: 'address', asc: true }
};

// ------------------------------------------------------------------ procesos

export const ESPECIES: Esquema = {
  tabla: 'fish_species',
  titulo: 'Especies', singular: 'Especie', femenino: true, principal: 'common_name',
  vacio: 'El catálogo de especies con que trabaja la empresa.',
  campos: [
    { key: 'common_name',    label: 'Nombre común',     tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(180px,2fr)' },
    { key: 'scientific_name',label: 'Nombre científico',tipo: 'texto', enTabla: true, enLinea: true, ancho: '190px' },
    { key: 'family',         label: 'Familia',          tipo: 'texto', enTabla: true, enLinea: true, ancho: '150px' },
    { key: 'status',         label: 'Estado',           tipo: 'seleccion', opciones: ESTADO, enTabla: true,
      enLinea: true, ancho: '120px', porDefecto: 'activo' },
    { key: 'notes',          label: 'Notas',            tipo: 'texto-largo' }
  ],
  orden: { campo: 'common_name', asc: true }
};

export const PROCESOS: Esquema = {
  tabla: 'processing_orders',
  titulo: 'Procesos', singular: 'Proceso', principal: 'code',
  vacio: 'Convertir materia prima en producto elaborado, con su rendimiento.',
  campos: [
    { key: 'code',            label: 'Código',   tipo: 'texto', soloLectura: true, enTabla: true, ancho: '120px' },
    { key: 'source_product_id', label: 'Entra',  tipo: 'relacion', requerido: true, enTabla: true,
      ancho: 'minmax(160px,2fr)', relacion: { tabla: 'products', etiqueta: 'name' } },
    { key: 'input_quantity',  label: 'Cantidad', tipo: 'numero', requerido: true, enTabla: true, ancho: '110px' },
    { key: 'output_quantity', label: 'Sale',     tipo: 'numero', enTabla: true, enLinea: true, ancho: '100px', porDefecto: 0 },
    { key: 'yield_pct',       label: 'Rendimiento %', tipo: 'numero', soloLectura: true, enTabla: true, ancho: '130px' },
    { key: 'status',          label: 'Estado',   tipo: 'texto', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'source_lot_id',   label: 'Lote de origen', tipo: 'relacion', requerido: true,
      relacion: { tabla: 'inventory_lots', etiqueta: 'code' } },
    { key: 'waste_quantity',  label: 'Merma',    tipo: 'numero', porDefecto: 0 },
    { key: 'location_id',     label: 'Bodega',   tipo: 'relacion', relacion: { tabla: 'locations', etiqueta: 'name' } },
    { key: 'input_cost',      label: 'Costo de entrada', tipo: 'moneda', soloLectura: true },
    { key: 'notes',           label: 'Notas',    tipo: 'texto-largo' }
  ],
  orden: { campo: 'created_at', asc: false }
};

// ------------------------------------------------------------------- agenda

/* `agenda` y `tasks` vienen de STUDIO y llevan `alma_id` además de
   `company_id`. Tienen las dos políticas —una por alma, otra por empresa—, así
   que el motor las lee filtrando por empresa sin tocar nada de STUDIO. */
export const COMPROMISOS: Esquema = {
  tabla: 'agenda',
  titulo: 'Compromisos', singular: 'Compromiso', principal: 'title',
  vacio: 'Lo que hay que hacer en una fecha: una entrega, una visita, un cobro.',
  campos: [
    { key: 'title',   label: 'Compromiso', tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(200px,2fr)' },
    { key: 'on_date', label: 'Fecha',      tipo: 'fecha', requerido: true, enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'at_time', label: 'Hora',       tipo: 'texto', enTabla: true, enLinea: true, ancho: '100px' },
    { key: 'notes',   label: 'Notas',      tipo: 'texto-largo', enTabla: true, ancho: 'minmax(160px,1fr)' }
  ],
  orden: { campo: 'on_date', asc: true }
};

const PRIORIDAD: Opcion[] = [
  { valor: 'Alta',  nombre: 'Alta',  tono: 'malo' },
  { valor: 'Media', nombre: 'Media', tono: 'aviso' },
  { valor: 'Baja',  nombre: 'Baja',  tono: 'neutro' }
];

/* Los estados son los que STUDIO ya escribió en la tabla, con su mayúscula y
   todo. Inventar aquí un juego nuevo dejaría fuera del tablero a las tareas
   que ya existen. */
const ESTADO_TAREA: Opcion[] = [
  { valor: 'Pendiente',  nombre: 'Pendiente',  tono: 'neutro' },
  { valor: 'En proceso', nombre: 'En proceso', tono: 'acento' },
  { valor: 'Hecha',      nombre: 'Hecha',      tono: 'ok' },
  { valor: 'Archivada',  nombre: 'Archivada',  tono: 'neutro' }
];

export const TAREAS: Esquema = {
  tabla: 'tasks',
  titulo: 'Tareas', singular: 'Tarea', femenino: true, principal: 'title',
  vacio: 'Pendientes con responsable y fecha. Lo que no está aquí, no existe.',
  campos: [
    { key: 'title',    label: 'Tarea',     tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(200px,2fr)' },
    { key: 'status',   label: 'Estado',    tipo: 'seleccion', opciones: ESTADO_TAREA,
      enTabla: true, enLinea: true, ancho: '140px', porDefecto: 'Pendiente' },
    { key: 'priority', label: 'Prioridad', tipo: 'seleccion', opciones: PRIORIDAD,
      enTabla: true, enLinea: true, ancho: '120px', porDefecto: 'Media' },
    { key: 'due_at',   label: 'Vence',     tipo: 'fecha', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'project',  label: 'Proyecto',  tipo: 'texto', enTabla: true, enLinea: true, ancho: '150px' },
    { key: 'notes',    label: 'Notas',     tipo: 'texto-largo' }
  ],
  tablero: 'status',
  orden: { campo: 'due_at', asc: true }
};

// ------------------------------------------------------------------- taller

const ESTADO_PROYECTO: Opcion[] = [
  { valor: 'Planificado',   nombre: 'Planificado',   tono: 'neutro' },
  { valor: 'Cotizando',     nombre: 'Cotizando',     tono: 'aviso' },
  { valor: 'Aprobado',      nombre: 'Aprobado',      tono: 'acento' },
  { valor: 'En producción', nombre: 'En producción', tono: 'acento' },
  { valor: 'Revisión',      nombre: 'Revisión',      tono: 'aviso' },
  { valor: 'Entregado',     nombre: 'Entregado',     tono: 'ok' },
  { valor: 'Cerrado',       nombre: 'Cerrado',       tono: 'neutro' }
];

export const PROYECTOS: Esquema = {
  tabla: 'projects',
  titulo: 'Proyectos', singular: 'Proyecto', principal: 'title',
  vacio: 'Un encargo con presupuesto, avance y fecha. Es la unidad de trabajo del Taller.',
  campos: [
    { key: 'title',   label: 'Proyecto',  tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(200px,2fr)' },
    { key: 'client',  label: 'Cliente',   tipo: 'texto', enTabla: true, enLinea: true, ancho: '160px' },
    { key: 'status',  label: 'Estado',    tipo: 'seleccion', opciones: ESTADO_PROYECTO,
      enTabla: true, enLinea: true, ancho: '150px', porDefecto: 'Cotizando' },
    { key: 'pct',     label: 'Avance %',  tipo: 'entero', enTabla: true, enLinea: true, ancho: '110px', porDefecto: 0 },
    { key: 'budget', grupo: 'Dinero',  label: 'Presupuesto', tipo: 'moneda', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'paid', grupo: 'Dinero',    label: 'Cobrado',   tipo: 'moneda', enTabla: true, enLinea: true, ancho: '120px' },
    { key: 'due_at', grupo: 'Fechas',  label: 'Entrega',   tipo: 'fecha', enTabla: true, enLinea: true, ancho: '120px' },
    { key: 'started_at', grupo: 'Fechas',  label: 'Inicio',      tipo: 'fecha' },
    { key: 'category', grupo: 'Ficha',    label: 'Categoría',   tipo: 'texto' },
    { key: 'responsible', grupo: 'Ficha', label: 'Responsable', tipo: 'texto' },
    { key: 'comuna', grupo: 'Ficha',      label: 'Comuna',      tipo: 'texto' },
    { key: 'city', grupo: 'Ficha',        label: 'Ciudad',      tipo: 'texto' },
    { key: 'description', grupo: 'Ficha', label: 'Descripción', tipo: 'texto-largo' }
  ],
  tablero: 'status',
  orden: { campo: 'due_at', asc: true }
};

const ESTADO_COTIZACION: Opcion[] = [
  { valor: 'Borrador',  nombre: 'Borrador',  tono: 'neutro' },
  { valor: 'Enviada',   nombre: 'Enviada',   tono: 'aviso' },
  { valor: 'Aprobada',  nombre: 'Aprobada',  tono: 'ok' },
  { valor: 'Rechazada', nombre: 'Rechazada', tono: 'malo' }
];

export const COTIZACIONES: Esquema = {
  tabla: 'quotes',
  titulo: 'Cotizaciones', singular: 'Cotización', femenino: true, principal: 'title',
  vacio: 'Lo que se ofreció y por cuánto. De aquí sale el proyecto cuando la aprueban.',
  campos: [
    { key: 'title',       label: 'Concepto', tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(200px,2fr)' },
    { key: 'client_name', label: 'Cliente',  tipo: 'texto', enTabla: true, enLinea: true, ancho: '170px' },
    { key: 'status',      label: 'Estado',   tipo: 'seleccion', opciones: ESTADO_COTIZACION,
      enTabla: true, enLinea: true, ancho: '140px', porDefecto: 'Borrador' },
    { key: 'total',       label: 'Total',    tipo: 'moneda', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'subtotal',    label: 'Neto',     tipo: 'moneda', enTabla: true, ancho: '120px' },
    { key: 'discipline',  label: 'Disciplina', tipo: 'texto' },
    { key: 'tax_pct',     label: 'Impuesto %', tipo: 'numero' },
    { key: 'notes',       label: 'Notas',    tipo: 'texto-largo' }
  ],
  tablero: 'status',
  orden: { campo: 'created_at', asc: false }
};

// ------------------------------------------------------------------ soporte

/* Los avisos los escribe el sistema; aquí se leen y se marcan. Por eso casi
   todo es de solo lectura menos la fecha de lectura, que es lo único que le
   toca poner a quien los recibe. */
export const AVISOS: Esquema = {
  tabla: 'notifications',
  titulo: 'Avisos', singular: 'Aviso', principal: 'title',
  vacio: 'Aquí llegan los avisos del sistema: stock bajo, cobros vencidos, cambios de versión.',
  campos: [
    { key: 'title',      label: 'Aviso',   tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(200px,2fr)' },
    { key: 'kind',       label: 'Tipo',    tipo: 'texto', enTabla: true, ancho: '130px' },
    { key: 'created_at', label: 'Cuándo',  tipo: 'fecha', soloLectura: true, enTabla: true, ancho: '130px' },
    { key: 'read_at',    label: 'Leído',   tipo: 'fecha', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'body',       label: 'Detalle', tipo: 'texto-largo', enTabla: true, ancho: 'minmax(180px,1fr)' },
    { key: 'link',       label: 'Enlace',  tipo: 'texto' }
  ],
  orden: { campo: 'created_at', asc: false }
};


// ------------------------------------------------- capital intelligence

/* Las entidades de Capital Intelligence. Todo lo que es una lista con ficha
   —portafolios, proyectos, unidades, escenarios, hitos, ejecución, tipos de
   cambio— se declara aquí y el motor lo dibuja. Lo único que necesita pantalla
   propia es lo que el motor no sabe hacer: una matriz de meses, una comparación
   entre escenarios y el detalle de cómo se calculó una cifra.

   Los catálogos van como `Opcion[]` y no como enums de PostgreSQL a propósito:
   el encargo pide que los tipos y los estados sean CONFIGURABLES, y agregar
   "Proyecto personalizado" no puede exigir una migración. */

const ESTADO_PROYECTO_CI: Opcion[] = [
  { valor: 'borrador',             nombre: 'Borrador',              tono: 'neutro' },
  { valor: 'evaluacion',           nombre: 'Evaluación',            tono: 'neutro' },
  { valor: 'due_diligence',        nombre: 'Due diligence',         tono: 'aviso'  },
  { valor: 'preparando',           nombre: 'Preparando levantamiento', tono: 'aviso' },
  { valor: 'en_levantamiento',     nombre: 'En levantamiento',      tono: 'acento' },
  { valor: 'comprometido_parcial', nombre: 'Capital parcial',       tono: 'acento' },
  { valor: 'capital_cerrado',      nombre: 'Capital cerrado',       tono: 'ok'     },
  { valor: 'ejecucion',            nombre: 'Ejecución',             tono: 'acento' },
  { valor: 'validacion',           nombre: 'Validación',            tono: 'aviso'  },
  { valor: 'escalamiento',         nombre: 'Escalamiento',          tono: 'ok'     },
  { valor: 'pausado',              nombre: 'Pausado',               tono: 'malo'   },
  { valor: 'cerrado',              nombre: 'Cerrado',               tono: 'neutro' },
  { valor: 'rechazado',            nombre: 'Rechazado',             tono: 'malo'   }
];

const TIPO_PROYECTO: Opcion[] = [
  { valor: 'nueva_unidad',       nombre: 'Nueva unidad de negocio' },
  { valor: 'turnaround',         nombre: 'Turnaround' },
  { valor: 'expansion',          nombre: 'Expansión' },
  { valor: 'infraestructura',    nombre: 'Optimización de infraestructura' },
  { valor: 'franquicia',         nombre: 'Franquicia' },
  { valor: 'adquisicion',        nombre: 'Adquisición' },
  { valor: 'inmobiliario',       nombre: 'Desarrollo inmobiliario' },
  { valor: 'vehiculo_inversion', nombre: 'Vehículo de inversión' },
  { valor: 'personalizado',      nombre: 'Personalizado' }
];

const RIESGO: Opcion[] = [
  { valor: 'bajo',  nombre: 'Bajo',  tono: 'ok' },
  { valor: 'medio', nombre: 'Medio', tono: 'aviso' },
  { valor: 'alto',  nombre: 'Alto',  tono: 'malo' }
];

const TIPO_UNIDAD: Opcion[] = [
  { valor: 'restaurante',   nombre: 'Restaurante' },
  { valor: 'marca',         nombre: 'Marca' },
  { valor: 'membresia',     nombre: 'Membresía' },
  { valor: 'ghost_kitchen', nombre: 'Ghost kitchen' },
  { valor: 'eventos',       nombre: 'Eventos' },
  { valor: 'ecommerce',     nombre: 'E-commerce' },
  { valor: 'franquicia',    nombre: 'Franquicia' },
  { valor: 'canal',         nombre: 'Canal' },
  { valor: 'otro',          nombre: 'Otro' }
];

const ESTADO_UNIDAD: Opcion[] = [
  { valor: 'planificada', nombre: 'Planificada', tono: 'neutro' },
  { valor: 'en_montaje',  nombre: 'En montaje',  tono: 'aviso'  },
  { valor: 'operando',    nombre: 'Operando',    tono: 'ok'     },
  { valor: 'pausada',     nombre: 'Pausada',     tono: 'malo'   },
  { valor: 'cerrada',     nombre: 'Cerrada',     tono: 'neutro' }
];

const TIPO_ESCENARIO: Opcion[] = [
  { valor: 'conservador',   nombre: 'Conservador',   tono: 'aviso'  },
  { valor: 'base',          nombre: 'Base',          tono: 'acento' },
  { valor: 'optimista',     nombre: 'Optimista',     tono: 'ok'     },
  { valor: 'personalizado', nombre: 'Personalizado', tono: 'neutro' }
];

const ESTADO_HITO: Opcion[] = [
  { valor: 'pendiente', nombre: 'Pendiente', tono: 'neutro' },
  { valor: 'en_curso',  nombre: 'En curso',  tono: 'acento' },
  { valor: 'hecho',     nombre: 'Hecho',     tono: 'ok'     },
  { valor: 'atrasado',  nombre: 'Atrasado',  tono: 'malo'   }
];

/* Las cinco naturalezas de una línea. Son las mismas en el modelo y en la
   ejecución real —por eso se comparan— y su orden es el del estado de
   resultados: primero lo que entra, después lo que sale, al final lo que se
   invierte. */
export const NATURALEZA: Opcion[] = [
  { valor: 'ingreso',         nombre: 'Ingreso',          tono: 'ok'     },
  { valor: 'costo_directo',   nombre: 'Costo directo',    tono: 'aviso'  },
  { valor: 'gasto_operativo', nombre: 'Gasto operativo',  tono: 'aviso'  },
  { valor: 'depreciacion',    nombre: 'Depreciación',     tono: 'neutro' },
  { valor: 'inversion',       nombre: 'Inversión',        tono: 'acento' }
];


const AREA_REQUISITO: Opcion[] = [
  { valor: 'organizacion', nombre: 'La organización' },
  { valor: 'financiera',   nombre: 'Financiera' },
  { valor: 'comercial',    nombre: 'Comercial e inversión' },
  { valor: 'legal',        nombre: 'Legal' },
  { valor: 'tributaria',   nombre: 'Tributaria' },
  { valor: 'operacional',  nombre: 'Operacional' },
  { valor: 'laboral',      nombre: 'Laboral' },
  { valor: 'tecnologica',  nombre: 'Tecnológica' },
  { valor: 'pi',           nombre: 'Propiedad intelectual' },
  { valor: 'gobierno',     nombre: 'Gobierno corporativo' },
  { valor: 'riesgos',      nombre: 'Riesgos' }
];

const ESTADO_REQUISITO: Opcion[] = [
  { valor: 'pendiente',   nombre: 'Pendiente',   tono: 'neutro' },
  { valor: 'solicitado',  nombre: 'Solicitado',  tono: 'aviso'  },
  { valor: 'recibido',    nombre: 'Recibido',    tono: 'acento' },
  { valor: 'en_revision', nombre: 'En revisión', tono: 'acento' },
  { valor: 'observado',   nombre: 'Observado',   tono: 'malo'   },
  { valor: 'aprobado',    nombre: 'Aprobado',    tono: 'ok'     },
  { valor: 'no_aplica',   nombre: 'No aplica',   tono: 'neutro' }
];

const PROPOSITO_REQUISITO: Opcion[] = [
  { valor: 'puesta_en_marcha', nombre: 'Puesta en marcha' },
  { valor: 'due_diligence',    nombre: 'Due diligence' }
];

const PRIORIDAD_REQUISITO: Opcion[] = [
  { valor: 'alta',  nombre: 'Alta',  tono: 'malo'   },
  { valor: 'media', nombre: 'Media', tono: 'aviso'  },
  { valor: 'baja',  nombre: 'Baja',  tono: 'neutro' }
];

export const PORTAFOLIOS: Esquema = {
  tabla: 'ci_portfolios',
  titulo: 'Portafolios', singular: 'Portafolio', principal: 'name',
  nivelEscritura: 60,
  vacio: 'Un portafolio agrupa proyectos que se miran juntos: una vertical, un cliente, un vehículo. Conviene empezar por aquí.',
  campos: [
    { key: 'name',          label: 'Portafolio',  tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(200px,2fr)' },
    { key: 'code',          label: 'Código',      tipo: 'texto', enTabla: true, enLinea: true, ancho: '110px' },
    { key: 'manager',       label: 'Responsable', tipo: 'texto', enTabla: true, enLinea: true, ancho: '160px' },
    { key: 'base_currency', label: 'Moneda de consolidación', tipo: 'texto', enTabla: true, enLinea: true, ancho: '110px',
      porDefecto: 'USD', ayuda: 'En qué moneda se suman los proyectos de este portafolio.' },
    { key: 'status',        label: 'Estado',      tipo: 'seleccion', opciones: ESTADO, enTabla: true, enLinea: true,
      ancho: '120px', porDefecto: 'activo' },
    { key: 'description',   label: 'Descripción', tipo: 'texto-largo' },
    { key: 'notes',         label: 'Notas',       tipo: 'texto-largo' }
  ],
  orden: { campo: 'name', asc: true }
};

export const PROYECTOS_CAPITAL: Esquema = {
  tabla: 'ci_projects',
  titulo: 'Proyectos', singular: 'Proyecto', principal: 'name',
  nivelEscritura: 60,
  vacio: 'Un proyecto es una oportunidad de inversión o de transformación. Todo lo demás —escenarios, modelo, ronda— cuelga de él.',
  campos: [
    { key: 'name',   label: 'Proyecto', tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(200px,2fr)' },
    { key: 'code',   label: 'Código',   tipo: 'texto', soloLectura: true, enTabla: true, ancho: '130px',
      ayuda: 'Lo pone el sistema al crear el proyecto.' },
    { key: 'status', label: 'Estado',   tipo: 'seleccion', opciones: ESTADO_PROYECTO_CI,
      enTabla: true, enLinea: true, ancho: '170px', porDefecto: 'borrador' },
    { key: 'portfolio_id', label: 'Portafolio', tipo: 'relacion', enTabla: true, ancho: '160px',
      relacion: { tabla: 'ci_portfolios', etiqueta: 'name' } },
    { key: 'capital_required',  label: 'Capital requerido', tipo: 'moneda', enTabla: true, enLinea: true, ancho: '140px', porDefecto: 0 },
    { key: 'capital_committed', label: 'Capital captado',   tipo: 'moneda', enTabla: true, enLinea: true, ancho: '140px', porDefecto: 0 },
    { key: 'risk_level', label: 'Riesgo', tipo: 'seleccion', opciones: RIESGO,
      enTabla: true, enLinea: true, ancho: '110px', porDefecto: 'medio' },

    { key: 'project_type', grupo: 'Identidad', label: 'Tipo de proyecto', tipo: 'seleccion',
      opciones: TIPO_PROYECTO, porDefecto: 'nueva_unidad' },
    { key: 'industry',     grupo: 'Identidad', label: 'Industria',   tipo: 'texto' },
    { key: 'country',      grupo: 'Identidad', label: 'País',        tipo: 'texto', ayuda: 'Código de dos letras: CL, CO, CR, US.' },
    { key: 'city',         grupo: 'Identidad', label: 'Ciudad',      tipo: 'texto' },
    { key: 'owner',        grupo: 'Identidad', label: 'Responsable', tipo: 'texto' },
    { key: 'stage',        grupo: 'Identidad', label: 'Etapa',       tipo: 'texto' },

    { key: 'description',       grupo: 'La tesis', label: 'Descripción ejecutiva', tipo: 'texto-largo' },
    { key: 'investment_thesis', grupo: 'La tesis', label: 'Tesis de inversión',    tipo: 'texto-largo' },
    { key: 'problem',           grupo: 'La tesis', label: 'Problema u oportunidad', tipo: 'texto-largo' },
    { key: 'business_model',    grupo: 'La tesis', label: 'Modelo de negocio',     tipo: 'texto-largo' },
    { key: 'revenue_sources',   grupo: 'La tesis', label: 'Fuentes de ingreso',    tipo: 'texto' },

    { key: 'start_date',     grupo: 'Horizonte', label: 'Fecha de inicio', tipo: 'fecha' },
    { key: 'horizon_months', grupo: 'Horizonte', label: 'Horizonte (meses)', tipo: 'entero', porDefecto: 60 },
    { key: 'currency',       grupo: 'Horizonte', label: 'Moneda principal', tipo: 'texto', porDefecto: 'USD',
      ayuda: 'Los importes del proyecto se guardan en esta moneda y se convierten con los tipos de cambio de la organización.' },

    { key: 'equity_offered_pct', grupo: 'Valoración', label: 'Participación ofrecida (%)', tipo: 'numero',
      ayuda: 'Tiene que dar lo mismo que inversión ÷ post-money. Si no, el sistema avisa.' },
    { key: 'pre_money',   grupo: 'Valoración', label: 'Valoración pre-money',  tipo: 'moneda' },
    { key: 'post_money',  grupo: 'Valoración', label: 'Valoración post-money', tipo: 'moneda',
      ayuda: 'Pre-money + inversión.' },
    { key: 'instrument',  grupo: 'Valoración', label: 'Instrumento', tipo: 'texto',
      ayuda: 'Equity, SAFE, nota convertible, deuda…' },

    { key: 'notes', grupo: 'Notas y acuerdos', label: 'Notas y acuerdos', tipo: 'texto-largo' }
  ],
  tablero: 'status',
  orden: { campo: 'created_at', asc: false }
};

export const UNIDADES_NEGOCIO: Esquema = {
  tabla: 'ci_business_units',
  titulo: 'Unidades de negocio', singular: 'Unidad', femenino: true, principal: 'name',
  nivelEscritura: 60,
  vacio: 'Marcas, locales, canales o conceptos dentro de un proyecto. Es lo que permite separar el ingreso de cada uno sobre una infraestructura compartida.',
  campos: [
    { key: 'name',       label: 'Unidad',   tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(180px,2fr)' },
    { key: 'project_id', label: 'Proyecto', tipo: 'relacion', requerido: true, enTabla: true, ancho: 'minmax(160px,1fr)',
      relacion: { tabla: 'ci_projects', etiqueta: 'name' } },
    { key: 'unit_type',  label: 'Tipo',     tipo: 'seleccion', opciones: TIPO_UNIDAD,
      enTabla: true, enLinea: true, ancho: '150px', porDefecto: 'marca' },
    { key: 'status',     label: 'Estado',   tipo: 'seleccion', opciones: ESTADO_UNIDAD,
      enTabla: true, enLinea: true, ancho: '140px', porDefecto: 'planificada' },
    { key: 'launch_date', label: 'Lanzamiento', tipo: 'fecha', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'capacity',      grupo: 'Capacidad', label: 'Capacidad instalada', tipo: 'numero',
      ayuda: 'Metros, puestos, horas. Es lo que hace posible «ingreso por m²» sin que el sistema sepa de tu rubro.' },
    { key: 'capacity_unit', grupo: 'Capacidad', label: 'Unidad de la capacidad', tipo: 'texto' },
    { key: 'notes', label: 'Notas', tipo: 'texto-largo' }
  ],
  tablero: 'unit_type',
  orden: { campo: 'name', asc: true }
};

export const ESCENARIOS: Esquema = {
  tabla: 'ci_scenarios',
  titulo: 'Escenarios', singular: 'Escenario', principal: 'name',
  nivelEscritura: 60,
  vacio: 'Un escenario es un juego de supuestos. Sin al menos uno no hay modelo financiero que construir.',
  campos: [
    { key: 'name',       label: 'Escenario', tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(180px,2fr)' },
    { key: 'project_id', label: 'Proyecto',  tipo: 'relacion', requerido: true, enTabla: true, ancho: 'minmax(160px,1fr)',
      relacion: { tabla: 'ci_projects', etiqueta: 'name' } },
    { key: 'kind',       label: 'Tipo',      tipo: 'seleccion', opciones: TIPO_ESCENARIO,
      enTabla: true, enLinea: true, ancho: '150px', porDefecto: 'base' },
    { key: 'is_default', label: 'Por defecto', tipo: 'booleano', enTabla: true, enLinea: true, ancho: '110px',
      ayuda: 'El que se usa cuando nadie elige otro.' },
    { key: 'notes',      label: 'Supuestos en palabras', tipo: 'texto-largo',
      ayuda: 'Los supuestos numéricos se editan en la pestaña Modelo; esto es para lo que no cabe en un número.' }
  ],
  tablero: 'kind',
  orden: { campo: 'name', asc: true }
};

export const HITOS: Esquema = {
  tabla: 'ci_milestones',
  titulo: 'Hitos', singular: 'Hito', principal: 'name',
  nivelEscritura: 60,
  vacio: 'Los hitos son lo que condiciona un tramo de capital o marca un avance. Sin fecha y responsable, no existen.',
  campos: [
    { key: 'name',       label: 'Hito',     tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(200px,2fr)' },
    { key: 'project_id', label: 'Proyecto', tipo: 'relacion', requerido: true, enTabla: true, ancho: 'minmax(160px,1fr)',
      relacion: { tabla: 'ci_projects', etiqueta: 'name' } },
    { key: 'due_date',   label: 'Fecha',    tipo: 'fecha', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'status',     label: 'Estado',   tipo: 'seleccion', opciones: ESTADO_HITO,
      enTabla: true, enLinea: true, ancho: '130px', porDefecto: 'pendiente' },
    { key: 'owner',      label: 'Responsable', tipo: 'texto', enTabla: true, enLinea: true, ancho: '150px' },
    { key: 'amount_conditioned', label: 'Capital que libera', tipo: 'moneda', enTabla: true, enLinea: true, ancho: '150px' },
    { key: 'done_date',   grupo: 'Cierre', label: 'Cumplido el', tipo: 'fecha' },
    { key: 'sort',        grupo: 'Cierre', label: 'Orden',       tipo: 'entero', porDefecto: 0 },
    { key: 'description', label: 'Descripción', tipo: 'texto-largo' }
  ],
  tablero: 'status',
  orden: { campo: 'due_date', asc: true }
};

/* La ejecución real. Vive separada de lo proyectado a propósito: mezclarlas en
   la misma tabla es exactamente el error que este módulo existe para evitar.
   Y guarda la moneda original CON su tasa y su fecha, porque cambiar la tasa
   de hoy no puede mover una cifra de marzo. */
export const EJECUCION: Esquema = {
  tabla: 'ci_actuals',
  titulo: 'Ejecución real', singular: 'Movimiento', principal: 'concept',
  nivelEscritura: 60,
  vacio: 'Aquí se carga lo que de verdad pasó, mes a mes. Es lo que se compara contra el presupuesto.',
  campos: [
    { key: 'concept',    label: 'Concepto', tipo: 'texto', enTabla: true, ancho: 'minmax(180px,2fr)' },
    { key: 'project_id', label: 'Proyecto', tipo: 'relacion', requerido: true, enTabla: true, ancho: 'minmax(150px,1fr)',
      relacion: { tabla: 'ci_projects', etiqueta: 'name' } },
    { key: 'period',   label: 'Mes',   tipo: 'fecha', requerido: true, enTabla: true, enLinea: true, ancho: '130px',
      ayuda: 'Cualquier día del mes: se guarda como el día 1.' },
    { key: 'kind',     label: 'Naturaleza', tipo: 'seleccion', opciones: NATURALEZA, requerido: true,
      enTabla: true, enLinea: true, ancho: '150px', porDefecto: 'gasto_operativo' },
    { key: 'category', label: 'Categoría', tipo: 'texto', enTabla: true, enLinea: true, ancho: '130px', porDefecto: 'otros',
      ayuda: 'Tiene que coincidir con la categoría de la línea del modelo para que se comparen.' },
    { key: 'actual_amount',    label: 'Real',        tipo: 'moneda', enTabla: true, enLinea: true, ancho: '120px', porDefecto: 0 },
    { key: 'committed_amount', label: 'Comprometido', tipo: 'moneda', enTabla: true, enLinea: true, ancho: '130px', porDefecto: 0 },
    { key: 'paid_amount',      label: 'Pagado',      tipo: 'moneda', enTabla: true, enLinea: true, ancho: '120px', porDefecto: 0 },

    { key: 'business_unit_id', grupo: 'A qué pertenece', label: 'Unidad de negocio', tipo: 'relacion',
      relacion: { tabla: 'ci_business_units', etiqueta: 'name' } },
    { key: 'milestone_id',     grupo: 'A qué pertenece', label: 'Hito relacionado', tipo: 'relacion',
      relacion: { tabla: 'ci_milestones', etiqueta: 'name' } },

    { key: 'currency', grupo: 'Moneda', label: 'Moneda original', tipo: 'texto', porDefecto: 'USD' },
    { key: 'fx_rate',  grupo: 'Moneda', label: 'Tipo de cambio',  tipo: 'numero',
      ayuda: 'Obligatorio si la moneda no es la del modelo. Sin él, la cifra no se puede consolidar.' },
    { key: 'fx_date',  grupo: 'Moneda', label: 'Fecha del tipo de cambio', tipo: 'fecha' },
    { key: 'base_amount', grupo: 'Moneda', label: 'Valor convertido', tipo: 'moneda',
      ayuda: 'Se guarda, no se recalcula: cambiar la tasa de hoy no debe mover una cifra de marzo.' },

    { key: 'supplier',     grupo: 'Respaldo', label: 'Proveedor', tipo: 'texto' },
    { key: 'evidence_url', grupo: 'Respaldo', label: 'Evidencia (enlace)', tipo: 'texto' },
    { key: 'note',         grupo: 'Respaldo', label: 'Nota', tipo: 'texto-largo' }
  ],
  tablero: 'kind',
  orden: { campo: 'period', asc: false }
};

export const TIPOS_DE_CAMBIO: Esquema = {
  tabla: 'ci_exchange_rates',
  titulo: 'Tipos de cambio', singular: 'Tipo de cambio', principal: 'base_currency',
  nivelEscritura: 60,
  vacio: 'Sin tipos de cambio, los proyectos en otra moneda no entran en el consolidado. Una fila por par y fecha.',
  campos: [
    { key: 'base_currency',  label: 'De',    tipo: 'texto', requerido: true, enTabla: true, ancho: '100px' },
    { key: 'quote_currency', label: 'A',     tipo: 'texto', requerido: true, enTabla: true, ancho: '100px' },
    { key: 'rate',           label: 'Tasa',  tipo: 'numero', requerido: true, enTabla: true, enLinea: true, ancho: '150px',
      ayuda: '1 unidad de la moneda «De» equivale a esta cantidad de la moneda «A».' },
    { key: 'rate_date',      label: 'Fecha', tipo: 'fecha', requerido: true, enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'source',         label: 'Fuente', tipo: 'texto', enTabla: true, enLinea: true, ancho: 'minmax(150px,1fr)' }
  ],
  orden: { campo: 'rate_date', asc: false }
};


/* Los requisitos también pasan por el motor, aunque la pestaña de
   Levantamiento tenga su propia vista. No es duplicar: la vista sirve para
   TRABAJAR la lista —marcar estado, pegar el enlace— y el motor para
   administrarla: agregar un requisito que no estaba, cambiarle el área,
   ponerle campos propios. Son dos usos distintos de la misma tabla. */
export const REQUISITOS: Esquema = {
  tabla: 'ci_requirements',
  titulo: 'Requisitos', singular: 'Requisito', principal: 'name',
  nivelEscritura: 60,
  vacio: 'Lo que hay que reunir para migrar y arrancar. La lista estándar se carga desde la pestaña Levantamiento.',
  campos: [
    { key: 'name',     label: 'Requisito', tipo: 'texto', requerido: true, enTabla: true, ancho: 'minmax(220px,2fr)' },
    { key: 'area',     label: 'Área',      tipo: 'seleccion', opciones: AREA_REQUISITO,
      enTabla: true, enLinea: true, ancho: '150px', porDefecto: 'financiera' },
    { key: 'status',   label: 'Estado',    tipo: 'seleccion', opciones: ESTADO_REQUISITO,
      enTabla: true, enLinea: true, ancho: '140px', porDefecto: 'pendiente' },
    { key: 'required', label: 'Obligatorio', tipo: 'booleano', enTabla: true, enLinea: true, ancho: '110px' },
    { key: 'owner',    label: 'Responsable', tipo: 'texto', enTabla: true, enLinea: true, ancho: '150px' },
    { key: 'due_date', label: 'Fecha límite', tipo: 'fecha', enTabla: true, enLinea: true, ancho: '130px' },
    { key: 'project_id', label: 'Proyecto', tipo: 'relacion', enTabla: true, ancho: '160px',
      relacion: { tabla: 'ci_projects', etiqueta: 'name' },
      ayuda: 'Vacío = requisito de la organización entera.' },
    { key: 'purpose',  grupo: 'Clasificación', label: 'Propósito', tipo: 'seleccion',
      opciones: PROPOSITO_REQUISITO, porDefecto: 'puesta_en_marcha' },
    { key: 'priority', grupo: 'Clasificación', label: 'Prioridad', tipo: 'seleccion',
      opciones: PRIORIDAD_REQUISITO, porDefecto: 'media' },
    { key: 'format',   grupo: 'Clasificación', label: 'Formato esperado', tipo: 'texto',
      ayuda: 'XLSX, PDF, planilla, nota…' },
    { key: 'why',      grupo: 'Para qué sirve', label: 'Para qué sirve', tipo: 'texto-largo' },
    { key: 'description', grupo: 'Para qué sirve', label: 'Descripción', tipo: 'texto-largo' },
    { key: 'link',     grupo: 'Respaldo', label: 'Enlace al archivo', tipo: 'texto' },
    { key: 'comment',  grupo: 'Respaldo', label: 'Comentario', tipo: 'texto-largo' },
    { key: 'sort',     grupo: 'Respaldo', label: 'Orden', tipo: 'entero', porDefecto: 0 }
  ],
  tablero: 'status',
  orden: { campo: 'sort', asc: true }
};

/** Todo lo que el motor sabe dibujar, por módulo de la plataforma. */
export const ESQUEMAS_POR_MODULO: Record<string, Esquema[]> = {
  crm:        [CLIENTES, DIRECCIONES, LISTAS_PRECIO],
  commerce:   [PEDIDOS, PRODUCTOS, CATEGORIAS],
  operations: [LOTES, MOVIMIENTOS, COMPRAS, PROVEEDORES, BODEGAS, MERMAS],
  delivery:   [ENTREGAS, RUTAS],
  finance:    [PAGOS, POR_COBRAR, POR_PAGAR],
  food:       [PROCESOS, ESPECIES],
  agenda:     [COMPROMISOS, TAREAS],
  creator:    [PROYECTOS, COTIZACIONES],
  support:    [AVISOS],
  capital:    [PROYECTOS_CAPITAL, PORTAFOLIOS, UNIDADES_NEGOCIO, ESCENARIOS,
               HITOS, EJECUCION, REQUISITOS, TIPOS_DE_CAMBIO]
};
