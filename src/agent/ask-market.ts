// «Запитай ринок» (ADR 0021): question → plan (model) → facts (SQL) → answer (model, number-guarded).
// Every answer that is not about numbers is a fixed text, so the model can't get it wrong.
import type pg from 'pg';
import {
  judgeFreshness,
  MIN_N,
  WINDOW_DAYS,
  type PipelineStatus,
  type UsdRates,
} from '../dashboard/index.ts';
import type { GeminiConfig } from '../extractor/index.ts';
import type { Tracer } from '../observability/index.ts';
import { writeAnswer } from './answer.ts';
import { planQuestion, type Language } from './plan.ts';
import { runTool, type Facts } from './tools.ts';

// ---- types -------------------------------------------------------------------------------------

export interface AgentContext {
  gemini: GeminiConfig;
  tracer: Tracer;
  /** Called only for salary questions: today's NBU rates, null when unreachable (USD only). */
  loadUsdRates: () => Promise<UsdRates | null>;
  now: Date;
}

export type MarketAnswer =
  | { kind: 'answered'; text: string; facts: Facts; isStale: boolean }
  | { kind: 'insufficient'; text: string; n: number }
  | { kind: 'unsupported' | 'unknown_skill' | 'failed'; text: string };

// ---- constants ---------------------------------------------------------------------------------

export const MIN_QUESTION_CHARS = 3;
export const MAX_QUESTION_CHARS = 300;

const PIPELINE_STATUS_SQL = `
  select last_status, last_ok_at, backlog from pipeline_status where job = 'extract'`;

/** Fixed texts. «даних замало» is the owner's rule for n < 10 (ADR 0011). */
const MESSAGES = {
  insufficient: {
    uk: (n: number) =>
      `Даних замало: під ці умови підходить вакансій — ${n}, а потрібно щонайменше ${MIN_N}.`,
    en: (n: number) => `Not enough data: ${n} vacancies match, and at least ${MIN_N} are needed.`,
  },
  unsupported: {
    uk: `На це питання дані не відповідають. Я можу розповісти про зарплати, скіли, формат роботи, англійську, тип компанії чи домен за останні ${WINDOW_DAYS} днів.`,
    en: `The data can't answer that. I can tell you about salaries, skills, work format, English, company type or domain over the last ${WINDOW_DAYS} days.`,
  },
  unknownSkill: {
    uk: 'Такого скіла немає в нашій таксономії, тож порахувати його не можу.',
    en: "That skill isn't in our taxonomy, so I can't count it.",
  },
  failed: {
    uk: 'Не вдалося сформулювати відповідь, яка спирається лише на дані. Спробуй перефразувати питання.',
    en: "I couldn't write an answer backed by the data alone. Try rephrasing the question.",
  },
  stale: {
    uk: 'Увага: дані зараз оновлюються із затримкою, тож цифри можуть бути неповними.',
    en: 'Note: the data is currently updating with a delay, so the numbers may be incomplete.',
  },
} as const;

// ---- functions ---------------------------------------------------------------------------------

/** The question must already be validated with `isValidQuestion` (a boundary check). */
export async function askMarket(
  db: pg.Client,
  question: string,
  context: AgentContext,
): Promise<MarketAnswer> {
  const plan = await planQuestion(context.gemini, question, context.tracer);
  const { language } = plan;
  if (plan.tool === 'unsupported') {
    return { kind: 'unsupported', text: MESSAGES.unsupported[language] };
  }
  const result = await runTool(db, plan, context.loadUsdRates);
  if (result.kind === 'insufficient') {
    return { kind: 'insufficient', text: MESSAGES.insufficient[language](result.n), n: result.n };
  }
  if (result.kind === 'unknown_skill') {
    return { kind: 'unknown_skill', text: MESSAGES.unknownSkill[language] };
  }
  return answerFromFacts(db, { question, language, facts: result.facts }, context);
}

export function isValidQuestion(question: string): boolean {
  const length = question.trim().length;
  return length >= MIN_QUESTION_CHARS && length <= MAX_QUESTION_CHARS;
}

async function answerFromFacts(
  db: pg.Client,
  request: { question: string; language: Language; facts: Facts },
  context: AgentContext,
): Promise<MarketAnswer> {
  const answer = await writeAnswer(context.gemini, request, context.tracer);
  if (answer.kind === 'rejected') {
    return { kind: 'failed', text: MESSAGES.failed[request.language] };
  }
  const isStale = await isDataStale(db, context.now);
  const text = isStale ? `${answer.text}\n\n${MESSAGES.stale[request.language]}` : answer.text;
  return { kind: 'answered', text, facts: request.facts, isStale };
}

/** The ADR 0007 rule the dashboard banner uses: the agent warns in the same cases. */
async function isDataStale(db: pg.Client, now: Date): Promise<boolean> {
  const { rows } = await db.query<{
    last_status: string | null;
    last_ok_at: Date | null;
    backlog: number;
  }>(PIPELINE_STATUS_SQL);
  const row = rows[0];
  const status: PipelineStatus = {
    lastStatus: row?.last_status ?? null,
    lastOkAt: row?.last_ok_at ?? null,
    backlog: row?.backlog ?? 0,
  };
  return judgeFreshness(status, now).isStale;
}
