// POST /api/ask (ADR 0021): the Pages Function on the page's own origin. Every refusal (limit,
// invalid, busy) still comes back as {kind, text}, so the page shows the agent's own words.
import type { valueLabel } from '../../entities/aggregates/index.ts';
import type { Language } from '../../shared/lib/index.ts';

// ---- types -------------------------------------------------------------------------------------

/**
 * The endpoint's AskResponse (src/agent/ask-endpoint.ts), restated here: importing it would pull
 * the whole agent module into the web typecheck. isAgentReply checks every field at runtime.
 */
export interface AgentReply {
  /** answered, insufficient, unsupported, unknown_skill, failed, limit, busy, invalid or error. */
  kind: string;
  text: string;
  n?: number;
  minN?: number;
  windowDays?: number;
  chart?: ReplyChart;
}

/** A distribution (codes of a dimension) or top skills (dimension null: names as they are). */
export interface ReplyChart {
  dimension: Parameters<typeof valueLabel>[0] | null;
  bars: { value: string; n: number; percent: number }[];
}

// ---- constants ---------------------------------------------------------------------------------

const ASK_URL = '/api/ask';

// ---- functions ---------------------------------------------------------------------------------

/** Throws when there is no usable reply (offline, a proxy page, a malformed body): the caller says so. */
export async function requestAnswer(question: string, language: Language): Promise<AgentReply> {
  const response = await fetch(ASK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, language }),
  });
  const data: unknown = await response.json();
  if (!isAgentReply(data)) {
    throw new Error(`/api/ask: unexpected reply, HTTP ${response.status}`);
  }
  return data;
}

function isAgentReply(data: unknown): data is AgentReply {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const reply = data as Record<string, unknown>;
  return typeof reply.kind === 'string' && typeof reply.text === 'string' && hasValidNumbers(reply);
}

function hasValidNumbers(reply: Record<string, unknown>): boolean {
  return (
    isOptionalNumber(reply.n) &&
    isOptionalNumber(reply.minN) &&
    isOptionalNumber(reply.windowDays) &&
    (reply.chart === undefined || isChart(reply.chart))
  );
}

function isChart(chart: unknown): boolean {
  if (typeof chart !== 'object' || chart === null) {
    return false;
  }
  const { dimension, bars } = chart as Record<string, unknown>;
  return (
    (dimension === null || typeof dimension === 'string') &&
    Array.isArray(bars) &&
    bars.every((bar) => isBar(bar))
  );
}

function isBar(bar: unknown): boolean {
  if (typeof bar !== 'object' || bar === null) {
    return false;
  }
  const { value, n, percent } = bar as Record<string, unknown>;
  return typeof value === 'string' && typeof n === 'number' && typeof percent === 'number';
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === 'number';
}
