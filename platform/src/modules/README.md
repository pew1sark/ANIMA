# Módulos

Cada carpeta de aquí es un módulo vertical de la plataforma:

```
/modules
  /commerce    productos · carrito · pedidos · checkout
  /crm         clientes · leads · actividades
  /finance     ingresos · egresos · cuentas por cobrar
  /operations  inventario · compras · movimientos
  /delivery    repartidores · rutas · entregas
  /food        cocina · estados de pedido
  /creator     portafolio · cotizaciones · proyectos (ANIMA)
  /support     tickets · centro de ayuda
  /ai          asistente y automatizaciones
```

Reglas:

1. Un módulo **nunca** consulta la sesión ni la empresa por su cuenta:
   las recibe de `useTenant()`.
2. Toda tabla de un módulo lleva `company_id` y su política RLS.
3. Un módulo no se activa desde el código: se enciende en `company_modules`.
4. Lo que sirve a dos módulos sube a `/core`, `/services` o `/components`.
