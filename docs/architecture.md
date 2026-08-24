# Arquitectura

## Qué es esto

Una **sola plataforma** que aloja **muchas empresas**. No hay una aplicación por cliente,
ni una base de datos por cliente. Hay un código y una base, y cada empresa es una fila en
`companies` con su configuración, sus módulos y sus datos.

```
GITHUB · un repositorio
        │
   ANIMA Plataforma
        │
   SUPABASE · un proyecto
        │
   companies (el tenant)
        │
  ┌─────┴─────┬───────────┐
ANIMA      Bilagay    (siguientes)
creator    commerce
crm        crm
finance    operations
agenda     delivery
```

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

## Estado actual

- ✅ Núcleo multiempresa creado y con aislamiento verificado (migración 0040)
- ✅ Empresas iniciales: ANIMA y Pescadería Bilagay (migración 0041)
- ⏳ Retrofit de `company_id` sobre las tablas heredadas de ANIMA
- ⏳ Migración de los datos de JLIZ BUSINESS a esta base
- ⏳ Módulos verticales

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
