'use client'

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CRAFT_ATTRIBUTION,
  CRAFT_NARRATIVE_PROMPTS,
  CRAFT_REVISION_SUGGESTIONS,
  isCraftCurriculumPath,
  type CraftPromptId,
} from '@/lib/craftCurriculum';
import {
  ARM_LABELS,
  craftAiNarrativeChatSystemPrompt,
  craftRevisionCoachPrompt,
  NARRATIVE_PROMPT_BANK,
  TWO_ARM_LABELS,
  twoArmConditionFromArm,
  usesLegacyTwoArmDesign,
  type StudyGroupSlug,
  type TreatmentArm,
  type TwoArmCondition,
} from '@/lib/studyArms';
import {
  MODULE_SCENARIOS,
  RUBRIC_DIMENSIONS,
  gradeDetection,
  getScenario,
  type ModuleScenario,
  type RubricDimensionId,
  type ScenarioId,
} from '@/lib/moduleScenarios';
import {
  HALLUCINATION_ITEMS,
  LIKERT_CONFIDENCE_ITEMS,
  OE_ITEMS,
  TF_ITEMS,
} from '@/lib/moduleAssessment';

function formatOpenAiHelperError(message: string): string {
  const m = (message || '').trim();
  if (/quota|billing|insufficient_quota|payment method/i.test(m)) {
    return `${m} — Fix billing or add credits: https://platform.openai.com/account/billing`;
  }
  return m;
}

/**
 * A simple TypeScript React component that guides a student through a
 * quasi‑experimental prompt engineering study. It mirrors the high level
 * structure described in the research proposal: students are randomly
 * assigned systematically (3 AI-use arms via Supabase order) or, in legacy mode,
 * to control vs treatment. Results are sent to Supabase when the participant reaches the thank‑you screen.
 */
export default function PromptStudy({
  participantEmail,
  participantLoginId,
}: {
  participantEmail?: string;
  participantLoginId?: string;
}) {
  type Stage =
    | "consent"
    | "preSurvey"
    | "preAssess"
    | "module"
    | "modulePractice"
    | "task"
    | "postSurvey"
    | "postAssess"
    | "complete"
    | "craftIntro"
    | "craftHuman"
    | "craftAI"
    | "craftCompare"
    | "craftRevise"
    | "craftReflect"
    | "craftExit";

  const legacyTwoArm = usesLegacyTwoArmDesign();
  const [legacyGroup] = useState<'control' | 'treatment'>(() =>
    Math.random() < 0.5 ? 'control' : 'treatment'
  );

  const useCraftPath = legacyTwoArm ? isCraftCurriculumPath(legacyGroup) : true;

  const [assignStatus, setAssignStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    legacyTwoArm ? 'ready' : 'loading'
  );
  const [assignFetchId, setAssignFetchId] = useState(0);
  const [assignErrorMsg, setAssignErrorMsg] = useState('');
  const [assignWarningMsg, setAssignWarningMsg] = useState('');
  const [treatmentArm, setTreatmentArm] = useState<TreatmentArm | null>(null);
  const [participantSequence, setParticipantSequence] = useState<number | null>(null);
  const [modernStudyGroup, setModernStudyGroup] = useState<StudyGroupSlug | null>(null);

  const effectiveStudyGroup: StudyGroupSlug = legacyTwoArm
    ? legacyGroup
    : (modernStudyGroup ?? 'guided_ai');

  /** Coaching / generation style: legacy study uses guided-style (arm 1); RCT uses assigned arm */
  const coachArm: TreatmentArm = legacyTwoArm ? 1 : (treatmentArm ?? 1);

  /**
   * 2-arm condition used by the Xiao-style module study. The database still
   * records 3 arms (0/1/2) via the sequence-based assignment logic — we
   * collapse arm 0 -> control and arms 1,2 -> treatment in the UI and for
   * analysis. Legacy two-arm participants use their randomized legacyGroup.
   */
  const twoArmCondition: TwoArmCondition = legacyTwoArm
    ? legacyGroup
    : twoArmConditionFromArm(treatmentArm);

  useEffect(() => {
    if (legacyTwoArm) return;
    let cancelled = false;
    setAssignStatus('loading');
    setAssignErrorMsg('');
    void (async () => {
      try {
        const r = await fetch('/api/study/assign');
        const j = (await r.json()) as {
          error?: string;
          treatment_arm?: TreatmentArm;
          study_group?: StudyGroupSlug;
          participant_sequence?: number | null;
          warning?: string;
        };
        if (!r.ok) throw new Error(j.error || `Assignment failed (${r.status})`);
        if (cancelled) return;
        if (j.treatment_arm === undefined || j.treatment_arm === null) {
          throw new Error('Invalid assignment response');
        }
        setTreatmentArm(j.treatment_arm as TreatmentArm);
        setModernStudyGroup(j.study_group ?? null);
        setParticipantSequence(
          j.participant_sequence !== undefined ? j.participant_sequence : null
        );
        setAssignWarningMsg(j.warning ?? '');
        setAssignStatus('ready');
      } catch (e) {
        if (!cancelled) {
          setAssignErrorMsg(e instanceof Error ? e.message : 'Assignment failed');
          setAssignStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [legacyTwoArm, assignFetchId]);

  const [stage, setStage] = useState<Stage>("consent");
  const [preResponses, setPreResponses] = useState({
    q1: 0,
    q2: 0,
    q3: 0,
    q4: 0,
    q5: 0,
    open1: "",
    open2: "",
    open3: "",
  });
  const [postResponses, setPostResponses] = useState({
    q1: 0,
    q2: 0,
    q3: 0,
    q4: 0,
    q5: 0,
    open1: "",
    open2: "",
    open3: "",
  });

  /** ----- Pre/Post assessment state (Xiao Study 2-style: TF + OE + Likert + hallucination subtest) ----- */
  type TFAnswerMap = Record<string, boolean | null>;
  type OEAnswerMap = Record<string, string>;
  type HalucItemAnswers = { flaggedError: string; correctionPrompt: string };
  type HallucinationAnswerMap = Record<string, HalucItemAnswers>;
  type LikertAnswerMap = Record<'q1' | 'q2' | 'q3' | 'q4' | 'q5', number>;

  function freshLikert(): LikertAnswerMap {
    return { q1: 0, q2: 0, q3: 0, q4: 0, q5: 0 };
  }
  function freshTF(): TFAnswerMap {
    return Object.fromEntries(TF_ITEMS.map((i) => [i.id, null])) as TFAnswerMap;
  }
  function freshOE(): OEAnswerMap {
    return Object.fromEntries(OE_ITEMS.map((i) => [i.id, ""])) as OEAnswerMap;
  }
  function freshHallucination(): HallucinationAnswerMap {
    return Object.fromEntries(
      HALLUCINATION_ITEMS.map((i) => [i.id, { flaggedError: "", correctionPrompt: "" }])
    ) as HallucinationAnswerMap;
  }

  const [preAssessment, setPreAssessment] = useState<{
    tf: TFAnswerMap;
    oe: OEAnswerMap;
    hallucination: HallucinationAnswerMap;
    likert: LikertAnswerMap;
  }>(() => ({ tf: freshTF(), oe: freshOE(), hallucination: freshHallucination(), likert: freshLikert() }));

  const [postAssessment, setPostAssessment] = useState<{
    tf: TFAnswerMap;
    oe: OEAnswerMap;
    hallucination: HallucinationAnswerMap;
    likert: LikertAnswerMap;
  }>(() => ({ tf: freshTF(), oe: freshOE(), hallucination: freshHallucination(), likert: freshLikert() }));

  /** ----- Interactive module (3 scenarios) state ----- */
  type ModuleAttempt = {
    prompt: string;
    aiResponse: string;
    autoGrade: Record<RubricDimensionId, { pass: boolean; explanation: string }> | null;
    gradingStatus: 'pending' | 'graded' | 'error';
    gradingError?: string;
    msElapsed: number;
    submittedAt: string;
  };
  type ModuleScenarioState = {
    id: ScenarioId;
    attempts: ModuleAttempt[];
    completed: boolean;
    detection?: {
      flaggedErrors: string;
      correctionPrompt: string;
      detectedErrorIds: string[]; // auto-graded via keyword match
    };
  };

  function makeFreshModuleState(): Record<ScenarioId, ModuleScenarioState> {
    return Object.fromEntries(
      MODULE_SCENARIOS.map((s) => [s.id, { id: s.id, attempts: [], completed: false } as ModuleScenarioState])
    ) as unknown as Record<ScenarioId, ModuleScenarioState>;
  }

  const [moduleScenarioIdx, setModuleScenarioIdx] = useState(0);
  const [moduleState, setModuleState] = useState<Record<ScenarioId, ModuleScenarioState>>(
    () => makeFreshModuleState()
  );
  const [modulePromptDraft, setModulePromptDraft] = useState('');
  const [moduleFlaggedDraft, setModuleFlaggedDraft] = useState(''); // S3 only
  const [moduleCorrectionDraft, setModuleCorrectionDraft] = useState(''); // S3 only
  const [moduleBusy, setModuleBusy] = useState(false);
  const [moduleError, setModuleError] = useState('');
  const moduleScenarioStartRef = useRef<number>(Date.now());
  const topics = [
    "Why do neutron stars 'glitch'?",
    "How do slime molds solve mazes?",
    "What is the Monty Hall paradox and why is it counterintuitive?",
  ];
  const [taskData, setTaskData] = useState({
    topic: topics[0],
    prompts: "",
    explanation: "",
    usedAi: false,
    editedAi: false,
    verified: false,
    cited: false,
  });
  const [consent, setConsent] = useState(false);
  
  // Practice prompt state (for treatment group)
  const [practicePrompt, setPracticePrompt] = useState({
    role: '',
    context: '',
    task: '',
  });
  const [practiceTries, setPracticeTries] = useState(3);
  const [showPractice, setShowPractice] = useState(false);
  
  // Lottery state
  const [lotteryOptIn, setLotteryOptIn] = useState(false);
  const [participantNumber, setParticipantNumber] = useState('');

  /** Stable id for upserts so lottery updates merge into the same row */
  const [clientSubmissionId] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `study-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  
  // ChatGPT (OpenAI API) writing assistant on the task step
  const [openAiMessages, setOpenAiMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [openAiInput, setOpenAiInput] = useState('');
  const [openAiLoading, setOpenAiLoading] = useState(false);
  const [openAiError, setOpenAiError] = useState('');

  /** Separate chat transcripts for AI-narrative vs revision (shared `openAiMessages` state). */
  useEffect(() => {
    if (stage === 'craftAI' || stage === 'craftRevise') {
      setOpenAiMessages([]);
      setOpenAiInput('');
      setOpenAiError('');
    }
  }, [stage]);

  /** Reset the scenario-start timer whenever the module practice stage begins
   *  or the scenario index changes. Timings reflect time-on-scenario. */
  useEffect(() => {
    if (stage === 'modulePractice') {
      moduleScenarioStartRef.current = Date.now();
    }
  }, [stage, moduleScenarioIdx]);

  const [craftData, setCraftData] = useState({
    icebreakerPriorKnowledge: '',
    selectedPromptId: '' as '' | CraftPromptId,
    humanNarrative: '',
    aiNarrative: '',
    compareToneVoice: '',
    compareStructureOrg: '',
    compareThreeDifferences: '',
    compareHumanDidBetter: '',
    compareAiDidBetter: '',
    partnerShareReflection: '',
    revisedNarrative: '',
    discussStrengths: '',
    discussLimitations: '',
    discussOriginalVsAi: '',
    discussBalanceCreativity: '',
    exitBenefits: '',
    exitChallenges: '',
    commitmentStatement: '',
    optionalHowToGuide: '',
  });
  const [sessionStartedAt] = useState(() => new Date().toISOString());
  const chatTurnIndexRef = useRef(0);

  /** Optional: opens school Gemini in a new tab only (no iframe) */
  const schoolGeminiUrl = (process.env.NEXT_PUBLIC_SCHOOL_GEMINI_URL ?? '').trim();
  /** If true, hide built-in OpenAI chat (e.g. school uses only their own Gemini link) */
  const schoolGeminiOnly =
    process.env.NEXT_PUBLIC_GEMINI_SCHOOL_ONLY === 'true' ||
    process.env.NEXT_PUBLIC_GEMINI_SCHOOL_ONLY === '1';

  const buildSessionProfile = useCallback((): Record<string, unknown> => {
    return {
      client_submission_id: clientSubmissionId,
      participant_email: participantEmail ?? null,
      participant_login_id: participantLoginId ?? null,
      study_group: effectiveStudyGroup,
      treatment_arm: legacyTwoArm ? null : treatmentArm,
      participant_sequence: legacyTwoArm ? null : participantSequence,
      curriculum: useCraftPath ? 'stanford_craft_narrative_async' : 'default_prompt_study',
      session_started_at: sessionStartedAt,
      profile_captured_at: new Date().toISOString(),
      stage,
      task_topic: useCraftPath
        ? craftData.selectedPromptId
          ? `craft_narrative:${craftData.selectedPromptId}`
          : 'craft_narrative'
        : taskData.topic,
      consent_given: consent,
      school_gemini_link_configured: Boolean(schoolGeminiUrl),
      school_gemini_only_mode: schoolGeminiOnly,
      browser:
        typeof navigator !== 'undefined'
          ? {
              language: navigator.language,
              userAgent: navigator.userAgent,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }
          : null,
    };
  }, [
    clientSubmissionId,
    effectiveStudyGroup,
    legacyTwoArm,
    treatmentArm,
    participantSequence,
    sessionStartedAt,
    stage,
    taskData.topic,
    consent,
    schoolGeminiUrl,
    schoolGeminiOnly,
    useCraftPath,
    craftData.selectedPromptId,
  ]);

  const flushSubmission = useCallback(async () => {
    setSaveStatus('saving');
    setSaveMessage('');

    /** Serialized `module` blob for analysis (see research plan data schema). */
    const moduleBlob = {
      two_arm_condition: twoArmCondition,
      scenarios: MODULE_SCENARIOS.map((s) => {
        const st = moduleState[s.id];
        return {
          id: s.id,
          pillar: s.pillar,
          applicable_dimensions: s.applicableDimensions,
          attempts: (st?.attempts ?? []).map((a) => ({
            prompt: a.prompt,
            ai_response: a.aiResponse,
            auto_grade: a.autoGrade,
            grading_status: a.gradingStatus,
            grading_error: a.gradingError ?? null,
            ms_elapsed: a.msElapsed,
            submitted_at: a.submittedAt,
          })),
          detection: st?.detection
            ? {
                flagged_errors: st.detection.flaggedErrors,
                correction_prompt: st.detection.correctionPrompt,
                detected_error_ids: st.detection.detectedErrorIds,
                planted_error_ids: (s.plantedErrors ?? []).map((e) => e.id),
              }
            : null,
          completed: Boolean(st?.completed),
        };
      }),
    };

    function serializeAssessment(a: typeof preAssessment) {
      return {
        tf: TF_ITEMS.map((item) => ({
          id: item.id,
          pillar: item.pillar,
          correct_answer: item.correctAnswer,
          response: a.tf[item.id] ?? null,
        })),
        oe: OE_ITEMS.map((item) => ({ id: item.id, response: a.oe[item.id] ?? '' })),
        hallucination_items: HALLUCINATION_ITEMS.map((item) => ({
          id: item.id,
          topic: item.topic,
          ai_response: item.aiResponse,
          planted_error_description: item.plantedErrorDescription,
          flagged_error: a.hallucination[item.id]?.flaggedError ?? '',
          correction_prompt: a.hallucination[item.id]?.correctionPrompt ?? '',
        })),
        likert: a.likert,
      };
    }

    const data: Record<string, unknown> = {
      participant_email: participantEmail ?? null,
      participant_login_id: participantLoginId ?? null,
      consent,
      two_arm_condition: twoArmCondition,
      pre_responses: preResponses,
      post_responses: postResponses,
      pre_assessment: serializeAssessment(preAssessment),
      post_assessment: serializeAssessment(postAssessment),
      module: moduleBlob,
      craft_curriculum: useCraftPath ? craftData : null,
      task_data: taskData,
      practice_prompt: practicePrompt,
      practice_tries: practiceTries,
      show_practice_panel: showPractice,
      lottery_opt_in: lotteryOptIn,
      participant_number: participantNumber.trim() || null,
      open_ai_messages: openAiMessages,
      session_profile: buildSessionProfile(),
      meta: {
        school_gemini_link_configured: Boolean(schoolGeminiUrl),
        school_gemini_only_mode: schoolGeminiOnly,
      },
    };
    try {
      const res = await fetch('/api/study/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_submission_id: clientSubmissionId,
          study_group: effectiveStudyGroup,
          treatment_arm: legacyTwoArm ? null : treatmentArm,
          participant_sequence: legacyTwoArm ? null : participantSequence,
          data,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || `Save failed (${res.status})`);
      }
      setSaveStatus('saved');
      setSaveMessage('Responses saved for the research team.');
    } catch (e) {
      setSaveStatus('error');
      setSaveMessage(e instanceof Error ? e.message : 'Could not save.');
    }
  }, [
    clientSubmissionId,
    effectiveStudyGroup,
    legacyTwoArm,
    treatmentArm,
    participantSequence,
    twoArmCondition,
    consent,
    preResponses,
    postResponses,
    preAssessment,
    postAssessment,
    moduleState,
    taskData,
    practicePrompt,
    practiceTries,
    showPractice,
    lotteryOptIn,
    participantNumber,
    openAiMessages,
    schoolGeminiUrl,
    schoolGeminiOnly,
    buildSessionProfile,
    useCraftPath,
    craftData,
    participantEmail,
    participantLoginId,
  ]);

  useEffect(() => {
    if (stage !== 'complete') return;
    const t = window.setTimeout(() => {
      void flushSubmission();
    }, 300);
    return () => clearTimeout(t);
  }, [stage, flushSubmission]);

  /**
   * Modern (non-legacy) flow: 2-arm design routed via `twoArmCondition`.
   *   Control  : consent -> preAssess -> module (reading) -> craft... -> postAssess
   *   Treatment: consent -> preAssess -> modulePractice (3 scenarios) -> craft... -> postAssess
   * The CRAFT writing task runs for BOTH arms as the shared behavioral arena.
   *
   * Legacy flow: unchanged from the original implementation.
   */
  const flowStages: Stage[] = legacyTwoArm
    ? useCraftPath
      ? [
          'consent',
          'craftIntro',
          'craftHuman',
          'craftAI',
          'craftCompare',
          'craftRevise',
          'craftReflect',
          'craftExit',
          'complete',
        ]
      : ['consent', 'module', 'task', 'postSurvey', 'complete']
    : [
        'consent',
        'preAssess',
        twoArmCondition === 'treatment' ? 'modulePractice' : 'module',
        'craftIntro',
        'craftHuman',
        'craftAI',
        'craftCompare',
        'craftRevise',
        'craftReflect',
        'craftExit',
        'postAssess',
        'complete',
      ];

  const stageShortLabel: Record<Stage, string> = {
    consent: 'Consent',
    preSurvey: 'Pre',
    preAssess: 'Pre-test',
    module: 'Reading',
    modulePractice: 'Practice',
    task: 'Task',
    craftIntro: 'Intro',
    craftHuman: 'You write',
    craftAI: 'AI story',
    craftCompare: 'Compare',
    craftRevise: 'Revise',
    craftReflect: 'Discuss',
    craftExit: 'Exit',
    postSurvey: 'Post',
    postAssess: 'Post-test',
    complete: 'Done',
  };

  const currentStep = flowStages.indexOf(stage);
  const canGoBack = currentStep > 0 && stage !== 'complete';

  function goToPreviousStage() {
    if (currentStep <= 0) return;
    const prev = flowStages[currentStep - 1];
    if (prev) {
      setStage(prev);
    }
  }

  function renderProgressBar() {
    const steps = flowStages.slice(0, -1);
    return (
      <div className="lms-progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#666' }}>Progress</span>
          <span style={{ fontSize: '0.875rem', color: '#006B3F', fontWeight: '600' }}>
            Step {currentStep < 0 ? 0 : currentStep + 1} of {steps.length}
          </span>
        </div>
        <div className="progress-bar">
          {steps.map((s, index) => (
            <div key={s} style={{ flex: 1 }}>
              <div className={`progress-step ${index <= currentStep ? 'active' : ''}`} />
              <div className="progress-step-label" style={{ fontSize: '0.7rem' }}>
                {stageShortLabel[s]}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderConsent() {
    return (
      <div className="lms-container">
        {renderProgressBar()}
        <div className="lms-card">
          <h2>Welcome {useCraftPath ? '— Narrative writing & AI (CRAFT-inspired)' : 'to the Prompt Engineering Study'}</h2>
          <p>
            {useCraftPath
              ? 'You will work through an asynchronous lesson on how generative AI can support narrative writing: drafting, comparing your voice to an AI draft, revising with AI, and reflecting on ethics and craft.'
              : 'This activity explores how students can learn to communicate better with AI tools like ChatGPT. Your participation will help us understand effective teaching strategies for AI literacy.'}
          </p>
          
          <h3>What to Expect</h3>
          <ul>
            {legacyTwoArm ? (
              <>
                <li>Complete a brief pre-survey about your AI experience</li>
                {useCraftPath ? (
                  <>
                    <li>Self-paced introduction and narrative drafting (your story, then an AI-generated story from the same prompt)</li>
                    <li>Compare voice, structure, and strengths; revise with AI; reflect as you would in a class discussion</li>
                    <li>Exit ticket and commitment statement, then a short post-survey</li>
                    <li>Total time: about 55–65 minutes</li>
                  </>
                ) : (
                  <>
                    <li>Review a short educational module (5 minutes)</li>
                    <li>Write a brief explanation on an unfamiliar topic</li>
                    <li>Complete a post-survey about your experience</li>
                    <li>Total time: approximately 45-60 minutes</li>
                  </>
                )}
              </>
            ) : (
              <>
                <li>Short pre-test: True/False questions, two short written prompts, a 3-question hallucination check, and 5 confidence ratings</li>
                {twoArmCondition === 'treatment' ? (
                  <li>Interactive 3-scenario prompt-engineering practice (ethical use, iterating on a weak AI reply, fact-checking AI output)</li>
                ) : (
                  <li>Short reading on digital literacy (similar time commitment)</li>
                )}
                <li>Narrative writing task with an AI assistant (your draft, an AI draft, compare, revise, reflect, exit ticket)</li>
                <li>Short post-test matching the pre-test structure</li>
                <li>Total time: about 55–70 minutes</li>
              </>
            )}
          </ul>

          <h3>Your Privacy</h3>
          <p>Your responses are completely anonymous. You may exit the study at any time by closing this window.</p>

          {!legacyTwoArm ? (
            <div className="form-group" style={{ background: '#FDF6E3', borderLeftColor: '#D4A843' }}>
              <h4 style={{ marginTop: 0 }}>Your study condition</h4>
              {assignStatus === 'loading' && <p style={{ marginBottom: 0 }}>Assigning your condition…</p>}
              {assignStatus === 'error' && (
                <div>
                  <p style={{ color: '#c62828', marginBottom: '0.5rem' }}>{assignErrorMsg}</p>
                  <button type="button" onClick={() => setAssignFetchId((n) => n + 1)}>
                    Try again
                  </button>
                </div>
              )}
              {assignStatus === 'ready' && treatmentArm !== null && (
                <>
                  <p style={{ marginBottom: '0.35rem' }}>
                    <strong>{TWO_ARM_LABELS[twoArmCondition].title}</strong>
                  </p>
                  <p style={{ marginBottom: '0.35rem', fontSize: '0.95rem' }}>
                    {TWO_ARM_LABELS[twoArmCondition].description}
                  </p>
                  {participantSequence !== null ? (
                    <p style={{ marginBottom: 0, fontSize: '0.85rem', color: '#555' }}>
                      Enrollment order: {participantSequence}
                    </p>
                  ) : null}
                  {assignWarningMsg ? (
                    <p style={{ marginBottom: 0, marginTop: '0.75rem', fontSize: '0.85rem', color: '#8B7230' }}>
                      {assignWarningMsg}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <div className="form-group" style={{ background: '#FDF6E3', borderLeftColor: '#D4A843' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginRight: '0.75rem', cursor: 'pointer' }}
              />
              <span>I am at least 14 years old and consent to anonymous participation in this research study.</span>
            </label>
          </div>

          <button
            disabled={!consent || (!legacyTwoArm && assignStatus !== 'ready')}
            onClick={() => {
              if (legacyTwoArm) {
                setStage(useCraftPath ? 'craftIntro' : 'module');
              } else {
                setStage('preAssess');
              }
            }}
            style={{ marginTop: '1rem' }}
          >
            Begin Study
          </button>
        </div>
      </div>
    );
  }

  function renderLikert(value: number, onChange: (v: number) => void, name: string) {
    return (
      <div className="likert-scale">
        {[1, 2, 3, 4, 5].map((val) => (
          <div key={val} className="likert-option">
            <label htmlFor={`${name}-${val}`}>
              <input
                id={`${name}-${val}`}
                name={name}
                type="radio"
                value={val}
                checked={value === val}
                onChange={() => onChange(val)}
              />
              <span>{val}</span>
            </label>
          </div>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.875rem', color: '#666' }}>
          {value === 0 && '(Please select)'}
        </span>
      </div>
    );
  }

  function renderPreSurvey() {
    return (
      <div className="lms-container">
        {renderProgressBar()}
        <div className="lms-card">
          <h2>Pre-Survey</h2>
          <p>Please rate your agreement with each statement using the scale below (1 = Strongly Disagree, 5 = Strongly Agree).</p>
          
          <div className="form-group">
            <label>
              <strong>I understand how to write clear and specific prompts for AI tools.</strong>
              {renderLikert(preResponses.q1, (v) => setPreResponses({ ...preResponses, q1: v }), "pre-q1")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>When I use AI, I usually ask for final answers instead of explanations.</strong>
              {renderLikert(preResponses.q2, (v) => setPreResponses({ ...preResponses, q2: v }), "pre-q2")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>I use AI to help me think through problems step‑by‑step.</strong>
              {renderLikert(preResponses.q3, (v) => setPreResponses({ ...preResponses, q3: v }), "pre-q3")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>I know how to tell if AI responses are accurate or biased.</strong>
              {renderLikert(preResponses.q4, (v) => setPreResponses({ ...preResponses, q4: v }), "pre-q4")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>I think AI can help me learn more effectively if used responsibly.</strong>
              {renderLikert(preResponses.q5, (v) => setPreResponses({ ...preResponses, q5: v }), "pre-q5")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>How do you usually use AI tools in your schoolwork?</strong>
              <textarea
                value={preResponses.open1}
                onChange={(e) => setPreResponses({ ...preResponses, open1: e.target.value })}
                rows={3}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>What makes a "good" AI prompt?</strong>
              <textarea
                value={preResponses.open2}
                onChange={(e) => setPreResponses({ ...preResponses, open2: e.target.value })}
                rows={3}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>What concerns do you have about using AI in school?</strong>
              <textarea
                value={preResponses.open3}
                onChange={(e) => setPreResponses({ ...preResponses, open3: e.target.value })}
                rows={3}
              />
            </label>
          </div>

          <button onClick={() => setStage(useCraftPath ? 'craftIntro' : 'module')}>
            {useCraftPath ? 'Continue to lesson intro' : 'Continue to Module'}
          </button>
        </div>
      </div>
    );
  }

  function renderModule() {
    /**
     * In modern (non-legacy) mode, this stage is ONLY reached by the control
     * arm — treatment arm participants go to modulePractice instead. We show
     * the digital-literacy reading for them.
     * In legacy mode, the treatment branch below (Prompt Engineering
     * Mini-Course) is still reachable when legacyGroup === 'treatment'.
     */
    const showTreatmentMiniCourse = legacyTwoArm && legacyGroup === 'treatment';
    return (
      <div className="lms-container">
        {renderProgressBar()}
        <div className="lms-card">
          <h2>{showTreatmentMiniCourse ? "Prompt Engineering Mini‑Course" : "Digital Literacy Module"}</h2>
          {showTreatmentMiniCourse ? (
            <>
              <p style={{ fontSize: '1.1rem', fontWeight: '500', marginBottom: '1.5rem' }}>
                Welcome! This module introduces prompt engineering: the art and science of crafting effective prompts to get better results from AI tools.
              </p>

              <h3>📐 The Role-Context-Task Framework</h3>
              <p>Effective prompts are structured using three key components:</p>
              
              <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem', marginBottom: '2rem' }}>
                <div style={{ padding: '1.25rem', background: '#E6F2EC', borderRadius: '8px', borderLeft: '4px solid #006B3F' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong style={{ color: '#006B3F', fontSize: '1.1rem' }}>Role</strong>
                    <span className="info-badge">Who is the AI?</span>
                  </div>
                  <p style={{ margin: '0.5rem 0 0.75rem 0' }}>Define the persona or expertise the AI should adopt.</p>
                  <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '6px', border: '2px solid #006B3F' }}>
                    <code>You are a journalist.</code>
                  </div>
                </div>

                <div style={{ padding: '1.25rem', background: '#FDF6E3', borderRadius: '8px', borderLeft: '4px solid #D4A843' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong style={{ color: '#006B3F', fontSize: '1.1rem' }}>Context</strong>
                    <span className="info-badge" style={{ background: '#E6F2EC', color: '#006B3F' }}>What's the situation?</span>
                  </div>
                  <p style={{ margin: '0.5rem 0 0.75rem 0' }}>Provide background information or the setting.</p>
                  <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '6px', border: '2px solid #D4A843' }}>
                    <code>There is a mental health crisis in the country.</code>
                  </div>
                </div>

                <div style={{ padding: '1.25rem', background: '#e8f5e9', borderRadius: '8px', borderLeft: '4px solid #388e3c' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong style={{ color: '#388e3c', fontSize: '1.1rem' }}>Task</strong>
                    <span className="info-badge" style={{ background: '#e8f5e9', color: '#388e3c' }}>What to do?</span>
                  </div>
                  <p style={{ margin: '0.5rem 0 0.75rem 0' }}>Clearly state what you want the AI to produce.</p>
                  <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '6px', border: '2px solid #388e3c' }}>
                    <code>Write an article for awareness.</code>
                  </div>
                </div>
              </div>

              <h3>🔄 Contrasting Cases: Learning by Comparison</h3>
              <p>When you use AI, it can generate multiple different responses. Each version may emphasize different aspects, use different vocabulary, or approach the topic from a different angle.</p>
              
              <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: '#FDF6E3', borderRadius: '10px', border: '2px solid #D4A843' }}>
                <strong style={{ color: '#006B3F' }}>💡 Why This Matters:</strong>
                <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                  Comparing multiple responses helps you understand what makes a response effective. 
                  You'll learn to evaluate tone, clarity, completeness, and appropriateness—skills that transfer to your own writing!
                </p>
              </div>

              <h3 style={{ marginTop: '2rem' }}>⚡ Mindful AI Usage: Environmental Impact</h3>
              <div style={{ marginTop: '1rem', padding: '1.5rem', background: '#FDF6E3', borderRadius: '10px', borderLeft: '4px solid #D4A843' }}>
                <p style={{ fontWeight: '500', marginBottom: '1rem' }}>
                  <strong>Did you know?</strong> AI technologies require significant energy and computational resources.
                </p>
                <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                  <li>Training large AI models consumes substantial electricity</li>
                  <li>Each AI generation has an environmental cost</li>
                  <li>Being intentional reduces waste and teaches responsibility</li>
                </ul>
              </div>
              <p style={{ marginTop: '1rem', fontStyle: 'italic' }}>
                That's why we encourage you to <strong>pause and reflect</strong> between generations, 
                carefully consider your prompts, and use AI as a learning tool rather than a quick-answer generator.
              </p>

              <h3 style={{ marginTop: '2rem' }}>🎯 Best Practices</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                <div style={{ padding: '1rem', background: '#ffffff', border: '2px solid #e0e0e0', borderRadius: '6px' }}>
                  <strong style={{ color: '#e53935' }}>❌ Avoid:</strong>
                  <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>"Tell me about photosynthesis"</p>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>Too vague, unclear purpose</p>
                </div>
                <div style={{ padding: '1rem', background: '#ffffff', border: '2px solid #4caf50', borderRadius: '6px' }}>
                  <strong style={{ color: '#388e3c' }}>✅ Good:</strong>
                  <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>"Explain photosynthesis to a 9th grader using analogies and step-by-step how plants convert sunlight into energy"</p>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>Clear role (teacher), context (9th grader), task (explain)</p>
                </div>
              </div>

              <h3 style={{ marginTop: '2rem' }}>🧠 Remember: You're in Control</h3>
              <p>
                AI is a tool—powerful but not perfect. Your role is to <strong>think critically</strong> about responses, 
                <strong> verify information</strong> when needed, and use AI to enhance your learning rather than replace it.
              </p>
              <p style={{ marginTop: '0.5rem' }}>
                The best prompts come from taking time to think about what you really want to learn, not just getting a quick answer.
              </p>

              {!showPractice ? (
                <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#E6F2EC', borderRadius: '8px', border: '2px solid #006B3F', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 1rem 0', fontWeight: '500' }}>
                    💡 Want to try it out?
                  </p>
                  <button onClick={() => setShowPractice(true)} className="button-secondary">
                    Open Interactive Practice
                  </button>
                  <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#666' }}>
                    Or continue to the writing task to apply these principles.
                  </p>
                </div>
              ) : (
                <div style={{ marginTop: '2rem' }}>
                  <div style={{ padding: '1rem', background: '#E6F2EC', borderRadius: '8px', borderLeft: '4px solid #006B3F', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>Tries Available: </strong>
                        {[...Array(practiceTries)].map((_, i) => (
                          <span key={i} style={{ fontSize: '1.2rem', color: '#006B3F' }}>🅱</span>
                        ))}
                      </div>
                      <button onClick={() => setShowPractice(false)} style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                        Close Practice
                      </button>
                    </div>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
                      AI technologies require significant energy. Be mindful and intentional with each generation.
                    </p>
                  </div>

                  <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ padding: '1.25rem', background: '#E6F2EC', borderRadius: '8px' }}>
                      <label>
                        <strong style={{ color: '#006B3F' }}>Role:</strong>
                        <input
                          type="text"
                          value={practicePrompt.role}
                          onChange={(e) => setPracticePrompt({ ...practicePrompt, role: e.target.value })}
                          placeholder="e.g., You are a teacher..."
                          style={{ marginTop: '0.5rem' }}
                        />
                      </label>
                    </div>

                    <div style={{ padding: '1.25rem', background: '#FDF6E3', borderRadius: '8px' }}>
                      <label>
                        <strong style={{ color: '#006B3F' }}>Context:</strong>
                        <textarea
                          value={practicePrompt.context}
                          onChange={(e) => setPracticePrompt({ ...practicePrompt, context: e.target.value })}
                          placeholder="e.g., Students are learning about climate change..."
                          rows={3}
                          style={{ marginTop: '0.5rem' }}
                        />
                      </label>
                    </div>

                    <div style={{ padding: '1.25rem', background: '#e8f5e9', borderRadius: '8px' }}>
                      <label>
                        <strong style={{ color: '#388e3c' }}>Task:</strong>
                        <input
                          type="text"
                          value={practicePrompt.task}
                          onChange={(e) => setPracticePrompt({ ...practicePrompt, task: e.target.value })}
                          placeholder="e.g., Create an engaging lesson plan..."
                          style={{ marginTop: '0.5rem' }}
                        />
                      </label>
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      if (practiceTries > 0) {
                        setPracticeTries(practiceTries - 1);
                        // In a real app, this would call OpenAI API
                        // For demo, we'll just show a success message
                        alert('Prompt submitted! In the real Prompty tool, this would generate 3 contrasting responses for you to compare.');
                      }
                    }}
                    disabled={practiceTries === 0 || !practicePrompt.role || !practicePrompt.context || !practicePrompt.task}
                    style={{ width: '100%' }}
                  >
                    {practiceTries === 0 ? 'No tries remaining' : 'Generate Responses (uses 1 try)'}
                  </button>

                  {practiceTries === 0 && (
                    <p style={{ marginTop: '1rem', textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
                      You've used all your tries. This limitation encourages intentional usage and reflection. 
                      Ready to apply what you've learned to the writing task?
                    </p>
                  )}
                </div>
              )}

              {!showPractice && (
                <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#e8f5e9', borderRadius: '8px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontWeight: '500' }}>
                    🎓 Ready to continue! In the next section, you'll apply these principles to write your own explanation.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <p>This brief lesson focuses on digital literacy: evaluating the credibility of online sources and avoiding plagiarism.</p>
              
              <h3>Key Principles</h3>
              <ul>
                <li><strong>Check sources</strong>: Always verify information with trusted references.</li>
                <li><strong>Avoid copy/paste</strong>: Use your own words and cite when using external ideas.</li>
                <li><strong>Be critical</strong>: Ask who authored the information and for what purpose.</li>
              </ul>

              <h3>Example</h3>
              <p>When evaluating online information, check multiple sources, look for author credentials, and consider the publication date.</p>
            </>
          )}
          
          {!showPractice && (
            <button
              onClick={() => setStage(legacyTwoArm ? 'task' : 'craftIntro')}
              style={{ marginTop: '1.5rem' }}
            >
              {legacyTwoArm ? 'Start Writing Task →' : 'Start Narrative Writing Task →'}
            </button>
          )}
        </div>
      </div>
    );
  }

  async function handleOpenAiMessage() {
    if (!openAiInput.trim()) {
      return;
    }

    const userMessage = openAiInput.trim();

    let systemPrompt: string;
    if (stage === 'craftAI') {
      const def = CRAFT_NARRATIVE_PROMPTS.find((p) => p.id === craftData.selectedPromptId);
      if (!def) {
        setOpenAiError('Missing prompt selection. Go back one step and confirm your prompt.');
        return;
      }
      systemPrompt = craftAiNarrativeChatSystemPrompt(coachArm, def.text);
    } else if (stage === 'craftRevise') {
      systemPrompt = craftRevisionCoachPrompt(
        coachArm,
        craftData.humanNarrative,
        craftData.aiNarrative,
        craftData.revisedNarrative
      );
    } else {
      systemPrompt = `You are a helpful writing assistant helping a student write a 200-250 word explanation for a 9th-grade student about: "${taskData.topic}".

Your role is to:
- Help them brainstorm ideas and structure their explanation
- Provide guidance on clarity and age-appropriateness
- Suggest ways to explain complex concepts simply
- Encourage critical thinking and learning

Do NOT write the explanation for them. Instead, guide them with questions, suggestions, and feedback.`;
    }

    setOpenAiInput('');
    setOpenAiLoading(true);
    setOpenAiError('');

    const newMessages = [...openAiMessages, { role: 'user' as const, content: userMessage }];
    setOpenAiMessages(newMessages);

    try {

      const transcript = newMessages
        .map((m) => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`)
        .join('\n\n');
      const fullPrompt = `${systemPrompt}\n\nConversation:\n${transcript}`;

      const response = await fetch('/api/llm/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
        }),
      });

      const data = (await response.json()) as {
        response?: string;
        model?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          formatOpenAiHelperError(String(data.error || 'Failed to get response from ChatGPT'))
        );
      }

      const assistantText = data.response ?? '';
      setOpenAiMessages([...newMessages, { role: 'assistant' as const, content: assistantText }]);

      chatTurnIndexRef.current += 1;
      void fetch('/api/study/log-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_submission_id: clientSubmissionId,
          study_group: effectiveStudyGroup,
          turn_index: chatTurnIndexRef.current,
          session_profile: buildSessionProfile(),
          user_message: userMessage,
          full_prompt: fullPrompt,
          assistant_response: assistantText,
          model: data.model ?? null,
        }),
      }).catch(() => {});

      if (!taskData.usedAi) {
        setTaskData({ ...taskData, usedAi: true });
      }
    } catch (error) {
      setOpenAiError(
        formatOpenAiHelperError(
          error instanceof Error ? error.message : 'An error occurred'
        )
      );
      setOpenAiMessages(openAiMessages);
    } finally {
      setOpenAiLoading(false);
    }
  }

  function craftNavCard(children: React.ReactNode, title: string, stepNote: string) {
    return (
      <div className="lms-container">
        {renderProgressBar()}
        <div className="lms-card">
          <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>{stepNote}</p>
          <h2>{title}</h2>
          {children}
          <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: '#555', fontStyle: 'italic' }}>
            {CRAFT_ATTRIBUTION}
          </p>
        </div>
      </div>
    );
  }

  function renderCraftIntro() {
    return craftNavCard(
      <>
        <p style={{ marginBottom: '1rem' }}>
          <strong>Lesson question:</strong> How can generative AI support narrative writing in English class? You will compare
          human voice and tone to an AI draft, revise with AI support, and reflect on ethics and creativity — at your own pace.
        </p>
        <h3>Lesson objectives (async)</h3>
        <ul>
          <li>Compare human-written and AI-generated narratives</li>
          <li>Identify strengths and limits of AI drafts (tone, structure, creativity)</li>
          <li>Reflect on ethical use of tools like ChatGPT in creative work</li>
        </ul>
        <h3>Key ideas</h3>
        <p>
          <strong>Narrative writing</strong> · <strong>Generative AI</strong>
        </p>
        <div className="form-group" style={{ background: '#FDF6E3', borderLeftColor: '#D4A843' }}>
          <label>
            <strong>Icebreaker (replacing sticky notes):</strong> What do you already know about using ChatGPT-style tools for writing?
            <textarea
              value={craftData.icebreakerPriorKnowledge}
              onChange={(e) => setCraftData({ ...craftData, icebreakerPriorKnowledge: e.target.value })}
              rows={3}
              placeholder="Brainstorm briefly — e.g. brainstorming, grammar, when it helps or hurts your voice…"
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <p style={{ marginTop: '1rem' }}>
          <strong>Why this matters:</strong> AI can support drafts and editing, but your judgment, voice, and ideas stay central.
          Creative work also raises questions about honesty, originality, and when AI is appropriate.
        </p>
        <button type="button" onClick={() => setStage('craftHuman')} style={{ marginTop: '1rem' }}>
          Continue to Activity 1 — your narrative →
        </button>
      </>,
      'Introduction to Prompt Engineering (~10 min)',
      'Self-paced · ~60 min total if you take your time on writing and reflection'
    );
  }

  function renderCraftHuman() {
    return craftNavCard(
      <>
        <p>
          Choose <strong>one</strong> prompt. Write <strong>1–2 paragraphs</strong> of story (focus on creativity, not perfect
          grammar). This replaces in-class independent writing.
        </p>
        <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
          {CRAFT_NARRATIVE_PROMPTS.map((p) => (
            <label
              key={p.id}
              style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start',
                padding: '0.75rem',
                border:
                  craftData.selectedPromptId === p.id ? '2px solid #006B3F' : '1px solid #ddd',
                borderRadius: '8px',
                cursor: 'pointer',
                background: craftData.selectedPromptId === p.id ? '#E6F2EC' : '#fff',
              }}
            >
              <input
                type="radio"
                name="craft-prompt"
                checked={craftData.selectedPromptId === p.id}
                onChange={() => setCraftData({ ...craftData, selectedPromptId: p.id })}
              />
              <span>
                <strong>{p.label}</strong>
                <br />
                <span style={{ fontSize: '0.9rem', color: '#444' }}>{p.text}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="form-group" style={{ marginTop: '1.25rem' }}>
          <label>
            <strong>Your narrative</strong>
            <textarea
              value={craftData.humanNarrative}
              onChange={(e) => setCraftData({ ...craftData, humanNarrative: e.target.value })}
              rows={10}
              placeholder="Draft your short story here…"
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={!craftData.selectedPromptId || !craftData.humanNarrative.trim()}
          onClick={() => setStage('craftAI')}
        >
          Continue — generate AI version of the same prompt →
        </button>
      </>,
      'Activity 1 · Developing narratives (~15 min)',
      'Human draft first (matches CRAFT Activity 1)'
    );
  }

  function renderCraftAI() {
    const sel = CRAFT_NARRATIVE_PROMPTS.find((p) => p.id === craftData.selectedPromptId);
    return craftNavCard(
      <>
        <p>
          Now use <strong>the same prompt</strong> with generative AI. Use the same <strong>ChatGPT panel</strong> as in other
          activities: have a short conversation, then copy the model&apos;s story into the box below (or edit it) before you continue.
        </p>
        {sel && (
          <div style={{ padding: '1rem', background: '#f5f5f5', borderRadius: '8px', marginTop: '0.75rem' }}>
            <strong>Selected prompt:</strong> {sel.text}
          </div>
        )}
        {!schoolGeminiOnly ? (
          <div
            style={{
              padding: '1.5rem',
              background: '#F7F8F5',
              borderRadius: '10px',
              border: '2px solid #006B3F',
              marginTop: '1rem',
            }}
          >
            <h3 style={{ marginTop: 0, color: '#004F2D' }}>ChatGPT · AI sample narrative</h3>
            <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
              The assistant is given your assignment prompt and your study condition. Ask for feedback or for the sample story; when
              you&apos;re satisfied, use the button below to paste the last reply into the AI story field.
            </p>
            <div
              style={{
                background: '#fff',
                borderRadius: '6px',
                border: '1px solid #e0e0e0',
                maxHeight: '320px',
                display: 'flex',
                flexDirection: 'column',
                marginTop: '0.5rem',
              }}
            >
              <div style={{ padding: '0.75rem', overflowY: 'auto', flex: 1, maxHeight: '220px' }}>
                {openAiMessages.length === 0 ? (
                  <p style={{ color: '#666', fontStyle: 'italic', fontSize: '0.9rem', margin: 0 }}>
                    {coachArm === 0
                      ? 'Example: “Please write the full short story for this prompt.”'
                      : 'Example: “I’m ready — please write the AI sample story (1–2 paragraphs) for this prompt.”'}
                  </p>
                ) : (
                  openAiMessages.map((msg, idx) => (
                    <div key={idx} style={{ marginBottom: '0.75rem' }}>
                      <strong style={{ fontSize: '0.8rem', color: '#666' }}>
                        {msg.role === 'user' ? 'You' : 'ChatGPT'}
                      </strong>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{msg.content}</div>
                    </div>
                  ))
                )}
                {openAiLoading && <em>Thinking…</em>}
              </div>
              {openAiError && (
                <div style={{ padding: '0.5rem', background: '#ffebee', color: '#c62828', fontSize: '0.85rem' }}>
                  {openAiError}
                </div>
              )}
              <div style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem', borderTop: '1px solid #eee' }}>
                <textarea
                  value={openAiInput}
                  onChange={(e) => setOpenAiInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleOpenAiMessage();
                    }
                  }}
                  rows={2}
                  style={{ flex: 1, resize: 'none' }}
                  disabled={openAiLoading}
                  placeholder="Message ChatGPT…"
                />
                <button type="button" disabled={openAiLoading || !openAiInput.trim()} onClick={() => void handleOpenAiMessage()}>
                  Send
                </button>
              </div>
            </div>
            {(() => {
              const lastAssistant = [...openAiMessages].reverse().find((m) => m.role === 'assistant');
              return (
                <button
                  type="button"
                  style={{ marginTop: '0.75rem' }}
                  disabled={!lastAssistant}
                  onClick={() => {
                    if (lastAssistant) {
                      setCraftData((d) => ({ ...d, aiNarrative: lastAssistant.content.trim() }));
                      setTaskData((t) => ({ ...t, usedAi: true }));
                    }
                  }}
                >
                  Use last ChatGPT reply as AI story
                </button>
              );
            })()}
          </div>
        ) : (
          <p style={{ marginTop: '1rem', color: '#666' }}>
            Built-in ChatGPT is off (<code>GEMINI_SCHOOL_ONLY</code>). Use your school tool, then paste the AI story below.
          </p>
        )}
        {schoolGeminiUrl ? (
          <p style={{ marginTop: '0.75rem' }}>
            <a href={schoolGeminiUrl} target="_blank" rel="noopener noreferrer">
              Open school Gemini in a new tab
            </a>
          </p>
        ) : null}
        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label>
            <strong>AI-generated story</strong> (edit if needed)
            <textarea
              value={craftData.aiNarrative}
              onChange={(e) => setCraftData({ ...craftData, aiNarrative: e.target.value })}
              rows={10}
              placeholder="Generated text appears here, or paste from ChatGPT / Gemini…"
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={!craftData.aiNarrative.trim()}
          onClick={() => setStage('craftCompare')}
        >
          Continue to comparison (graphic organizer) →
        </button>
      </>,
      'Activity 1 (continued) · AI narrative',
      'Pair: your draft + AI draft from the same prompt'
    );
  }

  function renderCraftCompare() {
    return craftNavCard(
      <>
        <p>
          <strong>Activity 2 · Graphic organizer (async)</strong> — Compare your piece with the AI&apos;s. In class you might
          share with a partner; here, jot notes as if you were explaining to a partner.
        </p>
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr', marginTop: '1rem' }}>
          <div style={{ padding: '0.75rem', border: '1px solid #ccc', borderRadius: '8px', maxHeight: '200px', overflow: 'auto' }}>
            <strong>Your narrative</strong>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{craftData.humanNarrative || '—'}</p>
          </div>
          <div style={{ padding: '0.75rem', border: '1px solid #ccc', borderRadius: '8px', maxHeight: '200px', overflow: 'auto' }}>
            <strong>AI narrative</strong>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{craftData.aiNarrative || '—'}</p>
          </div>
        </div>
        <div className="form-group">
          <label>
            <strong>Tone & voice — how do the two pieces compare?</strong>
            <textarea
              value={craftData.compareToneVoice}
              onChange={(e) => setCraftData({ ...craftData, compareToneVoice: e.target.value })}
              rows={3}
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <div className="form-group">
          <label>
            <strong>Structure & organization; grammar/spelling observations</strong>
            <textarea
              value={craftData.compareStructureOrg}
              onChange={(e) => setCraftData({ ...craftData, compareStructureOrg: e.target.value })}
              rows={3}
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <div className="form-group">
          <label>
            <strong>Three differences between the two pieces</strong>
            <textarea
              value={craftData.compareThreeDifferences}
              onChange={(e) => setCraftData({ ...craftData, compareThreeDifferences: e.target.value })}
              rows={3}
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <div className="form-group">
          <label>
            <strong>What did you do more effectively than the AI?</strong>
            <textarea
              value={craftData.compareHumanDidBetter}
              onChange={(e) => setCraftData({ ...craftData, compareHumanDidBetter: e.target.value })}
              rows={2}
              placeholder="Your strengths…"
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <div className="form-group">
          <label>
            <strong>What did the AI do better than you?</strong>
            <textarea
              value={craftData.compareAiDidBetter}
              onChange={(e) => setCraftData({ ...craftData, compareAiDidBetter: e.target.value })}
              rows={2}
              placeholder="AI strengths…"
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <div className="form-group">
          <label>
            <strong>Partner-style reflection (optional)</strong> — What might you have said in a turn-and-talk?
            <textarea
              value={craftData.partnerShareReflection}
              onChange={(e) => setCraftData({ ...craftData, partnerShareReflection: e.target.value })}
              rows={3}
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpenAiMessages([]);
            setStage('craftRevise');
          }}
        >
          Continue to revising with AI →
        </button>
      </>,
      'Activity 2 · Compare & reflect (~10 min)',
      'Digital graphic organizer'
    );
  }

  function renderCraftRevise() {
    return craftNavCard(
      <>
        <p>
          <strong>Activity 3 · Revise with AI.</strong> Edit your <em>own</em> narrative below. Use the chat to ask for help
          (clarify details, grammar, richer scenes, length) — try several prompts like the lesson suggests.
        </p>
        {coachArm === 2 ? (
          <div
            className="form-group"
            style={{
              background: '#FDF6E3',
              borderLeft: '4px solid #D4A843',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
            }}
          >
            <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Narrative prompt bank</h4>
            <p style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
              Tap a starter to paste it into the chat below; edit it so it fits your story.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {NARRATIVE_PROMPT_BANK.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="button-secondary"
                  onClick={() => setOpenAiInput(item.template)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="form-group">
          <label>
            <strong>Your revised narrative</strong>
            <textarea
              value={craftData.revisedNarrative}
              onChange={(e) => setCraftData({ ...craftData, revisedNarrative: e.target.value })}
              rows={10}
              placeholder="Start from your original draft and revise here. You can paste AI-suggested text only where you choose…"
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <p style={{ fontSize: '0.9rem' }}>Quick prompt ideas:</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {CRAFT_REVISION_SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="button-secondary" onClick={() => setOpenAiInput(s)}>
              {s}
            </button>
          ))}
        </div>
        {!schoolGeminiOnly ? (
          <div
            style={{
              padding: '1.5rem',
              background: '#F7F8F5',
              borderRadius: '10px',
              border: '2px solid #006B3F',
              marginTop: '1rem',
            }}
          >
            <h3 style={{ marginTop: 0, color: '#004F2D' }}>ChatGPT · revision chat</h3>
            <p style={{ fontSize: '0.9rem' }}>
              The assistant sees your human draft, the AI comparison draft, and your revision box. Ask step by step.
            </p>
            <div
              style={{
                background: '#fff',
                borderRadius: '6px',
                border: '1px solid #e0e0e0',
                maxHeight: '280px',
                display: 'flex',
                flexDirection: 'column',
                marginTop: '0.5rem',
              }}
            >
              <div style={{ padding: '0.75rem', overflowY: 'auto', flex: 1, maxHeight: '200px' }}>
                {openAiMessages.map((msg, idx) => (
                  <div key={idx} style={{ marginBottom: '0.75rem' }}>
                    <strong style={{ fontSize: '0.8rem', color: '#666' }}>
                      {msg.role === 'user' ? 'You' : 'ChatGPT'}
                    </strong>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{msg.content}</div>
                  </div>
                ))}
                {openAiLoading && <em>Thinking…</em>}
              </div>
              {openAiError && (
                <div style={{ padding: '0.5rem', background: '#ffebee', color: '#c62828', fontSize: '0.85rem' }}>
                  {openAiError}
                </div>
              )}
              <div style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem', borderTop: '1px solid #eee' }}>
                <textarea
                  value={openAiInput}
                  onChange={(e) => setOpenAiInput(e.target.value)}
                  rows={2}
                  style={{ flex: 1, resize: 'none' }}
                  disabled={openAiLoading}
                  placeholder="Ask for a targeted revision…"
                />
                <button type="button" disabled={openAiLoading || !openAiInput.trim()} onClick={() => void handleOpenAiMessage()}>
                  Send
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
          <strong>Reflection (pair discussion — solo):</strong> What improved after AI help? How do you feel about those
          changes?
        </p>
        <button type="button" onClick={() => setStage('craftReflect')} style={{ marginTop: '1rem' }}>
          Continue to whole-class-style discussion prompts →
        </button>
      </>,
      'Activity 3 · Revise with AI (~10 min)',
      'Iterate like in-class guided exploration'
    );
  }

  function renderCraftReflect() {
    return craftNavCard(
      <>
        <p>
          <strong>Activity 4 · Discussion</strong> (async — respond as you would in a circle)
        </p>
        <div className="form-group">
          <label>
            <strong>Strengths of using ChatGPT-style tools for narrative writing?</strong>
            <textarea
              value={craftData.discussStrengths}
              onChange={(e) => setCraftData({ ...craftData, discussStrengths: e.target.value })}
              rows={3}
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <div className="form-group">
          <label>
            <strong>Limitations you noticed?</strong>
            <textarea
              value={craftData.discussLimitations}
              onChange={(e) => setCraftData({ ...craftData, discussLimitations: e.target.value })}
              rows={3}
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <div className="form-group">
          <label>
            <strong>How much of your original ideas stayed in the revised piece vs how much felt AI-driven?</strong>
            <textarea
              value={craftData.discussOriginalVsAi}
              onChange={(e) => setCraftData({ ...craftData, discussOriginalVsAi: e.target.value })}
              rows={3}
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <div className="form-group">
          <label>
            <strong>How can AI support your writing without replacing your creativity?</strong>
            <textarea
              value={craftData.discussBalanceCreativity}
              onChange={(e) => setCraftData({ ...craftData, discussBalanceCreativity: e.target.value })}
              rows={3}
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <button type="button" onClick={() => setStage('craftExit')}>
          Continue to exit ticket →
        </button>
      </>,
      'Activity 4 · Reflect (~10 min)',
      'Whole-group prompts in writing'
    );
  }

  function renderCraftExit() {
    return craftNavCard(
      <>
        <p>
          <strong>Exit ticket & commitment (~5 min)</strong>
        </p>
        <div className="form-group">
          <label>
            <strong>Two benefits of using AI to support narrative writing</strong>
            <textarea
              value={craftData.exitBenefits}
              onChange={(e) => setCraftData({ ...craftData, exitBenefits: e.target.value })}
              rows={3}
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <div className="form-group">
          <label>
            <strong>Two challenges or risks</strong>
            <textarea
              value={craftData.exitChallenges}
              onChange={(e) => setCraftData({ ...craftData, exitChallenges: e.target.value })}
              rows={3}
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <div className="form-group">
          <label>
            <strong>Personal commitment</strong> — How will you use AI for writing? What will you <em>not</em> outsource (e.g.
            voice, emotional truth)?
            <textarea
              value={craftData.commitmentStatement}
              onChange={(e) => setCraftData({ ...craftData, commitmentStatement: e.target.value })}
              rows={4}
              placeholder='Example: "I will use AI for grammar feedback, not for inventing my plot."'
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>
        <div className="form-group" style={{ background: '#f9f9f9' }}>
          <label>
            <strong>Optional extension · “How-to” guide</strong> (homework-style)
            <textarea
              value={craftData.optionalHowToGuide}
              onChange={(e) => setCraftData({ ...craftData, optionalHowToGuide: e.target.value })}
              rows={4}
              placeholder="Steps, pitfalls, what humans do better, best AI supports…"
              style={{ marginTop: '0.5rem' }}
            />
          </label>
        </div>

        <div
          style={{
            marginTop: '1.5rem',
            padding: '1.25rem',
            background: '#FDF6E3',
            borderRadius: '10px',
            border: '2px solid #D4A843',
          }}
        >
          <h3 style={{ color: '#006B3F', marginTop: 0, marginBottom: '0.75rem' }}>
            Optional: GPT-5 Lottery
          </h3>
          <p style={{ marginBottom: '0.75rem' }}>
            You can choose to enter the lottery before submitting your responses.
          </p>
          <div className="form-group" style={{ background: '#ffffff', borderLeftColor: '#D4A843', marginBottom: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={lotteryOptIn}
                onChange={(e) => setLotteryOptIn(e.target.checked)}
                style={{ marginRight: '0.75rem', cursor: 'pointer' }}
              />
              <span>Yes, enter me in the GPT-5 lottery</span>
            </label>
          </div>
          {lotteryOptIn ? (
            <div className="form-group" style={{ background: '#ffffff', borderLeftColor: '#D4A843', marginBottom: 0 }}>
              <label>
                <strong>Participant Number (from your 950 ID):</strong>
                <input
                  type="text"
                  value={participantNumber}
                  onChange={(e) => setParticipantNumber(e.target.value)}
                  placeholder="e.g., 95053492"
                  style={{ marginTop: '0.5rem' }}
                />
              </label>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setStage(legacyTwoArm ? 'complete' : 'postAssess')}
          disabled={lotteryOptIn && !participantNumber.trim()}
          style={{ marginTop: '1rem' }}
        >
          {legacyTwoArm ? 'Submit study →' : 'Continue to post-test →'}
        </button>
      </>,
      'Exit ticket & commitment',
      'Final step — submit your responses'
    );
  }

  function renderTask() {
    return (
      <div className="lms-container">
        {renderProgressBar()}
        <div className="lms-card">
          <h2>Writing Task</h2>
          <p>Select a topic below and write a 200–250 word explanation for a 9th‑grade student. You may use AI, but you must disclose how you used it.</p>

          {schoolGeminiUrl ? (
            <div
              style={{
                marginTop: '1.5rem',
                marginBottom: '1.5rem',
                padding: '1.25rem',
                background: '#FDF6E3',
                borderRadius: '10px',
                border: '2px solid #D4A843',
              }}
            >
              <h3 style={{ margin: '0 0 0.5rem', color: '#006B3F', fontSize: '1.05rem' }}>School Gemini (optional)</h3>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#333' }}>
                If your class uses Google&apos;s Gemini in the browser, open it in a new tab with your school account.
              </p>
              <a
                href={schoolGeminiUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  padding: '0.5rem 1rem',
                  background: '#006B3F',
                  color: '#fff',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                }}
              >
                Open school Gemini in a new tab
              </a>
            </div>
          ) : null}

          {schoolGeminiOnly && !schoolGeminiUrl ? (
            <div
              role="alert"
              style={{
                marginTop: '1rem',
                padding: '1rem',
                background: '#FDF6E3',
                border: '1px solid #D4A843',
                borderRadius: '8px',
                marginBottom: '1rem',
                fontSize: '0.9rem',
              }}
            >
              <strong>School Gemini URL not configured.</strong> Ask your teacher to set{' '}
              <code>NEXT_PUBLIC_SCHOOL_GEMINI_URL</code> in the app environment, or set{' '}
              <code>NEXT_PUBLIC_GEMINI_SCHOOL_ONLY=false</code> to use the built-in ChatGPT assistant instead.
            </div>
          ) : null}

          {!schoolGeminiOnly && (
            <div
              style={{
                marginTop: '1.5rem',
                marginBottom: '1.5rem',
                padding: '1.5rem',
                background: '#F7F8F5',
                borderRadius: '10px',
                border: '2px solid #006B3F',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '1.5rem', marginRight: '0.5rem' }}>🤖</span>
                <h3 style={{ margin: 0, color: '#004F2D' }}>ChatGPT writing assistant</h3>
              </div>
              <p style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>
                Ask for brainstorming, structure, and feedback. The model is instructed not to write your explanation for you — only to
                guide you. Think critically about any suggestions.
              </p>

              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '6px',
                  border: '1px solid #e0e0e0',
                  maxHeight: '400px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    padding: '1rem',
                    borderBottom: '1px solid #e0e0e0',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    flex: 1,
                  }}
                >
                  {openAiMessages.length === 0 ? (
                    <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', margin: '2rem 0' }}>
                      Start a conversation. Your topic is used in the instructions sent with each message.
                    </p>
                  ) : (
                    openAiMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        style={{
                          marginBottom: '1rem',
                          padding: '0.75rem',
                          background: msg.role === 'user' ? '#E6F2EC' : '#f5f5f5',
                          borderRadius: '6px',
                          borderLeft: `3px solid ${msg.role === 'user' ? '#006B3F' : '#888'}`,
                        }}
                      >
                        <strong style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#666' }}>
                          {msg.role === 'user' ? 'You' : 'ChatGPT'}
                        </strong>
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{msg.content}</div>
                      </div>
                    ))
                  )}
                  {openAiLoading && (
                    <div style={{ padding: '0.75rem', color: '#666', fontStyle: 'italic' }}>ChatGPT is thinking...</div>
                  )}
                </div>

                {openAiError && (
                  <div
                    style={{
                      padding: '0.75rem',
                      background: '#ffebee',
                      color: '#c62828',
                      borderTop: '1px solid #e0e0e0',
                      fontSize: '0.875rem',
                    }}
                  >
                    Error: {openAiError}
                  </div>
                )}

                <div
                  style={{
                    padding: '0.75rem',
                    borderTop: '1px solid #e0e0e0',
                    display: 'flex',
                    gap: '0.5rem',
                  }}
                >
                  <textarea
                    value={openAiInput}
                    onChange={(e) => setOpenAiInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleOpenAiMessage();
                      }
                    }}
                    placeholder="Ask for help with your explanation..."
                    rows={2}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px',
                      resize: 'none',
                      fontFamily: 'inherit',
                    }}
                    disabled={openAiLoading}
                  />
                  <button
                    onClick={handleOpenAiMessage}
                    disabled={openAiLoading || !openAiInput.trim()}
                    style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}
                  >
                    {openAiLoading ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="form-group">
            <label>
              <strong>Select Topic:</strong>
              <select
                value={taskData.topic}
                onChange={(e) => setTaskData({ ...taskData, topic: e.target.value })}
              >
                {topics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>Prompt(s) used (if any):</strong>
              <textarea
                value={taskData.prompts}
                onChange={(e) => setTaskData({ ...taskData, prompts: e.target.value })}
                rows={3}
                placeholder="Paste any prompts you used with AI tools here..."
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>Your explanation (200–250 words):</strong>
              <textarea
                value={taskData.explanation}
                onChange={(e) => setTaskData({ ...taskData, explanation: e.target.value })}
                rows={8}
                placeholder="Write your explanation here..."
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>AI Use Disclosure:</strong>
            </label>
            <div className="checkbox-group">
              <div className="checkbox-item">
                <label style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={taskData.usedAi}
                    onChange={(e) => setTaskData({ ...taskData, usedAi: e.target.checked })}
                  />
                  I used AI tools for brainstorming or drafting
                </label>
              </div>
              <div className="checkbox-item">
                <label style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={taskData.editedAi}
                    onChange={(e) => setTaskData({ ...taskData, editedAi: e.target.checked })}
                  />
                  I edited and rewrote AI text in my own words
                </label>
              </div>
              <div className="checkbox-item">
                <label style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={taskData.verified}
                    onChange={(e) => setTaskData({ ...taskData, verified: e.target.checked })}
                  />
                  I verified AI information with another source
                </label>
              </div>
              <div className="checkbox-item">
                <label style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={taskData.cited}
                    onChange={(e) => setTaskData({ ...taskData, cited: e.target.checked })}
                  />
                  I cited or acknowledged AI assistance
                </label>
              </div>
            </div>
          </div>

          <button onClick={() => setStage("postSurvey")}>
            Continue to Post‑Survey →
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Modern-flow renderers: pre/post assessment + interactive module     */
  /* ------------------------------------------------------------------ */

  function renderAssessment(phase: 'pre' | 'post') {
    const isPre = phase === 'pre';
    const a = isPre ? preAssessment : postAssessment;
    const setA = isPre ? setPreAssessment : setPostAssessment;
    const heading = isPre
      ? 'Pre-test: AI prompt knowledge'
      : 'Post-test: AI prompt knowledge';
    const intro = isPre
      ? "Before you start, we'd like to measure what you already know about using AI for learning. This takes about 8-10 minutes. There are no right or wrong answers; we only use this data for the study."
      : "Now that the activity is done, please answer the same kinds of questions one more time. This helps us measure what, if anything, changed. Answer honestly based on what you now think.";

    const allTfAnswered = TF_ITEMS.every(
      (it) => a.tf[it.id] === true || a.tf[it.id] === false
    );
    const allLikertAnswered = LIKERT_CONFIDENCE_ITEMS.every(
      (it) => (a.likert[it.id] ?? 0) > 0
    );
    const canAdvance = allTfAnswered && allLikertAnswered;

    return (
      <div className="lms-container">
        {renderProgressBar()}
        <div className="lms-card">
          <h2>{heading}</h2>
          <p>{intro}</p>

          <h3 style={{ marginTop: '1.5rem' }}>Part 1 — True/False</h3>
          <p style={{ fontSize: '0.9rem', color: '#555' }}>
            Decide whether each statement is True or False based on what you believe is the best way to use AI for schoolwork.
          </p>
          {TF_ITEMS.map((item) => (
            <div className="form-group" key={`${phase}-${item.id}`} style={{ marginBottom: '1rem' }}>
              <p style={{ marginBottom: '0.5rem' }}>
                <strong>{item.statement}</strong>
              </p>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {[true, false].map((val) => (
                  <label
                    key={String(val)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.25rem 0.75rem',
                      border: '1px solid #d0d0d0',
                      borderRadius: '6px',
                      background: a.tf[item.id] === val ? '#E6F2EC' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name={`${phase}-${item.id}`}
                      checked={a.tf[item.id] === val}
                      onChange={() =>
                        setA({ ...a, tf: { ...a.tf, [item.id]: val } })
                      }
                    />
                    {val ? 'True' : 'False'}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <h3 style={{ marginTop: '1.5rem' }}>Part 2 — Short written responses</h3>
          {OE_ITEMS.map((item) => (
            <div className="form-group" key={`${phase}-${item.id}`}>
              <label>
                <strong>{item.label}</strong>
                <p style={{ whiteSpace: 'pre-wrap', margin: '0.4rem 0 0.6rem 0', fontSize: '0.95rem', color: '#333' }}>
                  {item.instructions}
                </p>
                <textarea
                  value={a.oe[item.id] ?? ''}
                  onChange={(e) => setA({ ...a, oe: { ...a.oe, [item.id]: e.target.value } })}
                  rows={5}
                  placeholder="Type your response here..."
                />
              </label>
            </div>
          ))}

          <h3 style={{ marginTop: '1.5rem' }}>Part 3 — Factuality check (3 items)</h3>
          <p style={{ fontSize: '0.9rem', color: '#555' }}>
            For each item, an AI has produced a short study note. Each one contains at least one factual error. For each item: (a) describe the factual error you see, and (b) write the single verification prompt you would send back to the AI to correct it.
          </p>
          {HALLUCINATION_ITEMS.map((item, idx) => (
            <div
              key={`${phase}-${item.id}`}
              className="form-group"
              style={{ background: '#FDF6E3', borderLeftColor: '#D4A843' }}
            >
              <p style={{ marginTop: 0, marginBottom: '0.4rem', fontWeight: 600 }}>
                Item {idx + 1} — {item.topic}
              </p>
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #e0d6b6',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  marginBottom: '0.75rem',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {item.aiResponse}
              </div>
              <label>
                <strong>Factual error(s) you see</strong>
                <textarea
                  rows={3}
                  placeholder="Describe what is wrong and what the correct information should be."
                  value={a.hallucination[item.id]?.flaggedError ?? ''}
                  onChange={(e) =>
                    setA({
                      ...a,
                      hallucination: {
                        ...a.hallucination,
                        [item.id]: {
                          flaggedError: e.target.value,
                          correctionPrompt: a.hallucination[item.id]?.correctionPrompt ?? '',
                        },
                      },
                    })
                  }
                />
              </label>
              <label style={{ marginTop: '0.5rem', display: 'block' }}>
                <strong>Your verification prompt</strong>
                <textarea
                  rows={3}
                  placeholder="Write the single prompt you would send back to the AI to verify and correct its claims."
                  value={a.hallucination[item.id]?.correctionPrompt ?? ''}
                  onChange={(e) =>
                    setA({
                      ...a,
                      hallucination: {
                        ...a.hallucination,
                        [item.id]: {
                          flaggedError: a.hallucination[item.id]?.flaggedError ?? '',
                          correctionPrompt: e.target.value,
                        },
                      },
                    })
                  }
                />
              </label>
            </div>
          ))}

          <h3 style={{ marginTop: '1.5rem' }}>Part 4 — Confidence ratings</h3>
          <p style={{ fontSize: '0.9rem', color: '#555' }}>
            1 = Strongly Disagree, 5 = Strongly Agree.
          </p>
          {LIKERT_CONFIDENCE_ITEMS.map((item) => (
            <div className="form-group" key={`${phase}-${item.id}`}>
              <label>
                <strong>{item.prompt}</strong>
                {renderLikert(
                  a.likert[item.id] ?? 0,
                  (v) => setA({ ...a, likert: { ...a.likert, [item.id]: v } }),
                  `${phase}-${item.id}`
                )}
              </label>
            </div>
          ))}

          {!canAdvance ? (
            <p style={{ fontSize: '0.85rem', color: '#8B7230' }}>
              Please answer every True/False item and every confidence rating before continuing.
            </p>
          ) : null}

          <button
            disabled={!canAdvance}
            onClick={() => {
              if (isPre) {
                setStage(twoArmCondition === 'treatment' ? 'modulePractice' : 'module');
              } else {
                setStage('complete');
              }
            }}
          >
            {isPre
              ? twoArmCondition === 'treatment'
                ? 'Continue to interactive module →'
                : 'Continue to reading →'
              : 'Submit study →'}
          </button>
        </div>
      </div>
    );
  }

  /**
   * Interactive 3-scenario module (treatment arm only).
   * Implements the Xiao et al. (2025) 4-step pipeline per scenario:
   *   (1) scenario intro + goal
   *   (2) student writes a prompt (and for S3, flags errors + correction prompt)
   *   (3) AI response (live, prescripted-first, or fully prescripted)
   *   (4) auto-grade per rubric dimension + elaborated feedback
   * Students may re-attempt; advance is gated by `minAttemptsBeforeAdvance`.
   */
  async function handleSubmitModuleAttempt() {
    const scenario = MODULE_SCENARIOS[moduleScenarioIdx];
    if (!scenario) return;
    const trimmed = modulePromptDraft.trim();
    if (!trimmed) {
      setModuleError('Please write a prompt before submitting.');
      return;
    }
    setModuleError('');
    setModuleBusy(true);

    const startedAt = moduleScenarioStartRef.current;
    const submittedAt = new Date().toISOString();
    const msElapsed = Date.now() - startedAt;

    try {
      let aiResponse = '';
      const priorAttempts = moduleState[scenario.id]?.attempts ?? [];

      if (scenario.aiResponseMode === 'live') {
        const res = await fetch('/api/llm/openai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: trimmed,
          }),
        });
        const data = (await res.json()) as { response?: string; error?: string };
        if (!res.ok) throw new Error(data.error || 'AI call failed');
        aiResponse = data.response ?? '';
      } else if (scenario.aiResponseMode === 'iteration_prescripted_first') {
        if (priorAttempts.length === 0) {
          aiResponse = scenario.firstAiResponse ?? '';
        } else {
          const res = await fetch('/api/llm/openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: trimmed,
            }),
          });
          const data = (await res.json()) as { response?: string; error?: string };
          if (!res.ok) throw new Error(data.error || 'AI call failed');
          aiResponse = data.response ?? '';
        }
      } else {
        aiResponse = scenario.prescriptedAiResponse ?? '';
      }

      const gradeRes = await fetch('/api/score/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          scenarioId: scenario.id,
        }),
      });
      const gradeData = (await gradeRes.json()) as {
        verdicts?: Record<
          RubricDimensionId,
          { pass: boolean; explanation: string }
        >;
        error?: string;
      };

      const attempt: ModuleAttempt = {
        prompt: trimmed,
        aiResponse,
        autoGrade: gradeRes.ok && gradeData.verdicts ? gradeData.verdicts : null,
        gradingStatus: gradeRes.ok && gradeData.verdicts ? 'graded' : 'error',
        gradingError: gradeRes.ok ? undefined : gradeData.error || `Grader failed (${gradeRes.status})`,
        msElapsed,
        submittedAt,
      };

      let detection = moduleState[scenario.id]?.detection;
      if (scenario.id === 's3_verification') {
        const flaggedErrorsText = moduleFlaggedDraft.trim();
        const correctionPrompt = moduleCorrectionDraft.trim();
        const detectionResults = gradeDetection(
          flaggedErrorsText,
          scenario.plantedErrors ?? []
        );
        detection = {
          flaggedErrors: flaggedErrorsText,
          correctionPrompt,
          detectedErrorIds: detectionResults.filter((r) => r.detected).map((r) => r.errorId),
        };
      }

      setModuleState((prev) => ({
        ...prev,
        [scenario.id]: {
          ...prev[scenario.id],
          attempts: [...priorAttempts, attempt],
          detection,
        },
      }));
    } catch (e) {
      setModuleError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setModuleBusy(false);
    }
  }

  function advanceModule() {
    const scenario = MODULE_SCENARIOS[moduleScenarioIdx];
    if (!scenario) return;
    setModuleState((prev) => ({
      ...prev,
      [scenario.id]: { ...prev[scenario.id], completed: true },
    }));
    if (moduleScenarioIdx < MODULE_SCENARIOS.length - 1) {
      setModuleScenarioIdx(moduleScenarioIdx + 1);
      setModulePromptDraft('');
      setModuleFlaggedDraft('');
      setModuleCorrectionDraft('');
      setModuleError('');
      moduleScenarioStartRef.current = Date.now();
    } else {
      setStage('craftIntro');
    }
  }

  function renderModulePractice() {
    const scenario = MODULE_SCENARIOS[moduleScenarioIdx];
    if (!scenario) return null;
    const st = moduleState[scenario.id];
    const attempts = st?.attempts ?? [];
    const latest = attempts[attempts.length - 1];
    const attemptCount = attempts.length;
    const canAdvance = attemptCount >= scenario.minAttemptsBeforeAdvance;

    return (
      <div className="lms-container">
        {renderProgressBar()}
        <div className="lms-card">
          <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.3rem' }}>
            Scenario {scenario.order} of {MODULE_SCENARIOS.length} · {scenario.navLabel}
          </p>
          <h2>{scenario.title}</h2>
          <p style={{ fontStyle: 'italic', color: '#555' }}>{scenario.oneLiner}</p>

          <div
            style={{
              background: '#F7F6F1',
              border: '1px solid #E0DCCF',
              borderRadius: '8px',
              padding: '1rem',
              margin: '1rem 0',
              whiteSpace: 'pre-wrap',
            }}
          >
            {scenario.context}
          </div>

          <div style={{ background: '#E6F2EC', borderLeft: '4px solid #006B3F', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem' }}>
            <strong>Your goal:</strong> {scenario.studentGoal}
          </div>

          {scenario.id === 's3_verification' ? (
            <div className="form-group">
              <label>
                <strong>Flag the factual errors in the AI summary above</strong>
                <p style={{ fontSize: '0.85rem', color: '#555', margin: '0.25rem 0 0.5rem 0' }}>
                  {scenario.detectionInstructions}
                </p>
                <textarea
                  rows={5}
                  value={moduleFlaggedDraft}
                  onChange={(e) => setModuleFlaggedDraft(e.target.value)}
                  placeholder="Write one error per line. Be concrete."
                />
              </label>
            </div>
          ) : null}

          <div className="form-group">
            <label>
              <strong>Your prompt (attempt {attemptCount + 1})</strong>
              <p style={{ fontSize: '0.85rem', color: '#555', margin: '0.25rem 0 0.5rem 0' }}>
                {scenario.promptInstructions}
              </p>
              <textarea
                rows={6}
                value={modulePromptDraft}
                onChange={(e) => setModulePromptDraft(e.target.value)}
                placeholder="Write the prompt you would send to the AI..."
              />
            </label>
          </div>

          {scenario.id === 's3_verification' ? (
            <div className="form-group">
              <label>
                <strong>Note: for this scenario, treat the prompt above as your verification prompt.</strong>
                <p style={{ fontSize: '0.85rem', color: '#555', margin: '0.25rem 0 0.5rem 0' }}>
                  Your prompt will be auto-graded on the same rubric dimensions. Your error list (above) is graded separately against our ground truth.
                </p>
                <textarea
                  rows={2}
                  value={moduleCorrectionDraft}
                  onChange={(e) => setModuleCorrectionDraft(e.target.value)}
                  placeholder="(Optional) Any notes on why you wrote the prompt this way."
                />
              </label>
            </div>
          ) : null}

          {moduleError ? (
            <p style={{ color: '#c62828', marginTop: '0.5rem' }}>{moduleError}</p>
          ) : null}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <button
              type="button"
              disabled={moduleBusy || !modulePromptDraft.trim()}
              onClick={() => void handleSubmitModuleAttempt()}
            >
              {moduleBusy ? 'Submitting…' : attemptCount === 0 ? 'Submit prompt →' : 'Submit revised prompt →'}
            </button>
            <button
              type="button"
              onClick={advanceModule}
              disabled={!canAdvance || moduleBusy}
              style={{ background: canAdvance ? '#006B3F' : '#a8c8b6' }}
              title={
                canAdvance
                  ? 'Advance to the next scenario'
                  : `You must make at least ${scenario.minAttemptsBeforeAdvance} attempt${scenario.minAttemptsBeforeAdvance === 1 ? '' : 's'} before advancing.`
              }
            >
              {moduleScenarioIdx < MODULE_SCENARIOS.length - 1
                ? 'Advance to next scenario →'
                : 'Finish module & start writing task →'}
            </button>
          </div>

          {latest ? (
            <div
              style={{
                marginTop: '1.5rem',
                padding: '1rem',
                background: '#F6FAFF',
                border: '1px solid #cfe0f5',
                borderRadius: '8px',
              }}
            >
              <h3 style={{ marginTop: 0 }}>AI response (attempt {attemptCount})</h3>
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #dce6f2',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  whiteSpace: 'pre-wrap',
                  marginBottom: '0.75rem',
                }}
              >
                {latest.aiResponse || '(no response)'}
              </div>

              <h3 style={{ marginTop: '0.5rem' }}>Per-dimension feedback on your prompt</h3>
              {latest.gradingStatus === 'error' ? (
                <p style={{ color: '#c62828' }}>
                  Grader error: {latest.gradingError || 'unknown'}. You can submit another attempt.
                </p>
              ) : latest.autoGrade ? (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {scenario.applicableDimensions.map((dimId) => {
                    const dim = RUBRIC_DIMENSIONS.find((d) => d.id === dimId);
                    const verdict = latest.autoGrade?.[dimId];
                    if (!dim || !verdict) return null;
                    const pass = verdict.pass;
                    return (
                      <div
                        key={dimId}
                        style={{
                          background: pass ? '#E6F2EC' : '#FDECEC',
                          border: `1px solid ${pass ? '#9ac4ae' : '#f0b4b4'}`,
                          padding: '0.6rem 0.75rem',
                          borderRadius: '6px',
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>
                          {pass ? '✓' : '✗'} {dim.label}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: '#333', marginTop: '0.2rem' }}>
                          {verdict.explanation}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p>Grading…</p>
              )}

              {scenario.id === 's3_verification' && st?.detection ? (
                <div style={{ marginTop: '0.75rem' }}>
                  <h3>Error-detection results</h3>
                  <p style={{ fontSize: '0.9rem', color: '#555' }}>
                    You detected {st.detection.detectedErrorIds.length} of {(scenario.plantedErrors ?? []).length} planted errors.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.75rem' }}>
              After you submit, your AI response and per-dimension feedback will appear here.
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderPostSurvey() {
    return (
      <div className="lms-container">
        {renderProgressBar()}
        <div className="lms-card">
          <h2>Post‑Survey</h2>
          <p>Please rate your agreement with each statement about your AI use in this activity (1=Strongly Disagree, 5=Strongly Agree).</p>

          <div className="form-group">
            <label>
              <strong>I feel more confident writing effective AI prompts.</strong>
              {renderLikert(postResponses.q1, (v) => setPostResponses({ ...postResponses, q1: v }), "post-q1")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>I now ask AI for explanations or reasoning rather than just answers.</strong>
              {renderLikert(postResponses.q2, (v) => setPostResponses({ ...postResponses, q2: v }), "post-q2")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>The activity helped me understand how to learn with AI more effectively.</strong>
              {renderLikert(postResponses.q3, (v) => setPostResponses({ ...postResponses, q3: v }), "post-q3")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>I now think more critically about AI responses.</strong>
              {renderLikert(postResponses.q4, (v) => setPostResponses({ ...postResponses, q4: v }), "post-q4")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>I understand how to use AI ethically for schoolwork.</strong>
              {renderLikert(postResponses.q5, (v) => setPostResponses({ ...postResponses, q5: v }), "post-q5")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>Describe one example of how you changed your prompting after this activity.</strong>
              <textarea
                value={postResponses.open1}
                onChange={(e) => setPostResponses({ ...postResponses, open1: e.target.value })}
                rows={3}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>How did this lesson change the way you approach learning or writing?</strong>
              <textarea
                value={postResponses.open2}
                onChange={(e) => setPostResponses({ ...postResponses, open2: e.target.value })}
                rows={3}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>Do you think all students should learn prompt engineering? Why or why not?</strong>
              <textarea
                value={postResponses.open3}
                onChange={(e) => setPostResponses({ ...postResponses, open3: e.target.value })}
                rows={3}
              />
            </label>
          </div>

          <button onClick={() => setStage("complete")}>
            Complete Study →
          </button>
        </div>
      </div>
    );
  }

  function renderComplete() {
    return (
      <div className="lms-container">
        {renderProgressBar()}
        <div className="lms-card">
          <h2 style={{ color: '#27ae60', marginBottom: '1rem' }}>✓ Thank You!</h2>
          <p>Your responses have been recorded anonymously.</p>

          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.9rem',
              background:
                saveStatus === 'error' ? '#ffebee' : saveStatus === 'saved' ? '#e8f5e9' : '#f5f5f5',
              color: saveStatus === 'error' ? '#c62828' : '#333',
              border: `1px solid ${saveStatus === 'error' ? '#ef9a9a' : saveStatus === 'saved' ? '#a5d6a7' : '#e0e0e0'}`,
            }}
          >
            {saveStatus === 'saving' && <span>Saving responses…</span>}
            {saveStatus === 'saved' && <span>{saveMessage}</span>}
            {saveStatus === 'error' && (
              <span>
                {saveMessage}{' '}
                <button type="button" onClick={() => void flushSubmission()} style={{ marginLeft: '0.5rem' }}>
                  Retry
                </button>
              </span>
            )}
            {saveStatus === 'idle' && <span>Preparing save…</span>}
          </div>
          
          <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#E6F2EC', borderRadius: '10px', borderLeft: '4px solid #006B3F', textAlign: 'center' }}>
            <p style={{ margin: 0, fontWeight: '500' }}>Your participation helps advance educational research on AI literacy. Thank you!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {canGoBack ? (
        <button
          type="button"
          className="floating-back-button"
          onClick={goToPreviousStage}
        >
          Back
        </button>
      ) : null}
      <div className="lms-header">
        <h1>✨ Prompty+</h1>
      </div>
      {stage === "consent" && renderConsent()}
      {stage === "preSurvey" && renderPreSurvey()}
      {stage === "preAssess" && renderAssessment('pre')}
      {stage === "module" && renderModule()}
      {stage === "modulePractice" && renderModulePractice()}
      {stage === "task" && renderTask()}
      {stage === "craftIntro" && renderCraftIntro()}
      {stage === "craftHuman" && renderCraftHuman()}
      {stage === "craftAI" && renderCraftAI()}
      {stage === "craftCompare" && renderCraftCompare()}
      {stage === "craftRevise" && renderCraftRevise()}
      {stage === "craftReflect" && renderCraftReflect()}
      {stage === "craftExit" && renderCraftExit()}
      {stage === "postSurvey" && renderPostSurvey()}
      {stage === "postAssess" && renderAssessment('post')}
      {stage === "complete" && renderComplete()}
    </div>
  );
}
