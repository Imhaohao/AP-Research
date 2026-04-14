-- Participant roster + login IDs for AP Research study
-- Run in Supabase SQL Editor for existing projects.

create table if not exists public.study_participants (
  login_id text primary key,
  access_code text not null default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  email text unique not null,
  full_name text not null,
  available_prime boolean not null default false,
  grade text not null,
  likert jsonb not null,
  free_response jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.study_participants
  add column if not exists access_code text;

alter table if exists public.study_participants
  alter column access_code set default upper(substr(md5(gen_random_uuid()::text), 1, 8));

alter table public.study_participants enable row level security;

-- Backfill deterministic access codes for imported participants when missing.
update public.study_participants
set access_code = 'AC' || lpad(substring(login_id from '[0-9]+'), 4, '0')
where access_code is null
  and substring(login_id from '[0-9]+') is not null;

alter table public.study_participants
  alter column access_code set not null;

create unique index if not exists study_participants_access_code_idx
  on public.study_participants (access_code);

-- Keep participant roster private by default (no anon policies).
-- Add explicit policies later if you need dashboard/query access from clients.

alter table if exists public.study_results
  add column if not exists participant_login_id text;

alter table public.study_results
  drop constraint if exists study_results_participant_login_id_fkey;

alter table public.study_results
  add constraint study_results_participant_login_id_fkey
  foreign key (participant_login_id) references public.study_participants(login_id);

create index if not exists study_results_participant_login_id_idx
  on public.study_results (participant_login_id);

insert into public.study_participants (
  login_id,
  email,
  full_name,
  available_prime,
  grade,
  likert,
  free_response
)
values
('APR001', 'as35295@pausd.us', 'Alice Sheffer', false, 'Senior', '{"ai_use_frequency": 3, "prompt_confidence": 4, "clear_prompt_understanding": 3, "ask_final_answers": 2, "step_by_step_use": 3, "accuracy_bias_eval": 3, "responsible_learning_belief": 5}'::jsonb, '{"schoolwork_ai_use": null, "good_prompt_definition": null, "ai_school_concerns": null}'::jsonb),
('APR002', 'lw41022@pausd.us', 'Lydia Wang', false, 'Junior', '{"ai_use_frequency": 2, "prompt_confidence": 4, "clear_prompt_understanding": 5, "ask_final_answers": 1, "step_by_step_use": 4, "accuracy_bias_eval": 4, "responsible_learning_belief": 5}'::jsonb, '{"schoolwork_ai_use": "Dont use it often just for brainstorming or when the teacher asks us to", "good_prompt_definition": "Very specific, clear directions, clear and plentiful information for it to use, and overall just be super specific.", "ai_school_concerns": "People letting go of their creativity, academic dishonesty."}'::jsonb),
('APR003', 'as47396@pausd.us', 'Anita Schauenberg', true, 'Sophomore', '{"ai_use_frequency": 2, "prompt_confidence": 2, "clear_prompt_understanding": 2, "ask_final_answers": 1, "step_by_step_use": 3, "accuracy_bias_eval": 3, "responsible_learning_belief": 3}'::jsonb, '{"schoolwork_ai_use": "not very often but I use it to study often", "good_prompt_definition": null, "ai_school_concerns": null}'::jsonb),
('APR004', 'as49256@pausd.us', 'Aeshaan Singhal', true, 'Junior', '{"ai_use_frequency": 4, "prompt_confidence": 4, "clear_prompt_understanding": 3, "ask_final_answers": 2, "step_by_step_use": 3, "accuracy_bias_eval": 1, "responsible_learning_belief": 4}'::jsonb, '{"schoolwork_ai_use": "generally to work through math problems or to help find grammar errors, occasionaly to simplify documents for apush", "good_prompt_definition": "definitely specificity on what you want it to do, and if it doesn''t do it correctly, a follow up", "ai_school_concerns": "i''m worried that future classes will be unable to write academically because of their heavy reliance on AI. Unfortunatel that''s the way its looking."}'::jsonb),
('APR005', 'jn51909@pausd.us', 'Julia Nunes', true, 'Junior', '{"ai_use_frequency": 2, "prompt_confidence": 1, "clear_prompt_understanding": 3, "ask_final_answers": 1, "step_by_step_use": 5, "accuracy_bias_eval": 4, "responsible_learning_belief": 4}'::jsonb, '{"schoolwork_ai_use": "Not usually, just to summarize a large reading sometimes", "good_prompt_definition": "Having various details and informations that make it the most accurate", "ai_school_concerns": "N/A"}'::jsonb),
('APR006', 'dq57415@pausd.us', 'Drake Quiec', true, 'Freshman', '{"ai_use_frequency": 3, "prompt_confidence": 4, "clear_prompt_understanding": 4, "ask_final_answers": 3, "step_by_step_use": 3, "accuracy_bias_eval": 3, "responsible_learning_belief": 5}'::jsonb, '{"schoolwork_ai_use": null, "good_prompt_definition": "I think it would have to be very specific and give the AI a \"job\" so there are less room for experimentation or error", "ai_school_concerns": null}'::jsonb),
('APR007', 'mi47685@pausd.us', 'Motoko Iwata', false, 'Senior', '{"ai_use_frequency": 2, "prompt_confidence": 2, "clear_prompt_understanding": 3, "ask_final_answers": 1, "step_by_step_use": 4, "accuracy_bias_eval": 2, "responsible_learning_belief": 4}'::jsonb, '{"schoolwork_ai_use": null, "good_prompt_definition": null, "ai_school_concerns": null}'::jsonb),
('APR008', 'ms35802@pausd.us', 'Max Soparkar', true, 'Senior', '{"ai_use_frequency": 2, "prompt_confidence": 4, "clear_prompt_understanding": 3, "ask_final_answers": 5, "step_by_step_use": 4, "accuracy_bias_eval": 5, "responsible_learning_belief": 5}'::jsonb, '{"schoolwork_ai_use": "Usually when I need to understand a topic quickly and concisely, such as in math, so I ask for an explanation of a question that I already asnwered", "good_prompt_definition": "Not entirely sure that this is a real thing considering that this question seems more subjective than anything else", "ai_school_concerns": "my concerns are that it builds dependence instead of constructing"}'::jsonb),
('APR009', 'kc55367@pausd.us', 'Kexuan Chen', true, 'Freshman', '{"ai_use_frequency": 2, "prompt_confidence": 3, "clear_prompt_understanding": 3, "ask_final_answers": 1, "step_by_step_use": 4, "accuracy_bias_eval": 4, "responsible_learning_belief": 5}'::jsonb, '{"schoolwork_ai_use": "I usually use AI in math to help me understand a concept, or if I need help on explaining how to do a problem.", "good_prompt_definition": "A good AI prompt is specific.", "ai_school_concerns": null}'::jsonb),
('APR010', 'eg33427@pausd.us', 'Emma Gee', false, 'Senior', '{"ai_use_frequency": 3, "prompt_confidence": 2, "clear_prompt_understanding": 4, "ask_final_answers": 2, "step_by_step_use": 4, "accuracy_bias_eval": 4, "responsible_learning_belief": 4}'::jsonb, '{"schoolwork_ai_use": null, "good_prompt_definition": null, "ai_school_concerns": null}'::jsonb),
('APR011', 'ec39209@pausd.us', 'Edward Chen', true, 'Sophomore', '{"ai_use_frequency": 4, "prompt_confidence": 4, "clear_prompt_understanding": 5, "ask_final_answers": 3, "step_by_step_use": 4, "accuracy_bias_eval": 3, "responsible_learning_belief": 4}'::jsonb, '{"schoolwork_ai_use": "I ask it to explain answer keys, ask it for answers, ask it to teach me material ect.", "good_prompt_definition": "Giving it guidelines and making sure that it is able to complete what you want it to do.", "ai_school_concerns": "N/A"}'::jsonb),
('APR012', 'matthewjjhong@gmail.com', 'Matthew Hong', true, 'Sophomore', '{"ai_use_frequency": 4, "prompt_confidence": 1, "clear_prompt_understanding": 5, "ask_final_answers": 2, "step_by_step_use": 5, "accuracy_bias_eval": 4, "responsible_learning_belief": 5}'::jsonb, '{"schoolwork_ai_use": "I use it to create study guides that I paste into turbo learn. Because AI can analyze large amounts of data way faster than I can, it is a quick solution to learning review material.", "good_prompt_definition": null, "ai_school_concerns": null}'::jsonb),
('APR013', 'grace.enrong@icloud.com', 'Grace Hawes', true, 'Sophomore', '{"ai_use_frequency": 5, "prompt_confidence": 1, "clear_prompt_understanding": 4, "ask_final_answers": 2, "step_by_step_use": 5, "accuracy_bias_eval": 3, "responsible_learning_belief": 5}'::jsonb, '{"schoolwork_ai_use": "I use it to guide me through math problems that I am struggling with and need explanations on. I also use it when studying for history tests when I need basic definitions of various terms and events or a simplified explanation so that I understand it better.", "good_prompt_definition": "Giving necessary details in prompts and not leaving out anything that could affect the answer a lot, don''t be vague or too general in the prompt.", "ai_school_concerns": null}'::jsonb),
('APR014', 'ds54891@pausd.us', 'Dalia Saal', false, 'Junior', '{"ai_use_frequency": 3, "prompt_confidence": 2, "clear_prompt_understanding": 4, "ask_final_answers": 1, "step_by_step_use": 4, "accuracy_bias_eval": 4, "responsible_learning_belief": 5}'::jsonb, '{"schoolwork_ai_use": "I generally use AI to explain and work through problems for homework or studying in my complex classes like math or science when I don''t understand how to reach the solution when no intermediate steps are given.", "good_prompt_definition": "A good AI prompt directly and explicitly asks for what one wants to receive, and is effective in gaining an accurate answer.", "ai_school_concerns": "I am concerned that we are not being taught how to responsibly use AI or effectively use AI for our work. AI is of growing importance in the workforce, and we need to begin implementing programs to teach students how to utilize AI to their advantage, and to advance their expertise and execution, not rely solely on it."}'::jsonb),
('APR015', 'yueyue1149@outlook.com', 'Lily Cai', true, 'Freshman', '{"ai_use_frequency": 4, "prompt_confidence": 3, "clear_prompt_understanding": 3, "ask_final_answers": 1, "step_by_step_use": 3, "accuracy_bias_eval": 3, "responsible_learning_belief": 4}'::jsonb, '{"schoolwork_ai_use": "I usually use it for explaining background for assignments, especially history or english, summarizing articles and refining my writing.", "good_prompt_definition": "Clear, concise and comprehensive (not missing any details)", "ai_school_concerns": "In my opinion, people''s reading and writing abilities, along with their organizational skills, may degrade if they rely too much on AI. This is somewhat counterintuitive, yet from my experience true."}'::jsonb),
('APR016', 'jw37952@pausd.us', 'Jiayi Wang', true, 'Junior', '{"ai_use_frequency": 1, "prompt_confidence": 1, "clear_prompt_understanding": 1, "ask_final_answers": 1, "step_by_step_use": 1, "accuracy_bias_eval": 3, "responsible_learning_belief": 1}'::jsonb, '{"schoolwork_ai_use": "none", "good_prompt_definition": "none", "ai_school_concerns": "no thinking when answers are everywhere so no need for school"}'::jsonb),
('APR017', 'vb47036@pausd.us', 'Viv Bojinov', false, 'Freshman', '{"ai_use_frequency": 2, "prompt_confidence": 2, "clear_prompt_understanding": 4, "ask_final_answers": 3, "step_by_step_use": 3, "accuracy_bias_eval": 1, "responsible_learning_belief": 3}'::jsonb, '{"schoolwork_ai_use": "Mainly in multiple classes to summarize long text", "good_prompt_definition": "It is honest, and it includes specifications.", "ai_school_concerns": "People who don''t use it will get further ahead using knowledge that has been backed by research."}'::jsonb),
('APR018', 'nathanhlee1@gmail.com', 'Nathan Lee', false, 'Senior', '{"ai_use_frequency": 5, "prompt_confidence": 4, "clear_prompt_understanding": 4, "ask_final_answers": 3, "step_by_step_use": 5, "accuracy_bias_eval": 4, "responsible_learning_belief": 5}'::jsonb, '{"schoolwork_ai_use": "Always", "good_prompt_definition": "detailed", "ai_school_concerns": "Less thinking"}'::jsonb),
('APR019', 'ac58441@pausd.us', 'Asher Carlson', false, 'Freshman', '{"ai_use_frequency": 2, "prompt_confidence": 3, "clear_prompt_understanding": 4, "ask_final_answers": 3, "step_by_step_use": 4, "accuracy_bias_eval": 1, "responsible_learning_belief": 5}'::jsonb, '{"schoolwork_ai_use": null, "good_prompt_definition": null, "ai_school_concerns": null}'::jsonb)
on conflict (login_id) do update
set
  access_code = coalesce(excluded.access_code, public.study_participants.access_code),
  email = excluded.email,
  full_name = excluded.full_name,
  available_prime = excluded.available_prime,
  grade = excluded.grade,
  likert = excluded.likert,
  free_response = excluded.free_response,
  updated_at = now();

-- Keep seeded roster access codes easy to hand out.
update public.study_participants
set access_code = 'AC' || lpad(substring(login_id from '[0-9]+'), 4, '0')
where login_id ~ '^APR[0-9]{3}$';
