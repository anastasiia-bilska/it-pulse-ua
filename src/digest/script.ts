// The episode scripts: Gemini writes both languages from the facts in one call, and the code
// rejects anything too long or with a number the facts don't contain (ADR 0013).
import { z } from 'zod';
import {
  generateJson,
  toGeminiSchema,
  type GeminiConfig,
  type Generation,
} from '../extractor/index.ts';
import type { Tracer } from '../observability/index.ts';
import { findUnknownNumbers } from './number-guard.ts';
import type { WeeklyFacts } from './weekly-facts.ts';

// ---- types -------------------------------------------------------------------------------------

export type Scripts = z.infer<typeof scriptsSchema>;

export type ScriptResult =
  { kind: 'accepted'; scripts: Scripts } | { kind: 'rejected'; reason: string };

// ---- constants ---------------------------------------------------------------------------------

/** About one minute of speech; two of these fit the free ElevenLabs plan (ADR 0013). */
export const MAX_SCRIPT_CHARS = 1100;
/** A rejected answer gets one more try: length overruns are the usual cause. */
const ATTEMPTS = 2;

const scriptsSchema = z.object({
  uk: z.string().min(1).describe('The script in Ukrainian'),
  en: z.string().min(1).describe('The same script in English'),
});

const RESPONSE_SCHEMA = toGeminiSchema(z.toJSONSchema(scriptsSchema));

const SYSTEM_INSTRUCTION = `You write the script of "IT Pulse UA", a weekly one-minute audio digest
about the Ukrainian IT job market. You get the facts of one week as JSON and return the same
script twice: in Ukrainian ("uk") and in English ("en").

Rules:
- Use only the numbers in the facts, exactly as given. Never compute, round or estimate a number,
  and never add a number of your own (no counts of items, no "top 3", no dates other than given).
- Write every number as digits, never as words.
- A changePercent is a change against the previous week: a negative one means "fewer" or "down".
  When it is null, do not compare that item with the previous week.
- If isPreliminary is true, say early on that only analysedPercent% of the week's vacancies are
  analysed so far, so the numbers are preliminary.
- If medianSalaryUsdMonth is null, do not mention salaries.
- Role names are codes: say them naturally (ml_ai → "ML/AI", data_engineering → "data engineering").
- Plain spoken language for the ear: short sentences, no lists, no markdown, no emoji, no links.
- At most ${MAX_SCRIPT_CHARS} characters per language, spaces included.
- Start with a greeting naming the digest and the week's dates; end with a short sign-off.`;

// ---- functions ---------------------------------------------------------------------------------

export async function writeScripts(
  gemini: GeminiConfig,
  facts: WeeklyFacts,
  tracer: Tracer,
): Promise<ScriptResult> {
  let result: ScriptResult = { kind: 'rejected', reason: 'no attempt' };
  for (let attempt = 1; attempt <= ATTEMPTS && result.kind === 'rejected'; attempt++) {
    result = await attemptScripts(gemini, facts, tracer);
  }
  return result;
}

async function attemptScripts(
  gemini: GeminiConfig,
  facts: WeeklyFacts,
  tracer: Tracer,
): Promise<ScriptResult> {
  const startedAt = new Date();
  const input = JSON.stringify(facts);
  const generation = await generateJson(gemini, {
    systemInstruction: SYSTEM_INSTRUCTION,
    input,
    schema: RESPONSE_SCHEMA,
  });
  const result = judgeScripts(generation.text, facts);
  traceAttempt(tracer, { gemini, facts, startedAt, input, generation, result });
  return result;
}

/** Pure: the model's raw answer in, a verdict out. */
export function judgeScripts(answer: string, facts: WeeklyFacts): ScriptResult {
  const parsed = scriptsSchema.safeParse(JSON.parse(answer));
  if (!parsed.success) {
    return { kind: 'rejected', reason: 'answer breaks the contract' };
  }
  const problems = Object.entries(parsed.data).flatMap(([language, script]) =>
    scriptProblems(language, script, facts),
  );
  return problems.length > 0
    ? { kind: 'rejected', reason: problems.join('; ') }
    : { kind: 'accepted', scripts: parsed.data };
}

function scriptProblems(language: string, script: string, facts: WeeklyFacts): string[] {
  const problems: string[] = [];
  if (script.length > MAX_SCRIPT_CHARS) {
    problems.push(`${language}: ${script.length} chars over ${MAX_SCRIPT_CHARS}`);
  }
  const unknown = findUnknownNumbers(script, facts);
  if (unknown.length > 0) {
    problems.push(`${language}: numbers not in the facts: ${unknown.join(', ')}`);
  }
  return problems;
}

function traceAttempt(
  tracer: Tracer,
  call: {
    gemini: GeminiConfig;
    facts: WeeklyFacts;
    startedAt: Date;
    input: string;
    generation: Generation;
    result: ScriptResult;
  },
): void {
  tracer.recordGeneration({
    name: 'digest-script',
    model: call.gemini.model,
    startedAt: call.startedAt,
    endedAt: new Date(),
    input: call.input,
    output: call.generation.text,
    usage: { input: call.generation.inputTokens, output: call.generation.outputTokens },
    metadata: { week: call.facts.week, outcome: call.result.kind },
    tags: ['digest'],
    ...(call.result.kind === 'rejected' && { errorMessage: call.result.reason }),
  });
}
