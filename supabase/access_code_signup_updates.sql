-- Run this in Supabase SQL Editor for existing projects.
-- Adds access-code signup support + tighter participant linkage.

alter table if exists public.study_participants
  add column if not exists access_code text;

alter table if exists public.study_participants
  alter column access_code set default upper(substr(md5(gen_random_uuid()::text), 1, 8));

alter table if exists public.study_participants
  add column if not exists availability_label text;

alter table if exists public.study_participants
  add column if not exists availability_slots jsonb;

update public.study_participants
set access_code = 'AC' || lpad(substring(login_id from '[0-9]+'), 4, '0')
where access_code is null
  and login_id ~ '^APR[0-9]{3}$';

-- Fallback for any remaining nulls.
update public.study_participants
set access_code = upper(substr(md5((login_id || email || now()::text)), 1, 8))
where access_code is null;

alter table if exists public.study_participants
  alter column access_code set not null;

update public.study_participants
set
  availability_label = coalesce(availability_label, case when available_prime then 'prime' else 'async' end),
  availability_slots = coalesce(availability_slots, '[]'::jsonb);

alter table if exists public.study_participants
  alter column availability_label set default 'async';

alter table if exists public.study_participants
  alter column availability_label set not null;

alter table if exists public.study_participants
  alter column availability_slots set default '[]'::jsonb;

alter table if exists public.study_participants
  alter column availability_slots set not null;

create unique index if not exists study_participants_access_code_idx
  on public.study_participants (access_code);

alter table if exists public.study_results
  add column if not exists participant_login_id text;

alter table if exists public.study_results
  add column if not exists lottery_opt_in boolean;

update public.study_results
set lottery_opt_in = coalesce(
  lottery_opt_in,
  case
    when lower(coalesce(data->>'lottery_opt_in', '')) in ('true', 't', '1', 'yes') then true
    when lower(coalesce(data->>'lottery_opt_in', '')) in ('false', 'f', '0', 'no') then false
    else null
  end
)
where data ? 'lottery_opt_in';

alter table if exists public.study_results
  drop constraint if exists study_results_participant_login_id_fkey;

alter table if exists public.study_results
  add constraint study_results_participant_login_id_fkey
  foreign key (participant_login_id) references public.study_participants(login_id);

create index if not exists study_results_participant_login_id_idx
  on public.study_results (participant_login_id);

alter table if exists public.study_chat_turns
  add column if not exists participant_login_id text;

create index if not exists study_chat_turns_participant_login_id_idx
  on public.study_chat_turns (participant_login_id);

alter table if exists public.study_chat_turns
  drop constraint if exists study_chat_turns_participant_login_id_fkey;

alter table if exists public.study_chat_turns
  add constraint study_chat_turns_participant_login_id_fkey
  foreign key (participant_login_id) references public.study_participants(login_id);

-- Admin-controlled study on/off status
create table if not exists public.study_config (
  id smallint primary key,
  is_open boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.study_config (id, is_open)
values (1, true)
on conflict (id) do nothing;

alter table if exists public.study_config enable row level security;
