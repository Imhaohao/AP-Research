import { NextRequest, NextResponse } from 'next/server';
import {
  getDimension,
  getScenario,
  MODULE_SCENARIOS,
  RUBRIC_DIMENSIONS,
  type RubricDimensionId,
  type ScenarioId,
} from '@/lib/moduleScenarios';

/**
 * Xiao-style LLM-as-judge auto-grader.
 *
 * POST { prompt: string, scenarioId: ScenarioId, apiKey?: string }
 *
 * Returns {
 *   model: string,
 *   verdicts: Record<RubricDimensionId, { pass: boolean, explanation: string }>
 * }
 *
 * The grader calls GPT-4-class with the scenario's applicable rubric dimensions
 * ported from Xiao et al. (2025) Table 1, asking for a per-dimension verdict in
 * a fixed JSON shape.
 */

type Verdict = { pass: boolean; explanation: string };
type VerdictMap = Partial<Record<RubricDimensionId, Verdict>>;

type Body = {
  prompt?: unknown;
  scenarioId?: unknown;
  apiKey?: unknown;
};

const VALID_SCENARIO_IDS = MODULE_SCENARIOS.map((s) => s.id) as readonly ScenarioId[];

function isScenarioId(x: unknown): x is ScenarioId {
  return typeof x === 'string' && (VALID_SCENARIO_IDS as readonly string[]).includes(x);
}

function buildGraderSystemPrompt(scenarioId: ScenarioId): string {
  const scenario = getScenario(scenarioId);
  const dimensions = scenario.applicableDimensions.map(getDimension);

  const rubricBlock = dimensions
    .map(
      (d) => `DIMENSION "${d.id}" (${d.label})
  PASS criteria: ${d.definition}
  Example PASS: ${d.positiveExample}
  Example FAIL: ${d.negativeExample}`
    )
    .join('\n\n');

  const shape = dimensions
    .map((d) => `"${d.id}": { "pass": boolean, "explanation": "1-2 short sentences" }`)
    .join(',\n    ');

  return `You are an expert rubric-based grader evaluating a high school student's AI prompt inside an educational research study.

You will be given:
  (a) The scenario the student is working in.
  (b) The student's prompt they want to send to an AI tutor.

Your job: for each rubric dimension below, decide PASS (true) or FAIL (false) independently, and write a short, concrete explanation that the student can learn from.

Grading guidance:
 - Grade only the student's prompt, NOT any answer the AI might produce. Assume the AI will do its best with whatever the prompt says.
 - Each dimension is evaluated independently. A short prompt may pass some dimensions and fail others.
 - Err toward FAIL on the specific dimension when the prompt is ambiguous on that dimension; explain what is missing.
 - Do NOT deduct for spelling or punctuation.
 - Do NOT demand that the prompt include every piece of information about the scenario — only what the dimension asks about.
 - Write explanations directly to the student ("your prompt ..."); keep them specific to the prompt, 1-2 sentences each.

Scenario context (read carefully):
---
${scenario.context}

The student's stated goal in this scenario: ${scenario.studentGoal}
---

Rubric dimensions to grade (port of Xiao et al. 2025, Table 1):

${rubricBlock}

Output format — respond with a single JSON object and NOTHING else:
{
  "verdicts": {
    ${shape}
  }
}
Every listed dimension MUST appear as a key in "verdicts" with both "pass" (boolean) and "explanation" (string).`;
}

async function callOpenAi(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string
): Promise<{ ok: true; data: unknown } | { ok: false; error: string; status: number }> {
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Student's prompt:\n"""${userPrompt}"""` },
        ],
        temperature: 0.0,
        response_format: { type: 'json_object' },
        max_tokens: 900,
      }),
    });
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: e instanceof Error ? e.message : 'Upstream network error',
    };
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return {
      ok: false,
      status: response.status,
      error: err?.error?.message || `Grader call failed (${response.status})`,
    };
  }

  const data = await response.json().catch(() => null);
  return { ok: true, data };
}

function extractContent(openAiPayload: unknown): string {
  if (
    openAiPayload &&
    typeof openAiPayload === 'object' &&
    'choices' in openAiPayload &&
    Array.isArray((openAiPayload as { choices?: unknown }).choices)
  ) {
    const c = (openAiPayload as { choices: Array<{ message?: { content?: unknown } }> }).choices[0];
    const text = c?.message?.content;
    return typeof text === 'string' ? text : '';
  }
  return '';
}

function parseVerdicts(raw: string): VerdictMap {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  const v = (parsed as { verdicts?: unknown })?.verdicts;
  if (!v || typeof v !== 'object') return {};
  const out: VerdictMap = {};
  for (const d of RUBRIC_DIMENSIONS) {
    const raw = (v as Record<string, unknown>)[d.id];
    if (
      raw &&
      typeof raw === 'object' &&
      typeof (raw as { pass?: unknown }).pass === 'boolean' &&
      typeof (raw as { explanation?: unknown }).explanation === 'string'
    ) {
      out[d.id] = {
        pass: (raw as { pass: boolean }).pass,
        explanation: (raw as { explanation: string }).explanation,
      };
    }
  }
  return out;
}

function fillMissingVerdicts(
  v: VerdictMap,
  scenarioId: ScenarioId
): Record<RubricDimensionId, Verdict> {
  const scenario = getScenario(scenarioId);
  const result = {} as Record<RubricDimensionId, Verdict>;
  for (const dim of scenario.applicableDimensions) {
    result[dim] =
      v[dim] ?? {
        pass: false,
        explanation:
          'The grader did not return a verdict for this dimension. Please retry or revise your prompt so it is easier to evaluate.',
      };
  }
  return result;
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { prompt, scenarioId, apiKey } = body;
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }
  if (!isScenarioId(scenarioId)) {
    return NextResponse.json({ error: 'scenarioId is invalid' }, { status: 400 });
  }

  const openaiApiKey =
    process.env.OPENAI_API_KEY || (typeof apiKey === 'string' ? apiKey : undefined);
  if (!openaiApiKey) {
    return NextResponse.json({ error: 'OpenAI API key is required' }, { status: 400 });
  }

  const model = process.env.OPENAI_GRADER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o';

  const systemPrompt = buildGraderSystemPrompt(scenarioId);

  const firstCall = await callOpenAi(systemPrompt, prompt.trim(), openaiApiKey, model);
  if (!firstCall.ok) {
    return NextResponse.json({ error: firstCall.error }, { status: firstCall.status });
  }

  let verdicts = parseVerdicts(extractContent(firstCall.data));

  const required = getScenario(scenarioId).applicableDimensions;
  const missing = required.some((d) => !verdicts[d]);
  if (missing) {
    const retry = await callOpenAi(
      systemPrompt + '\n\nIMPORTANT: Return valid JSON with every listed dimension present.',
      prompt.trim(),
      openaiApiKey,
      model
    );
    if (retry.ok) {
      const merged = parseVerdicts(extractContent(retry.data));
      verdicts = { ...verdicts, ...merged };
    }
  }

  return NextResponse.json({
    model,
    scenarioId,
    verdicts: fillMissingVerdicts(verdicts, scenarioId),
  });
}
