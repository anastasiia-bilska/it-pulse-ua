// The public endpoint's caps (ADR 0021): questions per day overall and per client. They keep the
// agent from spending the Gemini free-tier quota that extraction needs.
// ponytail: check-then-insert, so two concurrent questions can both pass the last free slot; a cap
// one or two over is harmless. A strict cap would need a lock or a counter row.
import type pg from 'pg';

// ---- types -------------------------------------------------------------------------------------

export type QuotaVerdict = 'allowed' | 'daily_cap' | 'client_cap';

// ---- constants ---------------------------------------------------------------------------------

/** About 200–300 Gemini calls a day: a small share of what extraction uses. */
export const DAILY_QUESTIONS = 100;
export const CLIENT_DAILY_QUESTIONS = 10;

const TODAY_COUNTS_SQL = `
  select count(*)::int as total, count(*) filter (where client_hash = $1)::int as mine
  from agent_question where asked_on = current_date`;

const RECORD_QUESTION_SQL = `insert into agent_question (client_hash) values ($1)`;

// ---- functions ---------------------------------------------------------------------------------

/** Records the question when both caps allow it; a refused question is not recorded. */
export async function claimQuestion(db: pg.Client, clientHash: string): Promise<QuotaVerdict> {
  const { rows } = await db.query<{ total: number; mine: number }>(TODAY_COUNTS_SQL, [clientHash]);
  const counts = rows[0] ?? { total: 0, mine: 0 };
  if (counts.total >= DAILY_QUESTIONS) {
    return 'daily_cap';
  }
  if (counts.mine >= CLIENT_DAILY_QUESTIONS) {
    return 'client_cap';
  }
  await db.query(RECORD_QUESTION_SQL, [clientHash]);
  return 'allowed';
}

/** sha256 of the IP, the UTC day and a secret salt, as hex: not reversible, new every day. */
export async function hashClient(ip: string, now: Date, salt: string): Promise<string> {
  const day = now.toISOString().slice(0, 10);
  const bytes = new TextEncoder().encode(`${ip}|${day}|${salt}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
