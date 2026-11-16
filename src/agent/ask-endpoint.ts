// POST /api/ask, the public «Запитай ринок» endpoint (ADR 0021). It runs as a Cloudflare Pages
// Function next to the dashboard, so the page calls it on its own origin. Order matters: the
// question is validated and the caps are claimed before anything spends Gemini quota.
import pg from 'pg';
import { fetchUsdRates, MIN_N } from '../dashboard/index.ts';
import { GEMINI_BASE_URL, MODEL, QuotaExhaustedError } from '../extractor/index.ts';
import {
  createLangfuseTracer,
  LANGFUSE_EU_URL,
  NO_TRACING,
  type Tracer,
} from '../observability/index.ts';
import { askMarket, isValidQuestion, type MarketAnswer } from './ask-market.ts';
import { LANGUAGES, type Dimension, type Language } from './plan.ts';
import { claimQuestion, hashClient, type QuotaVerdict } from './quota.ts';
import type { Facts, Part } from './tools.ts';

// ---- types -------------------------------------------------------------------------------------

/** Secrets of the Pages project (set by dashboard.yml). Langfuse keys are optional. */
export interface AskEnvironment {
  /** The read-only `agent` role: reads views, appends quota rows. */
  DATABASE_URL: string;
  GEMINI_API_KEY: string;
  ASK_CLIENT_SALT: string;
  /** Tests point it at a local fake; production leaves it unset. */
  GEMINI_BASE_URL?: string;
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
}

/** The part of a Pages Function's context the endpoint reads. */
export interface AskContext {
  request: Request;
  env: AskEnvironment;
  waitUntil: (promise: Promise<unknown>) => void;
}

/**
 * What the page receives: the kind drives the styling, the text is shown as is. The numbers next to
 * it are the tool's own facts, aggregates only (ADR 0011), so the page can draw them as bars.
 */
export interface AskResponse {
  kind: MarketAnswer['kind'] | 'limit' | 'busy' | 'invalid' | 'error';
  text: string;
  /** How many vacancies the numbers rest on: answered and insufficient replies only. */
  n?: number;
  /** The «даних замало» threshold n is short of: insufficient replies only. */
  minN?: number;
  windowDays?: number;
  chart?: AskChart;
}

/** A distribution (its dimension's codes) or top skills (dimension null: names as they are). */
export interface AskChart {
  dimension: Dimension | null;
  bars: Part[];
}

interface AskBody {
  question: string;
  language: Language;
}

// ---- constants ---------------------------------------------------------------------------------

/** The widget shows the leaders; the model's text may mention a few more. */
const CHART_BARS = 5;

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_INTERNAL_ERROR = 500;
const HTTP_UNAVAILABLE = 503;

const REFUSALS = {
  invalid: {
    uk: 'Питання має бути від 3 до 300 символів.',
    en: 'A question is 3 to 300 characters long.',
  },
  daily_cap: {
    uk: 'На сьогодні ліміт питань до агента вичерпано. Спробуй завтра.',
    en: 'The agent has answered its daily limit of questions. Try again tomorrow.',
  },
  client_cap: {
    uk: 'Ти вже поставив(-ла) сьогодні максимум питань. Спробуй завтра.',
    en: "You've asked the most questions allowed today. Try again tomorrow.",
  },
  busy: {
    uk: 'AI-модель зараз перевантажена. Спробуй за кілька хвилин.',
    en: 'The AI model is busy right now. Try again in a few minutes.',
  },
  error: {
    uk: 'Щось пішло не так. Спробуй ще раз пізніше.',
    en: 'Something went wrong. Please try again later.',
  },
} as const;

// ---- functions ---------------------------------------------------------------------------------

export async function handleAsk(context: AskContext): Promise<Response> {
  const body = await readBody(context.request);
  const language = body?.language ?? 'en';
  if (!body || !isValidQuestion(body.question)) {
    return reply(HTTP_BAD_REQUEST, { kind: 'invalid', text: REFUSALS.invalid[language] });
  }
  const db = new pg.Client({ connectionString: context.env.DATABASE_URL });
  const tracer = tracerFor(context.env);
  try {
    await db.connect();
    return await answer(db, body, { context, tracer });
  } catch (error) {
    return failure(error, language);
  } finally {
    context.waitUntil(Promise.allSettled([db.end(), tracer.flush()]));
  }
}

async function answer(
  db: pg.Client,
  body: AskBody,
  { context, tracer }: { context: AskContext; tracer: Tracer },
): Promise<Response> {
  const verdict = await claimQuestion(db, await clientHash(context));
  if (verdict !== 'allowed') {
    return refuseOverCap(verdict, body.language);
  }
  const marketAnswer = await askMarket(db, body.question.trim(), {
    gemini: {
      apiKey: context.env.GEMINI_API_KEY,
      model: MODEL,
      baseUrl: context.env.GEMINI_BASE_URL ?? GEMINI_BASE_URL,
    },
    tracer,
    // ponytail: one NBU request per salary question; cache per day if traffic ever grows.
    loadUsdRates: () => fetchUsdRates(),
    now: new Date(),
  });
  return reply(HTTP_OK, toResponse(marketAnswer));
}

function toResponse(answer: MarketAnswer): AskResponse {
  if (answer.kind === 'insufficient') {
    return { kind: answer.kind, text: answer.text, n: answer.n, minN: MIN_N };
  }
  if (answer.kind !== 'answered') {
    return { kind: answer.kind, text: answer.text };
  }
  const { facts } = answer;
  const n = facts.tool === 'salary' ? facts.n : facts.analysed;
  const chart = chartOf(facts);
  return {
    kind: answer.kind,
    text: answer.text,
    n,
    windowDays: facts.windowDays,
    ...(chart && { chart }),
  };
}

/** Salary and a single skill's demand are one figure each: the text says it, no bars. */
function chartOf(facts: Facts): AskChart | undefined {
  if (facts.tool === 'distribution') {
    return { dimension: facts.dimension, bars: facts.parts.slice(0, CHART_BARS) };
  }
  // Vacancies with no resolved skill yet: nothing to draw.
  if (facts.tool === 'top_skills' && facts.skills.length > 0) {
    return { dimension: null, bars: facts.skills.slice(0, CHART_BARS) };
  }
  return undefined;
}

/** Malformed input is a refusal, never an exception: the boundary validates. */
async function readBody(request: Request): Promise<AskBody | undefined> {
  try {
    const raw = (await request.json()) as { question?: unknown; language?: unknown };
    const language = LANGUAGES.find((known) => known === raw.language) ?? 'en';
    return typeof raw.question === 'string' ? { question: raw.question, language } : undefined;
  } catch {
    return undefined;
  }
}

function clientHash(context: AskContext): Promise<string> {
  const ip = context.request.headers.get('cf-connecting-ip') ?? 'unknown';
  return hashClient(ip, new Date(), context.env.ASK_CLIENT_SALT);
}

function refuseOverCap(verdict: Exclude<QuotaVerdict, 'allowed'>, language: Language): Response {
  return reply(HTTP_TOO_MANY_REQUESTS, { kind: 'limit', text: REFUSALS[verdict][language] });
}

/** The log names the error class only: a message could carry a question or a connection URL. */
function failure(error: unknown, language: Language): Response {
  if (error instanceof QuotaExhaustedError) {
    return reply(HTTP_UNAVAILABLE, { kind: 'busy', text: REFUSALS.busy[language] });
  }
  console.error(`ask failed: ${error instanceof Error ? error.name : 'unknown error'}`);
  return reply(HTTP_INTERNAL_ERROR, { kind: 'error', text: REFUSALS.error[language] });
}

function tracerFor(environment: AskEnvironment): Tracer {
  const { LANGFUSE_PUBLIC_KEY: publicKey, LANGFUSE_SECRET_KEY: secretKey } = environment;
  return publicKey && secretKey
    ? createLangfuseTracer({ publicKey, secretKey, baseUrl: LANGFUSE_EU_URL })
    : NO_TRACING;
}

function reply(status: number, body: AskResponse): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
