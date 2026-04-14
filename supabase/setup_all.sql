-- Full setup for a NEW Supabase project
-- Dashboard → SQL Editor → New query → paste this entire file → Run

-- ========== study_results (final submission upsert) ==========
create table if not exists public.study_results (
  client_submission_id text primary key,
  study_group text not null check (
    study_group in (
      'control',
      'treatment',
      'unrestricted_ai',
      'guided_ai',
      'prompt_bank_ai'
    )
  ),
  treatment_arm smallint,
  participant_sequence bigint,
  participant_email text,
  participant_login_id text,
  lottery_opt_in boolean,
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
  participant_login_id text,
  study_group text not null check (
    study_group in (
      'control',
      'treatment',
      'unrestricted_ai',
      'guided_ai',
      'prompt_bank_ai'
    )
  ),
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

-- ========== participant roster (login IDs + baseline survey) ==========
create table if not exists public.study_participants (
  login_id text primary key,
  access_code text unique not null,
  email text unique not null,
  full_name text not null,
  available_prime boolean not null default false,
  grade text not null,
  likert jsonb not null,
  free_response jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.study_participants enable row level security;

alter table public.study_results
  drop constraint if exists study_results_participant_login_id_fkey;

alter table public.study_results
  add constraint study_results_participant_login_id_fkey
  foreign key (participant_login_id) references public.study_participants(login_id);

alter table public.study_chat_turns
  drop constraint if exists study_chat_turns_participant_login_id_fkey;

alter table public.study_chat_turns
  add constraint study_chat_turns_participant_login_id_fkey
  foreign key (participant_login_id) references public.study_participants(login_id);

-- ========== systematic 3-arm sequence (atomic with service role + RPC) ==========
create table if not exists public.study_participant_sequence (
  singleton boolean primary key default true,
  seq bigint not null default 0
);

insert into public.study_participant_sequence (singleton, seq)
values (true, 0)
on conflict (singleton) do nothing;

create or replace function public.claim_next_participant_sequence()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v bigint;
begin
  update public.study_participant_sequence
  set seq = seq + 1
  where singleton = true
  returning seq into v;
  return v;
end;
$$;

revoke all on function public.claim_next_participant_sequence() from public;
grant execute on function public.claim_next_participant_sequence() to service_role;
