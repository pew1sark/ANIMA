# Registro de decisiones

Breve: qué se decidió, por qué y dónde está el detalle. La más nueva arriba.

| Fecha | Decisión | Por qué | Detalle |
|---|---|---|---|
| 2026-10-05 | COMPANY: Supabase Pro, GitHub Pages con GitHub Pro desde repo privado, dominio `company.animatsc.com`; sin Vercel | Decisión de SARK | [`SEPARACION.md`](SEPARACION.md) |
| 2026-10-05 | STUDIO y COMPANY se separan: repo privado y Supabase propio para COMPANY; COMPANY sin puerta a STUDIO; lo compartido se copia | «Nunca mezclar ambas plataformas» (SARK). Andrés trabaja solo en COMPANY | [`SEPARACION.md`](SEPARACION.md) |
| 2026-10-05 | Andrés es socio y desarrollador; credenciales de desarrollo aparte de su cuenta de cliente | Su usuario en `asesoria-andres` es de producción | [`ONBOARDING_ANDRES.md`](ONBOARDING_ANDRES.md) |
| 2026-10-05 | Arquitectura por módulos aislados en `platform/src`, comprobada por `npm run fronteras` | Que Casa Click (inmobiliaria) evolucione sin tocar el resto | [`ARQUITECTURA.md`](ARQUITECTURA.md) |
| 2026-10-05 | El repo reconstruye la base desde cero; CI lo comprueba con seed y aislamiento | Sin eso no había staging fiel | [`MIGRACIONES.md`](MIGRACIONES.md) |
| 2026-10-05 | `main` = producción, `develop` = integración; PR + CI + CODEOWNERS | Dos personas, y cada push a `main` publica | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| 2026-10-05 | Datos reales de clientes nunca en el repo (público) | 0111-0113 quedan fuera | [`MIGRACIONES.md`](MIGRACIONES.md) |
