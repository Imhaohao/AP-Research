-- supabase/module_view.sql
-- Run this in Supabase → SQL Editor → New query after study_results.sql has been applied.
--
-- Purpose: Flatten the JSON `data` column in public.study_results so analyses
-- of the interactive module and pre/post assessments can be written as plain
-- SQL / imported into R/Python via CSV exports.
--
-- All three RQs are covered:
--   RQ1 (substitutive use) — post-arm-only OE substitutive-intent score comparisons,
--                            plus S1 per-dimension pass rates (especially
--                            not_seeking_direct_response).
--   RQ2 (prompt quality)  — per-attempt, per-dimension auto-grader verdicts
--                            across all module scenarios + OE rewrite-prompt items.
--   RQ3 (hallucination)   — 3-item post-test subtest (detection_correct +
--                            correction-prompt grader output) + S3 detection.
--
-- Every view only reads from study_results.data; no schema change is needed.

/* -------------------------------------------------------------------------- */
/* v_study_base — one row per participant with top-level analysis keys        */
/* -------------------------------------------------------------------------- */
create or replace view public.v_study_base as
select
  r.client_submission_id,
  r.study_group,
  r.participant_email,
  r.participant_login_id,
  r.lottery_opt_in,
  r.created_at,
  r.updated_at,
  (r.data->>'two_arm_condition')::text                      as two_arm_condition,
  (r.data->'session_profile'->>'treatment_arm')::int        as treatment_arm,
  (r.data->'session_profile'->>'participant_sequence')::int as participant_sequence,
  (r.data->'session_profile'->>'curriculum')::text          as curriculum,
  (r.data->'session_profile'->>'session_started_at')::text  as session_started_at,
  (r.data->'session_profile'->>'task_topic')::text          as task_topic
from public.study_results r;

/* -------------------------------------------------------------------------- */
/* v_assessment_tf — one row per (participant × phase × TF item)              */
/* phase in ('pre','post'); response is -1 if unanswered, 0 false, 1 true.    */
/* -------------------------------------------------------------------------- */
create or replace view public.v_assessment_tf as
with phases as (
  select r.client_submission_id, r.data, 'pre'::text  as phase union all
  select r.client_submission_id, r.data, 'post'::text as phase
  from public.study_results r
)
select
  p.client_submission_id,
  p.phase,
  (item->>'id')::text                         as item_id,
  (item->>'pillar')::text                     as pillar,
  (item->>'correct_answer')::boolean          as correct_answer,
  case
    when item->'response' is null or item->>'response' = ''
      then null
    else (item->>'response')::boolean
  end                                         as response,
  case
    when item->'response' is null or item->>'response' = '' then null
    when (item->>'response')::boolean = (item->>'correct_answer')::boolean then 1
    else 0
  end                                         as correct_flag
from public.study_results r
join phases p on p.client_submission_id = r.client_submission_id
   and p.data = r.data
join lateral jsonb_array_elements(r.data->(p.phase || '_assessment')->'tf') as item on true;

/* -------------------------------------------------------------------------- */
/* v_assessment_likert — one row per (participant × phase × likert item)     */
/* -------------------------------------------------------------------------- */
create or replace view public.v_assessment_likert as
with phases as (
  select r.client_submission_id, r.data, 'pre'::text  as phase union all
  select r.client_submission_id, r.data, 'post'::text as phase
  from public.study_results r
)
select
  p.client_submission_id,
  p.phase,
  key                                         as likert_id,
  nullif(value::text, 'null')::int            as rating
from public.study_results r
join phases p on p.client_submission_id = r.client_submission_id
   and p.data = r.data
join lateral jsonb_each(r.data->(p.phase || '_assessment')->'likert') as kv(key, value) on true;

/* -------------------------------------------------------------------------- */
/* v_assessment_oe — one row per (participant × phase × open-ended item)     */
/* -------------------------------------------------------------------------- */
create or replace view public.v_assessment_oe as
with phases as (
  select r.client_submission_id, r.data, 'pre'::text  as phase union all
  select r.client_submission_id, r.data, 'post'::text as phase
  from public.study_results r
)
select
  p.client_submission_id,
  p.phase,
  (item->>'id')::text       as item_id,
  (item->>'response')::text as response_text
from public.study_results r
join phases p on p.client_submission_id = r.client_submission_id
   and p.data = r.data
join lateral jsonb_array_elements(r.data->(p.phase || '_assessment')->'oe') as item on true;

/* -------------------------------------------------------------------------- */
/* v_assessment_hallucination — one row per (participant × phase × item)     */
/* Includes raw flagged-error text + correction-prompt text for grading.     */
/* -------------------------------------------------------------------------- */
create or replace view public.v_assessment_hallucination as
with phases as (
  select r.client_submission_id, r.data, 'pre'::text  as phase union all
  select r.client_submission_id, r.data, 'post'::text as phase
  from public.study_results r
)
select
  p.client_submission_id,
  p.phase,
  (item->>'id')::text                 as item_id,
  (item->>'topic')::text               as topic,
  (item->>'flagged_error')::text       as flagged_error,
  (item->>'correction_prompt')::text   as correction_prompt
from public.study_results r
join phases p on p.client_submission_id = r.client_submission_id
   and p.data = r.data
join lateral jsonb_array_elements(r.data->(p.phase || '_assessment')->'hallucination_items') as item on true;

/* -------------------------------------------------------------------------- */
/* v_module_attempts — one row per (participant × scenario × attempt)         */
/* -------------------------------------------------------------------------- */
create or replace view public.v_module_attempts as
select
  r.client_submission_id,
  (scen->>'id')::text                                     as scenario_id,
  (scen->>'pillar')::text                                 as pillar,
  (ordinality)::int                                       as attempt_index,
  (attempt->>'prompt')::text                              as prompt_text,
  (attempt->>'ai_response')::text                         as ai_response_text,
  (attempt->>'grading_status')::text                      as grading_status,
  (attempt->>'grading_error')::text                       as grading_error,
  (attempt->>'ms_elapsed')::bigint                        as ms_elapsed,
  (attempt->>'submitted_at')::timestamptz                 as submitted_at,
  attempt->'auto_grade'                                   as auto_grade_json
from public.study_results r
join lateral jsonb_array_elements(r.data->'module'->'scenarios') as scen on true
join lateral jsonb_array_elements(scen->'attempts') with ordinality as attempt on true;

/* -------------------------------------------------------------------------- */
/* v_module_attempt_dims — one row per (attempt × rubric dimension)           */
/* "pass" == 1 means the auto-grader judged that dimension as PASS.           */
/* -------------------------------------------------------------------------- */
create or replace view public.v_module_attempt_dims as
select
  a.client_submission_id,
  a.scenario_id,
  a.pillar,
  a.attempt_index,
  a.submitted_at,
  a.ms_elapsed,
  a.grading_status,
  dim_kv.key                                              as dimension_id,
  case
    when (dim_kv.value->>'pass')::text = 'true' then 1
    when (dim_kv.value->>'pass')::text = 'false' then 0
    else null
  end                                                     as pass_flag,
  (dim_kv.value->>'explanation')::text                    as explanation
from public.v_module_attempts a
left join lateral jsonb_each(a.auto_grade_json) as dim_kv(key, value)
  on a.auto_grade_json is not null;

/* -------------------------------------------------------------------------- */
/* v_module_s3_detection — one row per (participant × planted-error id).     */
/* Used for RQ3 module-side detection analysis (S3 scenario).                 */
/* -------------------------------------------------------------------------- */
create or replace view public.v_module_s3_detection as
with s3 as (
  select
    r.client_submission_id,
    scen->'detection' as det
  from public.study_results r
  join lateral jsonb_array_elements(r.data->'module'->'scenarios') as scen on true
  where (scen->>'id') = 's3_verification'
    and scen->'detection' is not null
)
select
  s3.client_submission_id,
  planted_id::text                                                as planted_error_id,
  case
    when (s3.det->'detected_error_ids') ? planted_id::text then 1
    else 0
  end                                                             as detected_flag
from s3
join lateral jsonb_array_elements_text(s3.det->'planted_error_ids') as planted_id on true;
