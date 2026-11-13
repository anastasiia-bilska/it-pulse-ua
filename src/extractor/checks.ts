// Run-level checks after an extraction run. Any problem turns the healthchecks.io ping into /fail.
import type pg from 'pg';
import type { RunReport } from './extract-pending.ts';
import { recentBacklogs } from './repository.ts';

// ---- constants ---------------------------------------------------------------------------------

/** Alert when more than this share of a run's vacancies failed. */
const MAX_FAILURE_SHARE = 0.1;
/** Below this many attempts a failure share is noise, not a signal. */
const MIN_ATTEMPTS_FOR_SHARE = 10;
/** Alert when the queue grew this many runs in a row: extraction can't keep up. */
const GROWING_BACKLOG_RUNS = 3;

// ---- functions ---------------------------------------------------------------------------------

export async function findRunProblems(db: pg.Client, report: RunReport): Promise<string[]> {
  const problems = [failureShareProblem(report), await growingBacklogProblem(db)];
  return problems.filter((problem) => problem !== undefined);
}

function failureShareProblem(report: RunReport): string | undefined {
  const attempts = report.processed + report.failed;
  if (attempts < MIN_ATTEMPTS_FOR_SHARE || report.failed / attempts <= MAX_FAILURE_SHARE) {
    return;
  }
  return `extraction failures: ${report.failed} of ${attempts}`;
}

/** Needs the current run already recorded in job_run. */
async function growingBacklogProblem(db: pg.Client): Promise<string | undefined> {
  const newestFirst = await recentBacklogs(db, GROWING_BACKLOG_RUNS + 1);
  if (newestFirst.length <= GROWING_BACKLOG_RUNS || !isStrictlyDecreasing(newestFirst)) {
    return;
  }
  return `extraction backlog grew ${GROWING_BACKLOG_RUNS} runs in a row: ${newestFirst.join(' <- ')}`;
}

/** Newest first, so a growing queue reads as strictly decreasing. */
function isStrictlyDecreasing(values: number[]): boolean {
  return values.every((value, index) => index === 0 || value < (values[index - 1] ?? value));
}
