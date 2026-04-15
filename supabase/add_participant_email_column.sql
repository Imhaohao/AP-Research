-- Run this in Supabase SQL Editor for existing projects.
alter table if exists public.study_results
  add column if not exists participant_email text;

-- Optional backfill from JSON payloads (only values that look like emails).
update public.study_results
set participant_email = lower(candidate_email)
from (
  select
    client_submission_id,
    coalesce(
      nullif(trim(data->>'participant_email'), ''),
      nullif(trim(data->>'participant_950'), '')
    ) as candidate_email
  from public.study_results
) c
where public.study_results.client_submission_id = c.client_submission_id
  and public.study_results.participant_email is null
  and c.candidate_email ~* '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
