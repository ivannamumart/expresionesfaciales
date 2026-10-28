-- ──────────────────────────────────────────────────────────
-- Sin Remedio · esquema de datos para Supabase
-- Investigación en humanidades digitales
-- Autoría: Ivanna Muñoz Martínez · Universidad de los Andes
--
-- Instrucciones:
--   1. Crear el proyecto en https://supabase.com
--   2. Ir a SQL Editor → New query
--   3. Pegar este bloque completo y pulsar Run
--   4. Crear la cuenta de la investigadora en Authentication → Users
--   5. Copiar Project URL y anon key en js/config.js
-- ──────────────────────────────────────────────────────────

-- Sesiones · una por participante por visita
create table if not exists public.sessions (
  session_id       text primary key,
  started_at       timestamptz not null default now(),
  device_type      text,
  viewport_width   int,
  viewport_height  int,
  demo_mode        boolean default false,
  user_agent       text
);

-- Reacciones · una por fragmento leído
create table if not exists public.reactions (
  id              bigserial primary key,
  session_id      text references public.sessions(session_id) on delete cascade,
  fragment_id     text not null,
  fragment_order  int,
  register        text,
  dwell_ms        int,
  blink_count     int,
  samples_count   int,
  peaks           jsonb,
  means           jsonb,
  demo_mode       boolean,
  recorded_at     timestamptz not null default now()
);

-- Índices
create index if not exists reactions_session_idx on public.reactions(session_id);
create index if not exists reactions_fragment_idx on public.reactions(fragment_id);
create index if not exists sessions_started_idx on public.sessions(started_at desc);

-- ──────────────────────────────────────────────────────────
-- Row Level Security
-- Anónimos: solo INSERT. Investigadora autenticada: SELECT.
-- Nadie puede modificar ni borrar desde el frontend.
-- ──────────────────────────────────────────────────────────

alter table public.sessions enable row level security;
alter table public.reactions enable row level security;

-- Permitir inserción anónima
create policy "sessions_insert_anon"
  on public.sessions for insert
  to anon, authenticated
  with check (true);

create policy "reactions_insert_anon"
  on public.reactions for insert
  to anon, authenticated
  with check (true);

-- Permitir lectura solo a usuarios autenticados
create policy "sessions_read_auth"
  on public.sessions for select
  to authenticated
  using (true);

create policy "reactions_read_auth"
  on public.reactions for select
  to authenticated
  using (true);
