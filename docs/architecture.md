# Arquitectura

## Qué es esto

Una **sola plataforma** que aloja **muchas empresas**. No hay una aplicación por cliente,
ni una base de datos por cliente. Hay un código y una base, y cada empresa es una fila en
`companies` con su configuración, sus módulos y sus datos.

```
GITHUB · un repositorio          github.com/pew1sark/ANIMA
        │
   ANIMA Plataforma
        │
   SUPABASE · un proyecto        jwxeowowuxmijuexdrua
        │
   product_lines · DOS sub-plataformas
        │
  ┌─────┴──────────────┐
ANIMA STUDIO      ANIMA COMPANY
creadores         empresas
        │                │
   companies (el tenant) │
        │                │
     ANIMA           Bilagay
  core · creator   core · crm
  crm · finance    commerce
  agenda           operations
                   delivery · finance
```

Una organización pertenece a **una** línea. Un mismo usuario puede pertenecer a
varias organizaciones, en líneas distintas: es el caso de referencia —artista en
STUDIO, operación de murales en COMPANY— y funciona sin nada especial, porque la
línea es del tenant, no de la persona.

## Organización del repositorio

```
/                       sitio ANIMA actual (estático) — sigue publicándose igual
/platform               la plataforma SaaS
  /src
    /config             lectura de variables de entorno, un solo punto
    /core
      /auth             sesión
      /tenant           empresa activa y módulos encendidos
      /modules          registro de módulos
      /permissions      ayudas de UI (la autoridad real está en RLS)
    /modules            módulos verticales (commerce, crm, finance, …)
    /components         UI compartida
    /services           acceso a datos por dominio
    /lib                cliente de Supabase y utilidades
    /hooks              hooks compartidos
    /types              tipos del núcleo
/supabase/migrations    migraciones versionadas y numeradas
/docs                   esta documentación
```

## Cadena de identidad

```
auth.users → profiles → company_members → roles → permissions
```

Un usuario **puede pertenecer a varias empresas**, con un rol distinto en cada una.
La empresa activa se elige en la interfaz y se guarda en `localStorage`; no otorga
ningún permiso por sí sola: solo decide qué se pide.

## Separación de autoridad

| | Alcance | Dónde vive |
|---|---|---|
| **Super Admin** | toda la plataforma | tabla `platform_admins` |
| **Owner / Admin** | una empresa | `company_members.role_id` |

Ser dueño de una empresa **nunca** escala a administrar la plataforma. Son dos tablas
distintas a propósito.

## Estado actual · 31 de agosto de 2026

- ✅ Núcleo multiempresa con aislamiento verificado, 13/13 (migración 0040)
- ✅ **Dos líneas de producto: STUDIO y COMPANY** (migración 0067). INDUSTRY se
  fundió en COMPANY: era una tercera línea con un solo plan y una sola empresa.
- ✅ **Tres organizaciones, un solo usuario** (migraciones 0069-0070):

  | Organización | Línea | Plan | Encendidos |
  |---|---|---|---:|
  | ANIMA | STUDIO | Clan | 6 |
  | PEW1 · Murales | COMPANY | Pro | 5 |
  | Pescadería Bilagay | COMPANY | Business | 6 |

  Las tres con SARK como Propietario. Es el caso que el prompt pedía validar:
  el mismo usuario entra, elige, y cada espacio se comporta según su línea.
- ✅ Planes: 3 tramos de Studio (Solo · Taller · Clan) y 4 de Company
  (Starter · Pro · Business · Enterprise). **Los precios de Studio están en cero
  a propósito**: falta definirlos.
- ✅ `company_id` sobre las tablas de trabajo de ANIMA (migración 0043)
- ✅ Motor operativo de Bilagay portado: 21 tablas, 14 vistas, 52 de 108 funciones
- ✅ Extensibilidad por tenant: features, campos personalizados, workflows (0061-0065)
- ✅ Las 67 migraciones versionadas en el repo, verificadas con md5 contra la base
- ⏳ Falta portar de JLIZ: cobranza, conector Bsale y correo saliente
  (20 tablas, 56 funciones, 12 vistas, 9 Edge Functions, 2 cron)
- ✅ **`tenant_type` operator/advisor** (migración 0068). Con esto el núcleo de la
  Fase 2 queda completo. La capa de datos del asesor es la Fase 6.
- ⏳ Consola de plataforma (todos los clientes, suscripciones, consumo)
- 🔴 Deuda de seguridad: 47 funciones heredadas ejecutables por `anon`

---

## El portal de entrada

**Una sola puerta para todos los clientes.** La misma URL, el mismo código, y
adentro cada uno ve su propia plataforma.

```
                    /  (portal común)
                          │
                      ¿hay sesión?
                    no ──┴── sí
                    │         │
                  Entrar   ¿cuántas organizaciones?
                            │        │        │
                            0        1       2+
                            │        │        │
                     "sin acceso"  directo  elegir
                                      └────┬───┘
                                           │
                                    su espacio de trabajo
```

Tres decisiones detrás:

**Con una sola organización se entra directo.** Nadie debería elegir cuando no
hay elección. Con varias, aparece el selector.

**La navegación no está escrita a mano.** El menú lateral se arma con los módulos
que el plan de esa organización permite (`mi_espacio`). Dos empresas ven menús
distintos ejecutando el mismo código; no hay un `if` por cliente en ninguna parte.

**Configuración solo para quien administra.** La pestaña aparece con nivel 80 o
superior. Un empleado entra al mismo portal y no la ve.

### Separación entre portal y consola

| | Quién entra | Qué ve |
|---|---|---|
| **Portal** (`/`) | cualquier cliente | su organización: KPIs, sus módulos, lo hecho a medida para él |
| **Super Admin** | `platform_admins` | distintivo en la cabecera; la consola de plataforma es lo que sigue |

Hoy el Super Admin entra por el mismo portal y ve sus propias organizaciones,
con un distintivo. La consola de plataforma —listado de todos los clientes,
suscripciones, consumo— es una pantalla aparte todavía por construir.

### Un usuario, varias organizaciones

`Nicolás` pertenece a **ANIMA** (línea STUDIO) y a **Pescadería Bilagay**
(línea INDUSTRY). Al entrar elige, y cada espacio se comporta según su línea de
producto, su plan y sus módulos. Es el caso que tu arquitectura pedía soportar.
