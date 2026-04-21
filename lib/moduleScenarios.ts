/**
 * Interactive learning-by-doing module scenarios.
 *
 * Each scenario follows the Xiao et al. (2025) pipeline:
 *   scenario intro -> student writes prompt -> AI response -> auto-grade -> revise or advance
 *
 * Scenarios map 1:1 onto the three RQ pillars:
 *   S1 Ethical use (anti-substitutive)   -> RQ1
 *   S2 Iteration (refine a weak AI reply) -> RQ2
 *   S3 Verification (hallucination detection + correction) -> RQ3
 *
 * Rubric dimensions are ported from Xiao et al. (2025) Table 1. Each prompt is
 * scored per-dimension on a binary True/False basis by app/api/score/prompt.
 */

export type RubricDimensionId =
  | 'relevance'
  | 'clarity_of_purpose'
  | 'conciseness'
  | 'background'
  | 'request_elaboration'
  | 'not_seeking_direct_response';

export interface RubricDimension {
  id: RubricDimensionId;
  label: string;
  /** Prose used inside the auto-grader system prompt to define PASS. */
  definition: string;
  /** Concrete positive example used for few-shot grounding. */
  positiveExample: string;
  /** Concrete negative example used for few-shot grounding. */
  negativeExample: string;
}

export const RUBRIC_DIMENSIONS: RubricDimension[] = [
  {
    id: 'relevance',
    label: 'Relevance',
    definition:
      "The prompt stays focused on the scenario's stated task. A PASS means the prompt targets the same goal or artifact the scenario describes; it does not drift into a different subject, a different assignment, or a different skill.",
    positiveExample:
      'For a scenario about analyzing a poem, the student asks the AI to help identify the speaker\'s tone in the poem.',
    negativeExample:
      'For a scenario about analyzing a poem, the student asks the AI to summarize a different poem, or to explain grammar rules.',
  },
  {
    id: 'clarity_of_purpose',
    label: 'Clarity of Purpose',
    definition:
      "The prompt makes clear what the student is trying to accomplish — what decision, output, or next step the AI's answer should support. A PASS states the goal explicitly, not just a vague topic.",
    positiveExample:
      '"Help me figure out what imagery in lines 6–10 suggests about the speaker\'s mood so I can answer the quiz question about tone." — the goal is stated.',
    negativeExample:
      '"Tell me about this poem." — topic mentioned but no stated purpose; the AI cannot tell what the student needs to be able to do.',
  },
  {
    id: 'conciseness',
    label: 'Conciseness',
    definition:
      "The prompt is appropriately brief. It includes the information the AI actually needs and avoids unrelated detail, filler, or pleading language. A very short prompt can still PASS if it carries all needed information; a long prompt PASSES only if every part serves the goal.",
    positiveExample:
      '"I\'m a 10th-grader analyzing tone in lines 6–10 of \'The Road Not Taken.\' Point me to 2 specific words that carry the tone and explain how each one does so."',
    negativeExample:
      '"Hi, I have an English class tomorrow and I\'m really stressed, can you please please help me, it would mean a lot, also my teacher is strict, anyway here\'s the poem ..." (most of the prompt is filler).',
  },
  {
    id: 'background',
    label: 'Background',
    definition:
      "The prompt supplies the context the AI needs to give a useful answer — the text, data, constraints, or course frame being worked with. A PASS either includes the relevant passage/data/frame or refers to it specifically; it does not assume the AI already knows what the student is working on.",
    positiveExample:
      '"Here is the passage I\'m studying: [quotes 3 lines]. In my English class we learned about tone as word choice and connotation. ..."',
    negativeExample:
      '"Help me with my poem homework." — no passage, no course context, no assignment details.',
  },
  {
    id: 'request_elaboration',
    label: 'Request Elaboration',
    definition:
      "The prompt specifies what the output should look like — format, depth, length, style, or specific deliverable. A PASS gives the AI enough shape to produce a targeted response; a FAIL leaves format and depth fully open.",
    positiveExample:
      '"Respond with: (1) two short tone words, (2) a one-sentence justification per word citing specific language in the text."',
    negativeExample:
      '"Explain the tone." — no instructions on length, depth, or structure.',
  },
  {
    id: 'not_seeking_direct_response',
    label: 'Not Explicitly Seeking a Direct Response',
    definition:
      "The prompt asks the AI to help the student think, reason, or learn — it does not simply ask the AI to produce the final answer, finished essay, or completed assignment that the student is supposed to produce themselves. A PASS reads like a learning request (\"help me understand/check/plan/compare\") rather than a substitution request (\"write it / give me the answer\"). A prompt that asks for a direct answer is a FAIL on this dimension even if it passes others.",
    positiveExample:
      '"Walk me through how to decide the tone of this passage — I\'ll answer, you tell me if I\'m on track."',
    negativeExample:
      '"Just give me the answer to the quiz question: what is the tone of this poem?"',
  },
];

export function getDimension(id: RubricDimensionId): RubricDimension {
  const d = RUBRIC_DIMENSIONS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown rubric dimension: ${id}`);
  return d;
}

export type ScenarioId = 's1_ethical' | 's2_iteration' | 's3_verification';
export type ScenarioPillar = 'ethical' | 'iteration' | 'verification';

export type AiResponseMode =
  /** First response is pre-scripted (forces weak baseline); subsequent attempts go to the live model. Used by S2. */
  | 'iteration_prescripted_first'
  /** Every response is pre-scripted. Used by S3 so the planted errors are stable. */
  | 'prescripted'
  /** Every response is generated live by the LLM. Used by S1. */
  | 'live';

export interface PlantedError {
  /** Short stable id for logging and scoring. */
  id: string;
  /** The human-readable description of what is wrong and what the truth is. */
  description: string;
  /** The literal span (or paraphrase of the span) in the AI response that is wrong. */
  surfaceText: string;
  /** Short phrases that, if the student mentions any of them, count as a correct detection. */
  acceptableKeywords: string[];
}

export interface ModuleScenario {
  id: ScenarioId;
  pillar: ScenarioPillar;
  order: number;
  navLabel: string;
  title: string;
  /** 1-2 sentence framing shown in the scenario intro card. */
  oneLiner: string;
  /** The full scenario context the student sees before writing a prompt. */
  context: string;
  /** What the student is trying to accomplish (displayed as a clear objective). */
  studentGoal: string;
  /** Short instructions that appear immediately above the prompt input. */
  promptInstructions: string;
  /** Rubric dimensions that are graded for this scenario. */
  applicableDimensions: RubricDimensionId[];
  /** Minimum number of prompt attempts before the Advance button is enabled. */
  minAttemptsBeforeAdvance: number;
  /** How the AI response is produced for this scenario. */
  aiResponseMode: AiResponseMode;
  /** For mode=iteration_prescripted_first: response used on attempt 1 only. */
  firstAiResponse?: string;
  /** For mode=prescripted: response used for every attempt. */
  prescriptedAiResponse?: string;
  /** For S3: the source snippet the student is told the AI was asked to summarize. */
  sourceMaterial?: string;
  /** For S3: ground-truth planted errors. */
  plantedErrors?: PlantedError[];
  /** For S3: instructions shown with the detection UI. */
  detectionInstructions?: string;
}

/* -------------------------------------------------------------------------- */
/* Scenario 1 — Ethical / anti-substitutive (serves RQ1)                       */
/* -------------------------------------------------------------------------- */

const S1: ModuleScenario = {
  id: 's1_ethical',
  pillar: 'ethical',
  order: 1,
  navLabel: 'Ethical use',
  title: 'Scenario 1 — Studying for tomorrow\'s English quiz',
  oneLiner:
    "Your teacher quizzes you on tone in a short poem tomorrow. You can use AI, but you want to actually be able to answer the quiz yourself.",
  context: `Tomorrow's 10-minute English quiz asks you to identify the tone of Robert Frost's poem "The Road Not Taken" and defend your answer with two pieces of textual evidence. Your teacher has said she wants to see *your* reasoning, and the quiz is closed-book and handwritten — you won't have AI with you.

You have the poem in front of you and 20 minutes to study. Using AI well here means getting help that makes you better at identifying tone — not getting the answer handed to you.

Excerpt you are studying (lines 13-20, the final stanza):

  > I shall be telling this with a sigh
  > Somewhere ages and ages hence:
  > Two roads diverged in a wood, and I—
  > I took the one less traveled by,
  > And that has made all the difference.`,
  studentGoal:
    'Write a prompt that gets AI to help you build your own understanding of the poem\'s tone — not to give you the quiz answer.',
  promptInstructions:
    'Write a prompt you would send to an AI tutor in this situation. After you submit, you will see (a) how the AI responds and (b) per-dimension feedback on your prompt.',
  applicableDimensions: [
    'relevance',
    'clarity_of_purpose',
    'conciseness',
    'background',
    'request_elaboration',
    'not_seeking_direct_response',
  ],
  minAttemptsBeforeAdvance: 1,
  aiResponseMode: 'live',
};

/* -------------------------------------------------------------------------- */
/* Scenario 2 — Iteration (serves RQ2)                                         */
/* -------------------------------------------------------------------------- */

const S2: ModuleScenario = {
  id: 's2_iteration',
  pillar: 'iteration',
  order: 2,
  navLabel: 'Iteration',
  title: 'Scenario 2 — Sharpening a weak AI response',
  oneLiner:
    "You're writing an argumentative essay and ask AI for a thesis. The first answer is bland. Your job is to iterate your prompt until the AI gives you something you could actually use.",
  context: `For your argumentative-writing unit you are drafting an essay answering this question:

  > Should U.S. high schools require community service hours as a graduation requirement?

You've decided you want to argue *yes*, but you need a thesis statement that is (a) arguable (someone could reasonably disagree), (b) specific enough to defend in 5 paragraphs, and (c) not so generic that any student could submit it.

You've already asked the AI once. Its first answer was vague and obvious — it basically restated the prompt and said "yes, because responsibility." You need to rewrite your prompt so the AI produces something sharper. You can keep iterating until you get a usable thesis.`,
  studentGoal:
    'Write a prompt that will cause the AI to produce a specific, arguable, defensible thesis — then, if needed, iterate your prompt until the response is strong enough to use.',
  promptInstructions:
    "Attempt 1: write your first prompt. You'll see a deliberately weak AI response and per-dimension feedback. Attempt 2+ (required): revise your prompt based on that feedback and try again. You must make at least 2 attempts before you can advance.",
  applicableDimensions: [
    'relevance',
    'clarity_of_purpose',
    'conciseness',
    'background',
    'request_elaboration',
  ],
  minAttemptsBeforeAdvance: 2,
  aiResponseMode: 'iteration_prescripted_first',
  firstAiResponse:
    "Community service is important. It helps students learn responsibility and gives back to society. Therefore, yes, high schools should require community service hours for graduation because it builds character and helps the community.",
};

/* -------------------------------------------------------------------------- */
/* Scenario 3 — Verification / hallucination (serves RQ3)                      */
/* -------------------------------------------------------------------------- */

const S3_PRESCRIPTED_RESPONSE = `Here is a quick study summary of the French Revolution for your project.

1. The French Revolution began in 1781 when an angry Parisian crowd stormed the Bastille prison on July 14, sparking the country's revolt against the monarchy.

2. Queen Marie Antoinette was executed by firing squad in 1793 after being convicted of treason by the National Convention.

3. The Revolution ended in 1799 when Napoleon Bonaparte seized power and was crowned King of France, restoring political order.

Overall, the Revolution lasted about 18 years and replaced absolute monarchy with a constitutional republic by the end of the decade.`;

const S3: ModuleScenario = {
  id: 's3_verification',
  pillar: 'verification',
  order: 3,
  navLabel: 'Verification',
  title: 'Scenario 3 — Fact-checking an AI study summary',
  oneLiner:
    "For your history project, you asked an AI for a short summary of the French Revolution. The summary is confident and well-written — but it contains factual errors.",
  context: `You're researching the French Revolution for a history project. To get started, you asked an AI to produce a short study summary. Here is what it returned:

---

${S3_PRESCRIPTED_RESPONSE}

---

Your task has two parts:
 (a) Identify the factual errors in the AI's summary above.
 (b) Write a single verification prompt you would send back to the AI to correct its mistakes.`,
  studentGoal:
    'Find the factual errors, then write a prompt that forces the AI to verify and correct them.',
  promptInstructions:
    "First, in the error-flagging box, describe each factual error you can find (one per line). Then, in the prompt box below, write the single verification prompt you would send to the AI.",
  applicableDimensions: [
    'relevance',
    'clarity_of_purpose',
    'conciseness',
    'background',
    'request_elaboration',
  ],
  minAttemptsBeforeAdvance: 1,
  aiResponseMode: 'prescripted',
  prescriptedAiResponse: S3_PRESCRIPTED_RESPONSE,
  sourceMaterial:
    'The student has access to their textbook and reliable encyclopedia sources; they are expected to notice any claim that does not match those sources.',
  plantedErrors: [
    {
      id: 'err_year',
      description:
        'The French Revolution began in 1789, not 1781. The storming of the Bastille was on July 14, 1789.',
      surfaceText: 'began in 1781',
      acceptableKeywords: ['1781', 'year', 'started', 'began', '1789', 'date', 'chronolog'],
    },
    {
      id: 'err_execution_method',
      description:
        'Marie Antoinette was executed by guillotine, not by firing squad. Firing squads were not the standard method of the Revolutionary Tribunal.',
      surfaceText: 'executed by firing squad',
      acceptableKeywords: ['firing squad', 'guillotine', 'execution', 'executed', 'method'],
    },
    {
      id: 'err_napoleon_title',
      description:
        'Napoleon was crowned Emperor of the French in 1804, not King of France. France did not have a king named Napoleon.',
      surfaceText: 'crowned King of France',
      acceptableKeywords: ['king', 'emperor', 'napoleon', 'title', 'crown'],
    },
  ],
  detectionInstructions:
    'List every factual error you can identify in the AI summary. Write one error per line. Be concrete — quote or paraphrase the wrong statement and briefly say what is wrong with it.',
};

export const MODULE_SCENARIOS: readonly ModuleScenario[] = [S1, S2, S3] as const;

export function getScenario(id: ScenarioId): ModuleScenario {
  const s = MODULE_SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scenario: ${id}`);
  return s;
}

/**
 * S3 detection grading: compare a student's free-text flagged-error list
 * against the scenario's planted errors. Returns one boolean per planted error
 * indicating whether the student's text plausibly identifies it.
 */
export function gradeDetection(
  flaggedErrorsText: string,
  plantedErrors: PlantedError[]
): Array<{ errorId: string; detected: boolean }> {
  const haystack = flaggedErrorsText.toLowerCase();
  return plantedErrors.map((err) => {
    const detected = err.acceptableKeywords.some((kw) => haystack.includes(kw.toLowerCase()));
    return { errorId: err.id, detected };
  });
}
