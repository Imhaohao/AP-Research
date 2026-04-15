-- Run in Supabase SQL Editor for existing projects.
-- Fixes study_results study_group check constraint to match current app values.

alter table if exists public.study_results
  drop constraint if exists study_results_study_group_check;

alter table if exists public.study_results
  add constraint study_results_study_group_check
  check (
    study_group in (
      'control',
      'treatment',
      'unrestricted_ai',
      'guided_ai',
      'prompt_bank_ai'
    )
  );
