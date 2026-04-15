-- Run this in Supabase SQL Editor for existing projects.
-- Adds structured availability fields for PRIME / Study Hall / after-school / async.

alter table if exists public.study_participants
  add column if not exists availability_label text;

alter table if exists public.study_participants
  add column if not exists availability_slots jsonb;

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
