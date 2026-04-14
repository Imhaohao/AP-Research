-- Run in Supabase → SQL Editor (after study_results.sql)
-- Logs each OpenAI chat turn: session profile snapshot, user line, full prompt to API, assistant reply.

create table if not exists public.study_chat_turns (
  id uuid primary key default gen_random_uuid(),
  client_submission_id text not null,
  participant_login_id text,
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

create index if not exists study_chat_turns_participant_login_id_idx
  on public.study_chat_turns (participant_login_id);

create index if not exists study_chat_turns_created_idx
  on public.study_chat_turns (created_at desc);

alter table public.study_chat_turns enable row level security;

drop policy if exists "study_chat_turns_anon_insert" on public.study_chat_turns;
create policy "study_chat_turns_anon_insert"
  on public.study_chat_turns for insert
  to anon
  with check (true);
