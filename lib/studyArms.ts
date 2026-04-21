/**
 * Three-arm systematic RCT: participant k gets arm (k - 1) % 3.
 * 0 = unrestricted AI · 1 = prompt-engineering-guided AI · 2 = guided + prompt bank
 */

export type StudyGroupSlug =
  | 'control'
  | 'treatment'
  | 'unrestricted_ai'
  | 'guided_ai'
  | 'prompt_bank_ai';

export type TreatmentArm = 0 | 1 | 2;

export const ARM_INDEX = [0, 1, 2] as const;

/** 1-based sequence from Supabase → arm index */
export function armIndexFromParticipantSequence(seq: number): TreatmentArm {
  const s = Math.floor(Number(seq));
  if (!Number.isFinite(s) || s < 1) return 0;
  const idx = (s - 1) % 3;
  return idx as TreatmentArm;
}

export function studyGroupSlugFromArm(arm: TreatmentArm): 'unrestricted_ai' | 'guided_ai' | 'prompt_bank_ai' {
  if (arm === 0) return 'unrestricted_ai';
  if (arm === 1) return 'guided_ai';
  return 'prompt_bank_ai';
}

export const ARM_LABELS: Record<TreatmentArm, { title: string; short: string; description: string }> = {
  0: {
    title: 'Unrestricted AI use',
    short: 'Arm A — Unrestricted',
    description:
      'You may ask the AI for full drafts, heavy rewriting, or direct edits. There are no special coaching constraints in this arm.',
  },
  1: {
    title: 'Prompt-engineering-guided AI use',
    short: 'Arm B — Guided coaching',
    description:
      'The AI is instructed to coach you: questions, feedback, and targeted help — not to replace your narrative voice unless you clearly ask for a full rewrite.',
  },
  2: {
    title: 'Prompt-engineering + prompt bank',
    short: 'Arm C — Guided + prompt bank',
    description:
      'Same guided coaching as Arm B, plus a bank of example prompts you can copy and adapt when talking to the AI.',
  },
};

/** System prompt for the CRAFT “AI narrative” chat (same green ChatGPT panel as other steps). */
export function craftAiNarrativeChatSystemPrompt(arm: TreatmentArm, lessonPromptText: string): string {
  const shared = `You are helping a student in a high school English narrative-writing lesson. They already wrote their own short story from an assignment prompt. Now they need an AI-written sample from the **same** prompt so they can compare voice, structure, and creativity.

Assignment prompt (identical to their human draft task):
---
${lessonPromptText}
---

Keep exchanges efficient. When you write the sample story: 1–2 paragraphs (about 150–280 words), vivid and concrete, story body only — no title line and no preamble like "Here is your story".`;

  if (arm === 0) {
    return `${shared}
This participant is in the **unrestricted** arm: you may brainstorm briefly, but if they ask for the full draft, alternate versions, or heavy rewriting, comply directly.`;
  }
  if (arm === 1) {
    return `${shared}
This participant is in the **guided** arm: prefer a short collaborative turn first (e.g. tone or one image they want in the AI version). When they ask for the sample narrative or say they are ready, write the full story. If they clearly insist on skipping discussion, write the story right away.`;
  }
  return `${shared}
This participant is in the **guided + prompt bank** arm: same as guided — brief collaboration when natural, then the full sample when they ask or insist. If they paste a prefilled prompt from their bank, treat it as their instruction.`;
}

/** Narrative generation instructions (first AI story) — arms differ slightly in framing */
export function craftGenerationInstruction(arm: TreatmentArm, lessonPromptText: string): string {
  const base = `Write a short story of 1-2 paragraphs (about 150–280 words) responding to this prompt. Use vivid narrative voice and concrete details. Write only the story — no title line, no preamble.\n\nPrompt:\n${lessonPromptText}`;
  if (arm === 0) {
    return `You are a creative writing assistant. The student is in a research condition that allows flexible AI support. ${base}`;
  }
  return `You are a creative writing assistant assigned to produce one sample narrative for comparison with the student's own draft (same assignment prompt). ${base}`;
}

/** System instructions prepended for CRAFT revision chat */
export function craftRevisionCoachPrompt(
  arm: TreatmentArm,
  human: string,
  aiComparison: string,
  revisionSoFar: string
): string {
  const context = `The student's own draft (human-written) is:
---
${human || '(not provided)'}
---

An AI-generated comparison draft from the same story prompt was:
---
${aiComparison || '(not generated yet)'}
---

Their current working revision (they may paste updates in chat or the revision box) is:
---
${revisionSoFar || '(see chat)'}
---
`;

  if (arm === 0) {
    return `${context}
You help with narrative writing in a high school English class. In this study arm the student may ask you to produce or rewrite full sections, expand scenes, change voice, or fix grammar — fulfill their requests directly unless they ask only for hints. Remind them briefly if a request could replace their own authorship entirely, but comply if they insist.`;
  }

  if (arm === 1) {
    return `${context}
You help students revise narrative fiction. Respond to their requests: clarify vague details, grammar and sentences, expand sensory detail, strengthen voice, or tighten plot — while preserving their main ideas unless they ask to change them. Prefer targeted edits and questions over replacing their voice with generic prose. Do not write the entire final story for them unless they explicitly request a full rewrite; if they do, provide it but note they should integrate thoughtfully.`;
  }

  // arm 2 — same coaching as 1; UI adds prompt bank
  return `${context}
You help students revise narrative fiction (same guidelines as guided coaching). They may paste prompts from a course prompt bank—treat those as clear instructions. Prefer targeted edits and questions; preserve their ideas unless they ask for broader changes.`;
}

export const NARRATIVE_PROMPT_BANK: { label: string; template: string }[] = [
  {
    label: 'Sensory pass',
    template:
      'Revise this paragraph to add one specific sensory detail (sight, sound, or touch) in each sentence without changing what happens.',
  },
  {
    label: 'Dialogue beat',
    template:
      'Add 3–5 lines of dialogue that show conflict between two characters. Keep my plot the same.',
  },
  {
    label: 'Show don’t tell',
    template:
      "Replace telling phrases like 'she was nervous' with concrete actions or body language.",
  },
  {
    label: 'Pacing',
    template:
      'Shorten the opening to get to the main conflict faster. Suggest cuts line by line.',
  },
  {
    label: 'Tone check',
    template:
      'Read for tone: is the voice consistent with a high school narrator? Flag 2 spots to fix.',
  },
  {
    label: 'Ending',
    template:
      'Suggest two alternative last sentences that land the emotional beat more clearly.',
  },
];

export function usesLegacyTwoArmDesign(): boolean {
  return (
    process.env.NEXT_PUBLIC_LEGACY_TREATMENT_MODULE === 'true' ||
    process.env.NEXT_PUBLIC_LEGACY_TREATMENT_MODULE === '1'
  );
}

/**
 * 2-arm experimental design used by the interactive Xiao-style module study.
 *
 * The database still records 3 arms (0/1/2) via the sequence-based assignment
 * logic in Supabase — we do NOT change the database to keep historical data
 * analyzable. For the new study, arm 0 is control and arms 1 & 2 are both
 * treatment. Analysis code should collapse arms 1 and 2 accordingly.
 */
export type TwoArmCondition = 'control' | 'treatment';

export function twoArmConditionFromArm(arm: TreatmentArm | null | undefined): TwoArmCondition {
  if (arm === 0) return 'control';
  if (arm === 1 || arm === 2) return 'treatment';
  // Fallback — if assignment has not loaded or legacy flow, default to control
  // which shows the non-instructional content.
  return 'control';
}

export const TWO_ARM_LABELS: Record<TwoArmCondition, { title: string; short: string; description: string }> = {
  control: {
    title: 'Control — non-instructional reading',
    short: 'Control',
    description:
      "You'll spend a few minutes on a short digital-literacy reading before the main writing task. No prompt-engineering instruction in this arm.",
  },
  treatment: {
    title: 'Treatment — interactive prompt-engineering module',
    short: 'Treatment',
    description:
      "You'll complete an interactive 3-scenario module that teaches ethical AI use, prompt iteration, and verifying AI claims, before the main writing task.",
  },
};
