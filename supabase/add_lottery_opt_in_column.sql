-- Run this in Supabase SQL Editor for existing projects.
-- Adds a dedicated column for end-of-study lottery opt-in.

alter table if exists public.study_results
  add column if not exists lottery_opt_in boolean;

-- Optional backfill from stored JSON payload
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
