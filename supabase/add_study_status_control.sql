-- Adds an admin-controlled study access toggle.
-- Run in Supabase SQL Editor for existing projects.

create table if not exists public.study_config (
  id smallint primary key,
  is_open boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.study_config (id, is_open)
values (1, true)
on conflict (id) do nothing;

alter table if exists public.study_config enable row level security;
