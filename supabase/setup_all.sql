-- Full setup for a NEW Supabase project
-- Dashboard → SQL Editor → New query → paste this entire file → Run

-- ========== study_results (final submission upsert) ==========
create table if not exists public.study_results (
  client_submission_id text primary key,
  study_group text not null check (study_group in ('control', 'treatment')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_results_created_at_idx on public.study_results (created_at desc);

alter table public.study_results enable row level security;

drop policy if exists "study_results_anon_insert" on public.study_results;
create policy "study_results_anon_insert"
  on public.study_results for insert
  to anon
  with check (true);

drop policy if exists "study_results_anon_update" on public.study_results;
create policy "study_results_anon_update"
  on public.study_results for update
  to anon
  using (true)
  with check (true);

-- ========== study_chat_turns (each ChatGPT turn) ==========
create table if not exists public.study_chat_turns (
  id uuid primary key default gen_random_uuid(),
  client_submission_id text not null,
  study_group text not null check (study_group in ('control', 'treatment')),
  turn_index int not null,
  session_profile jsonb not null,
  user_message text not null,
  full_prompt text not null,
  assistant_response text not null,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists study_chat_turns_session_idx
  on public.study_chat_turns (client_submission_id, turn_index);

create index if not exists study_chat_turns_created_idx
  on public.study_chat_turns (created_at desc);

alter table public.study_chat_turns enable row level security;

drop policy if exists "study_chat_turns_anon_insert" on public.study_chat_turns;
create policy "study_chat_turns_anon_insert"
  on public.study_chat_turns for insert
  to anon
  with check (true);
