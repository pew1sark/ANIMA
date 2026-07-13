-- ===========================================================
-- ANIMA TSC — Migración 0039: Registro histórico de ventas FLOW
--
-- Liquidaciones de Flow.cl (links de pago de murales y obras)
-- importadas como registro histórico del Fundador (2021–2026).
-- Solo el Fundador (sarkgraff@gmail.com) puede leer/escribir.
--
-- pagos            : cantidad de pagos incluidos en la liquidación
-- monto_depositado : CLP depositado en la cuenta
-- monto_facturado  : comisión facturada por Flow (CLP)
-- detalle          : anotación manual (qué mural/obra fue)
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO → Run.  (Idempotente)
-- ===========================================================

create table if not exists public.flow_liquidaciones (
  id                bigint primary key,          -- N° de liquidación en Flow
  fecha_liquidacion date   not null,
  pagos             int    not null default 0,
  monto_depositado  bigint not null,
  monto_facturado   bigint not null default 0,
  moneda            text   not null default 'CLP',
  fecha_deposito    timestamp,                   -- hora local reportada por Flow
  detalle           text,
  created_at        timestamptz not null default now()
);

alter table public.flow_liquidaciones enable row level security;

drop policy if exists "flow_liq_founder" on public.flow_liquidaciones;
create policy "flow_liq_founder" on public.flow_liquidaciones
  for all
  using      (lower(coalesce(auth.jwt() ->> 'email','')) = 'sarkgraff@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email','')) = 'sarkgraff@gmail.com');

revoke all on public.flow_liquidaciones from public, anon;
grant select, insert, update, delete on public.flow_liquidaciones to authenticated;

-- ---- Datos históricos (export Flow, jul-2026) ----
insert into public.flow_liquidaciones
  (id, fecha_liquidacion, pagos, monto_depositado, monto_facturado, moneda, fecha_deposito) values
  (4936308, '2026-07-01',  0,    226,     0, 'CLP', '2026-07-01 10:16:00'),
  (4919318, '2026-06-24',  1,  96204,  3190, 'CLP', '2026-06-24 09:59:00'),
  (4868342, '2026-06-04',  1,  86584,  2871, 'CLP', '2026-06-04 10:39:00'),
  (4858874, '2026-06-01',  0,    191,     0, 'CLP', '2026-06-01 10:11:00'),
  (4850978, '2026-05-29',  1, 153926,  5104, 'CLP', '2026-05-29 07:29:00'),
  (4420662, '2025-12-01',  0,    405,     0, 'CLP', '2025-12-01 10:42:00'),
  (4364732, '2025-11-07',  6, 156486, 11356, 'CLP', '2025-11-07 10:12:00'),
  (3941568, '2025-05-02',  0,   2872,     0, 'CLP', '2025-05-02 09:51:00'),
  (3887791, '2025-04-08',  1, 896139, 29715, 'CLP', '2025-04-08 10:31:00'),
  (3880680, '2025-04-04', 12, 105463, 12216, 'CLP', '2025-04-04 09:48:00'),
  (3873886, '2025-04-02',  1, 149115,  4945, 'CLP', '2025-04-02 09:52:00'),
  (3872810, '2025-04-01',  0,   2189,     0, 'CLP', '2025-04-01 10:09:00'),
  (3866091, '2025-03-31',  6, 662766, 48096, 'CLP', '2025-03-31 10:16:00'),
  (3823290, '2025-03-14',  6, 184102, 13360, 'CLP', '2025-03-14 09:58:00'),
  (3211884, '2024-06-03',  0,    946,     0, 'CLP', '2024-06-03 10:06:00'),
  (3182317, '2024-05-20',  3, 372997, 20591, 'CLP', '2024-05-20 09:44:00'),
  (3147258, '2024-05-02',  0,    714,     0, 'CLP', '2024-05-02 10:07:00'),
  (3085060, '2024-04-03',  3, 281507, 15540, 'CLP', '2024-04-03 09:57:00'),
  (2708754, '2023-10-03',  1,  48102,  1595, 'CLP', '2023-10-03 11:16:00'),
  (2707751, '2023-10-02',  0,   1535,     0, 'CLP', '2023-10-02 10:10:00'),
  (2695814, '2023-09-27',  1, 620515, 20576, 'CLP', '2023-09-27 10:39:00'),
  (2587238, '2023-08-01',  0,   1774,     0, 'CLP', '2023-08-01 10:20:00'),
  (2570980, '2023-07-25',  1, 716718, 23766, 'CLP', '2023-07-25 10:30:00'),
  (2133445, '2022-12-01',  0,   1547,     0, 'CLP', '2022-12-01 09:57:00'),
  (2116522, '2022-11-24',  1, 625325, 20735, 'CLP', '2022-11-24 09:52:00'),
  (2018450, '2022-10-03',  0,   1032,     0, 'CLP', '2022-10-03 11:04:00'),
  (1983242, '2022-09-13',  1, 416946, 13825, 'CLP', '2022-09-13 10:47:00'),
  (1781468, '2022-06-01',  0,   2463,     0, 'CLP', '2022-06-01 10:58:00'),
  (1741858, '2022-05-12',  1, 995710, 33017, 'CLP', '2022-05-12 09:47:00'),
  (1663026, '2022-04-01',  0,    125,     0, 'CLP', '2022-04-01 00:14:00'),
  (1620685, '2022-03-11',  1, 101013,  3350, 'CLP', '2022-03-11 09:38:00'),
  (1365119, '2021-11-02',  0,    915,     0, 'CLP', '2021-11-02 13:43:00'),
  (1335734, '2021-10-18',  1, 370000, 12269, 'CLP', '2021-10-18 10:56:00'),
  (1245300, '2021-09-01',  0,    915,     0, 'CLP', '2021-09-01 09:53:00'),
  (1180778, '2021-08-02',  1, 370000, 12269, 'CLP', '2021-08-02 11:38:00'),
  (1065529, '2021-06-01',  0,   1236,     0, 'CLP', '2021-06-01 11:02:00'),
  (1060225, '2021-05-31',  1, 500000, 16579, 'CLP', '2021-05-31 10:50:00'),
  ( 948871, '2021-04-01',  0,   2233,     0, 'CLP', '2021-04-01 10:11:00'),
  ( 927474, '2021-03-22',  1, 450001, 14921, 'CLP', '2021-03-22 10:05:00'),
  ( 905156, '2021-03-08',  1, 452158, 14993, 'CLP', '2021-03-08 11:11:00')
on conflict (id) do nothing;
