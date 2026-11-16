// Step 3 of an answer (ADR 0020): the model turns the tool's facts into a short answer, and the code
// rejects any answer with a number the facts don't contain (the digest's number guard).
import { z } from 'zod';
import {
  generateJson,
  toGeminiSchema,
  type GeminiConfig,
  type Generation,
} from '../extractor/index.ts';
import type { Tracer } from '../observability/index.ts';
import { findUnknownNumbers, numbersIn } from '../shared/index.ts';
import type { Language } from './plan.ts';
import type { Facts } from './tools.ts';

// ---- types -------------------------------------------------------------------------------------

export type AnswerResult =
  { kind: 'accepted'; text: string } | { kind: 'rejected'; reason: string };

interface AnswerRequest {
  question: string;
  language: Language;
  facts: Facts;
}

// ---- constants ---------------------------------------------------------------------------------

/** A few sentences: the widget is small, and a long answer hides the numbers. */
export const MAX_ANSWER_CHARS = 700;
/** A rejected answer gets one more try, as in the digest. */
const ATTEMPTS = 2;

const answerSchema = z.object({ answer: z.string().min(1) });

const RESPONSE_SCHEMA = toGeminiSchema(z.toJSONSchema(answerSchema));

const SYSTEM_INSTRUCTION = `You answer a question about the Ukrainian IT job market. You get the
question, the answer language and the facts as JSON, computed by SQL over vacancies from DOU and
Djinni seen in the last windowDays days.

Rules:
- Use only the numbers in the facts, exactly as given. Never compute, round, sum or estimate a
  number, and never repeat a number from the question that the facts don't contain.
- Write every number as digits, never as words.
- Always say how many vacancies the numbers are based on (n or analysed).
- "percent" is a share of the analysed vacancies. "not_stated" means the vacancy doesn't say.
- Salaries are in USD per month over the vacancies that state one. Say the median, and that the
  middle half of them pay from p25 to p75; never write the labels "p25" or "p75" themselves.
- Codes are names: say them naturally (ml_ai → "ML/AI", data_engineering → "data engineering").
- If the facts don't answer the question exactly, say what they do show.
- Plain text, 2–4 sentences, no markdown, no lists, no links, no advice.
- At most ${MAX_ANSWER_CHARS} characters. Write in the requested language ("uk" Ukrainian, "en"
  English).`;

// ---- functions ---------------------------------------------------------------------------------

export async function writeAnswer(
  gemini: GeminiConfig,
  request: AnswerRequest,
  tracer: Tracer,
): Promise<AnswerResult> {
  let result: AnswerResult = { kind: 'rejected', reason: 'no attempt' };
  for (let attempt = 1; attempt <= ATTEMPTS && result.kind === 'rejected'; attempt++) {
    result = await attemptAnswer(gemini, request, tracer);
  }
  return result;
}

async function attemptAnswer(
  gemini: GeminiConfig,
  request: AnswerRequest,
  tracer: Tracer,
): Promise<AnswerResult> {
  const startedAt = new Date();
  const input = JSON.stringify(request);
  const generation = await generateJson(gemini, {
    systemInstruction: SYSTEM_INSTRUCTION,
    input,
    schema: RESPONSE_SCHEMA,
  });
  const result = judgeAnswer(generation.text, request.facts);
  traceAttempt(tracer, { gemini, startedAt, input, generation, result });
  return result;
}

/** Pure: the model's raw answer in, a verdict out. */
export function judgeAnswer(answer: string, facts: Facts): AnswerResult {
  const parsed = answerSchema.safeParse(JSON.parse(answer));
  if (!parsed.success) {
    return { kind: 'rejected', reason: 'answer breaks the contract' };
  }
  const text = parsed.data.answer.trim();
  if (text.length > MAX_ANSWER_CHARS) {
    return { kind: 'rejected', reason: `${text.length} chars over ${MAX_ANSWER_CHARS}` };
  }
  const unknown = findUnknownNumbers(text, numbersIn(facts));
  return unknown.length > 0
    ? { kind: 'rejected', reason: `numbers not in the facts: ${unknown.join(', ')}` }
    : { kind: 'accepted', text };
}

function traceAttempt(
  tracer: Tracer,
  call: {
    gemini: GeminiConfig;
    startedAt: Date;
    input: string;
    generation: Generation;
    result: AnswerResult;
  },
): void {
  tracer.recordGeneration({
    name: 'agent-answer',
    model: call.gemini.model,
    startedAt: call.startedAt,
    endedAt: new Date(),
    input: call.input,
    output: call.generation.text,
    usage: { input: call.generation.inputTokens, output: call.generation.outputTokens },
    metadata: { outcome: call.result.kind },
    tags: ['agent'],
    ...(call.result.kind === 'rejected' && { errorMessage: call.result.reason }),
  });
}
