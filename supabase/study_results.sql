-- Run this in Supabase → SQL Editor → New query

create table if not exists public.study_results (
  client_submission_id text primary key,
  study_group text not null check (study_group in ('control', 'treatment')),
  participant_email text,
  participant_login_id text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_results_created_at_idx on public.study_results (created_at desc);

alter table public.study_results enable row level security;

-- For Next.js /api/study/submit using the publishable (anon) key:
-- Inserts and updates from your app (UUIDs are unguessable; for stricter setups use service_role only on the server).
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
