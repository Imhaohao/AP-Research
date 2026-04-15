-- Systematic 3-arm assignment: first participant seq=1 → arm (1-1)%3 = 0, etc.
-- Run in Supabase SQL Editor after setup_all.sql (or merge into new projects).

-- Sequence row (singleton)
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

-- Widen study_group + add assignment metadata
alter table public.study_results drop constraint if exists study_results_study_group_check;

alter table public.study_results
  add column if not exists treatment_arm smallint,
  add column if not exists participant_sequence bigint;

alter table public.study_results add constraint study_results_study_group_check
  check (
    study_group in (
      'control',
      'treatment',
      'unrestricted_ai',
      'guided_ai',
      'prompt_bank_ai'
    )
  );

-- study_chat_turns
alter table public.study_chat_turns drop constraint if exists study_chat_turns_study_group_check;

alter table public.study_chat_turns add constraint study_chat_turns_study_group_check
  check (
    study_group in (
      'control',
      'treatment',
      'unrestricted_ai',
      'guided_ai',
      'prompt_bank_ai'
    )
  );
