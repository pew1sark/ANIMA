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
  support:    [AVISOS]
};
