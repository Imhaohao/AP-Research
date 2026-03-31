/**
 * Stanford CRAFT–style narrative + AI literacy lesson content,
 * adapted for asynchronous self-paced delivery in this app.
 *
 * Source lesson: "How can generative AI support narrative writing in English class?"
 * Created by Tim Morris, Chelsea Dixon & Liz Harris; adapted by Joba Adisa.
 */

export const CRAFT_ATTRIBUTION =
  'Lesson design informed by Stanford CRAFT materials (Morris, Dixon & Harris; adapted by Joba Adisa). ' +
  'This screen is an asynchronous version for independent work.';

export const CRAFT_NARRATIVE_PROMPTS = [
  {
    id: 'grade_improvement',
    label: 'Perseverance and grades',
    text: 'Write a short story about how a student perseveres to raise their grade from a D to an A in their English class over the course of four months.',
  },
  {
    id: 'self_discovery',
    label: 'Self-discovery',
    text: 'Write a short story about someone discovering something new about themselves.',
  },
  {
    id: 'helping_peer',
    label: 'Helping a peer',
    text: 'Write a short story about a student at school who helps another student with a struggle they’re having with their friends.',
  },
] as const;

export type CraftPromptId = (typeof CRAFT_NARRATIVE_PROMPTS)[number]['id'];

/**
 * Treatment condition: the Stanford CRAFT–inspired async narrative lesson is the default curriculum
 * (human draft → AI draft → compare → revise → reflect → exit ticket).
 *
 * Set NEXT_PUBLIC_LEGACY_TREATMENT_MODULE=true to use the original Prompt Engineering mini-course
 * + science explanation writing task instead.
 */
export function isCraftCurriculumPath(studyGroup: 'control' | 'treatment'): boolean {
  if (studyGroup !== 'treatment') return false;
  const legacy =
    process.env.NEXT_PUBLIC_LEGACY_TREATMENT_MODULE === 'true' ||
    process.env.NEXT_PUBLIC_LEGACY_TREATMENT_MODULE === '1';
  return !legacy;
}

export const CRAFT_REVISION_SUGGESTIONS = [
  'Can you clarify vague details in this story?',
  'Can you edit the grammar and sentence structure?',
  'Can you improve the narrative while maintaining the main idea?',
  'Can you add more details to make the story longer?',
] as const;
