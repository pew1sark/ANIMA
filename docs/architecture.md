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
