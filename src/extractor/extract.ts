// CLI entry point of the scheduled extraction job (GitHub Actions, after each collect run).
import type pg from 'pg';
import { tracerFromEnvironment } from '../observability/index.ts';
import { runScheduledJob } from '../shared/index.ts';
import { resolveSkills } from '../taxonomy/index.ts';
import { findRunProblems } from './checks.ts';
import {
  extractPending,
  QUOTA_WAIT_MS,
  REQUEST_INTERVAL_MS,
  type RunReport,
} from './extract-pending.ts';
import { GEMINI_BASE_URL } from './gemini.ts';
import { MODEL } from './prompt.ts';
import { recordJobRun } from './repository.ts';

// ---- constants ---------------------------------------------------------------------------------

/** ADR 0007: protects the free-tier quota. EXTRACT_LIMIT overrides it for a trial run. */
const DEFAULT_LIMIT = 300;

// ---- functions ---------------------------------------------------------------------------------

async function extract(db: pg.Client): Promise<string[]> {
  const startedAt = new Date();
  const tracer = tracerFromEnvironment();
  const report = await extractPending(db, {
    gemini: {
      apiKey: requiredEnvironment('GEMINI_API_KEY'),
      model: MODEL,
      baseUrl: process.env.GEMINI_BASE_URL ?? GEMINI_BASE_URL,
    },
    limit: runLimit(),
    requestIntervalMs: REQUEST_INTERVAL_MS,
    quotaWaitMs: QUOTA_WAIT_MS,
    tracer,
  });
  await tracer.flush();
  // New skill names go to the triage queue (ADR 0009).
  const unknownSkills = await resolveSkills(db);
  await recordJobRun(db, {
    startedAt,
    status: report.stoppedByQuota ? 'quota_exhausted' : 'ok',
    processed: report.processed,
    failed: report.failed,
    backlog: report.backlog,
  });
  console.log(`${summaryLine(report)} unknown_skills=${unknownSkills}`);
  return findRunProblems(db, report);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

/** EXTRACT_LIMIT comes from a manual workflow input, so it is validated, not trusted. */
function runLimit(): number {
  const limit = Number(process.env.EXTRACT_LIMIT ?? DEFAULT_LIMIT);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > DEFAULT_LIMIT) {
    throw new Error(`EXTRACT_LIMIT must be an integer from 1 to ${DEFAULT_LIMIT}`);
  }
  return limit;
}

/** Counts only: Actions logs are public. */
function summaryLine(report: RunReport): string {
  const dropped = Object.entries(report.dropped)
    .map(([field, count]) => `${field}:${count}`)
    .join(',');
  return [
    `processed=${report.processed}`,
    `failed=${report.failed}`,
    `quota_stop=${report.stoppedByQuota}`,
    `backlog=${report.backlog}`,
    `hallucination_dropped=${dropped}`,
  ].join(' ');
}

await runScheduledJob('extractor', extract);
