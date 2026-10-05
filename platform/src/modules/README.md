# Módulos

Cada carpeta es un módulo vertical: sus pantallas y su servicio de datos.

```
/modules
  /capital        Capital Intelligence
  /inmobiliaria   Real Estate Intelligence + Brokerage (lo que usa Casa Click)
```

Los demás módulos del registro (`crm`, `commerce`, `operations`, `delivery`,
`finance`, `food`, `agenda`, `creator`) todavía no tienen carpeta: los dibuja
el motor declarativo (`core/datos`) a partir de su esquema.

Reglas (ver [`docs/ARQUITECTURA.md`](../../../docs/ARQUITECTURA.md)):

1. **Un módulo nunca importa de otro módulo.** Lo común va a `ui/` o `core/`.
   `npm run fronteras` lo comprueba.
2. Un módulo **nunca** consulta la sesión ni la empresa por su cuenta: las
   recibe de `useTenant()`.
3. Toda tabla de un módulo lleva `company_id` y su política RLS.
4. Un módulo no se activa desde el código: se enciende en `company_modules`.
