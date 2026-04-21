/**
 * Pre/post assessment item bank for the Xiao-style interactive module study.
 *
 * Structure (per the research plan):
 *   - 6 True/False items  (2 per RQ pillar: ethical, iteration, verification)
 *   - 2 Open-Ended items  (rewrite-prompt, substitutive-use-intent)
 *   - 3-item hallucination subtest (each: short AI response with 1 planted
 *     factual error; student flags the error AND writes a correction prompt)
 *
 * Both arms take the identical pre- and post-assessments. The 3-item
 * hallucination subtest is the primary between-arm DV for RQ3; its scoring
 * uses `acceptableKeywords` to decide detection and sends the correction
 * prompt to the auto-grader for quality scoring.
 */

export type AssessmentPillar = 'ethical' | 'iteration' | 'verification';

export interface TFAssessmentItem {
  id: string;
  pillar: AssessmentPillar;
  statement: string;
  correctAnswer: boolean;
  /** For IRR and educator reference — NOT shown to the student. */
  rationale: string;
}

export interface OEAssessmentItem {
  id: string;
  label: string;
  /** What the student sees above the text box. */
  instructions: string;
  /** Educator-facing notes about what a strong response looks like (not shown). */
  scoringNotes: string;
}

export interface HallucinationAssessmentItem {
  id: string;
  topic: string;
  /** Short AI "study note" response the student is evaluating. */
  aiResponse: string;
  /** Ground-truth description of the planted error (educator-facing). */
  plantedErrorDescription: string;
  /**
   * Short phrases the student's flaggedError text must contain at least one of
   * to be scored as a correct detection. Matching is case-insensitive substring.
   */
  acceptableKeywords: string[];
}

/* -------------------------------------------------------------------------- */
/* True/False items — 6 total, 2 per pillar                                   */
/* -------------------------------------------------------------------------- */

export const TF_ITEMS: readonly TFAssessmentItem[] = [
  {
    id: 'tf_ethical_1',
    pillar: 'ethical',
    statement:
      'Using an AI chatbot to help you brainstorm ideas and check your understanding of a topic before a quiz is a productive study strategy, as long as the AI does not write your final answer for you.',
    correctAnswer: true,
    rationale:
      'Core principle of ethical AI use: AI is a thinking aid, not a substitute for producing work the student is being evaluated on.',
  },
  {
    id: 'tf_ethical_2',
    pillar: 'ethical',
    statement:
      'It is acceptable to paste your entire essay assignment into an AI, submit the AI\'s response as your own work, and only rephrase some sentences.',
    correctAnswer: false,
    rationale:
      'Substitutive use: AI produces the work that the student is supposed to produce; rephrasing does not change authorship.',
  },
  {
    id: 'tf_iteration_1',
    pillar: 'iteration',
    statement:
      'When an AI\'s first response to a prompt is too generic to be useful, the most effective next step is usually to revise and resend the prompt with more specific instructions — not to accept the generic response.',
    correctAnswer: true,
    rationale: 'Iteration on the prompt is central to getting better AI output; accepting weak output is a missed learning opportunity.',
  },
  {
    id: 'tf_iteration_2',
    pillar: 'iteration',
    statement:
      'Once a prompt produces an AI response that is usable, there is no benefit to refining the prompt any further.',
    correctAnswer: false,
    rationale:
      'Refinement often surfaces stronger framings and structure. "Usable" is not the same as "best" — iteration is still valuable when stakes are high.',
  },
  {
    id: 'tf_verification_1',
    pillar: 'verification',
    statement:
      'AI tools sometimes produce confident-sounding statements that are factually incorrect (called hallucinations), so factual claims from AI should be verified against reliable sources before being used.',
    correctAnswer: true,
    rationale: 'Definitional: AI hallucinations are a known failure mode; verification is the standard response.',
  },
  {
    id: 'tf_verification_2',
    pillar: 'verification',
    statement:
      'If an AI response is well-written and grammatically correct, it is safe to trust its factual claims without any further checking.',
    correctAnswer: false,
    rationale: 'Fluency is not evidence of factual correctness; AI outputs can be fluent and wrong.',
  },
];

/* -------------------------------------------------------------------------- */
/* Open-ended items — 2 total                                                  */
/* -------------------------------------------------------------------------- */

export const OE_ITEMS: readonly OEAssessmentItem[] = [
  {
    id: 'oe_rewrite_prompt',
    label: 'Rewrite this weak prompt',
    instructions:
      'The prompt below is too vague to get a useful AI response. Rewrite it so an AI would give you something you could actually study from. Include whatever context, goal, or format details you think matter.\n\nWeak prompt: "Tell me about the civil war."',
    scoringNotes:
      'Score on the same 6 rubric dimensions used in the module (Relevance, Clarity of Purpose, Conciseness, Background, Request Elaboration, Not Explicitly Seeking a Direct Response). Grade the rewritten prompt, not the original.',
  },
  {
    id: 'oe_substitutive_intent',
    label: 'How would you use AI here?',
    instructions:
      'Imagine a teacher gives you this homework: "Write a 3-paragraph argumentative response about whether phones should be banned in high schools. Turn it in by Friday." Describe, step by step, how you would use (or not use) AI while completing this assignment.',
    scoringNotes:
      'RQ1 intent indicator. Code along substitutive vs. scaffolding use: does the student describe AI writing the essay for them (substitutive), helping them plan/brainstorm/revise (scaffolding), or not using AI at all? Score on a 3-point ordinal scale.',
  },
];

/* -------------------------------------------------------------------------- */
/* Hallucination subtest — 3 items                                             */
/* -------------------------------------------------------------------------- */

export const HALLUCINATION_ITEMS: readonly HallucinationAssessmentItem[] = [
  {
    id: 'hal_history_decl_independence',
    topic: 'U.S. History — Declaration of Independence',
    aiResponse:
      "Here are quick study notes on the Declaration of Independence: it was signed on July 4, 1774, by 56 delegates of the Second Continental Congress meeting in Philadelphia. Thomas Jefferson was its primary author, and it announced the thirteen colonies' break from British rule.",
    plantedErrorDescription:
      'The Declaration was adopted on July 4, 1776 — not 1774. Most delegates signed it on August 2, 1776. 1774 is before the Revolutionary War even began.',
    acceptableKeywords: ['1774', '1776', 'year', 'date', 'adopt', 'sign'],
  },
  {
    id: 'hal_science_boiling_point',
    topic: 'Chemistry — Boiling Point of Water',
    aiResponse:
      "Quick reference: at standard atmospheric pressure (1 atm) at sea level, water boils at 100 degrees Fahrenheit. This is the temperature at which liquid water gains enough kinetic energy to become water vapor.",
    plantedErrorDescription:
      'Water boils at 100 degrees Celsius (equivalent to 212 degrees Fahrenheit) at standard atmospheric pressure, not 100 degrees Fahrenheit. 100 F is body-temperature range, far below boiling.',
    acceptableKeywords: ['fahrenheit', 'celsius', '100', '212', 'unit', 'temperature', 'boil'],
  },
  {
    id: 'hal_biology_longest_bone',
    topic: 'Biology — Human Skeleton',
    aiResponse:
      "Human skeletal system quick facts: adults have 206 bones and newborns have around 270 (many fuse during development). The longest bone in the entire human body is the humerus, which is located in the upper arm.",
    plantedErrorDescription:
      'The longest bone in the human body is the femur (thigh bone), not the humerus. The humerus is the longest bone in the arm, but the femur is longer.',
    acceptableKeywords: ['humerus', 'femur', 'thigh', 'longest', 'bone', 'arm', 'leg'],
  },
];

/* -------------------------------------------------------------------------- */
/* Grading helpers                                                             */
/* -------------------------------------------------------------------------- */

export interface TFResponse {
  id: string;
  answer: boolean | null;
}

export function gradeTF(
  responses: TFResponse[]
): Array<{ id: string; correct: boolean | null; pillar: AssessmentPillar }> {
  return TF_ITEMS.map((item) => {
    const r = responses.find((x) => x.id === item.id);
    if (!r || r.answer === null || r.answer === undefined) {
      return { id: item.id, correct: null, pillar: item.pillar };
    }
    return {
      id: item.id,
      correct: r.answer === item.correctAnswer,
      pillar: item.pillar,
    };
  });
}

export function gradeHallucinationDetection(
  flaggedText: string,
  item: HallucinationAssessmentItem
): boolean {
  const h = (flaggedText || '').toLowerCase();
  if (!h.trim()) return false;
  return item.acceptableKeywords.some((kw) => h.includes(kw.toLowerCase()));
}

/** 5-item Likert confidence battery, retained from the earlier study. */
export const LIKERT_CONFIDENCE_ITEMS: readonly {
  id: 'q1' | 'q2' | 'q3' | 'q4' | 'q5';
  prompt: string;
}[] = [
  { id: 'q1', prompt: 'I feel confident writing clear and specific prompts for AI tools.' },
  { id: 'q2', prompt: 'I know when asking an AI for an explanation is better than asking for an answer.' },
  { id: 'q3', prompt: 'I know how to refine a weak AI response by revising my prompt.' },
  { id: 'q4', prompt: 'I know how to check whether an AI response is factually accurate.' },
  { id: 'q5', prompt: 'I can use AI for schoolwork in a way that respects academic honesty.' },
];
