// Pure rules for what the dashboard may show: shares always come with their n, small samples are
// suppressed ("даних замало"), and data freshness is judged by the ADR 0007 rule.

// ---- types -------------------------------------------------------------------------------------

export interface Count {
  value: string;
  n: number;
}

export interface Share extends Count {
  /** n / total, rounded to 0.1 %. */
  share: number;
}

export interface SalaryRow {
  group: string;
  n: number;
  /** null when n is below MIN_N: too few vacancies to state a number. */
  median: number | null;
  p25: number | null;
  p75: number | null;
}

export interface PipelineStatus {
  lastStatus: string | null;
  lastOkAt: Date | null;
  backlog: number;
}

export interface Freshness {
  isStale: boolean;
  /** Why the banner shows, as a code the page translates; null when fresh. */
  reason: StaleReason | null;
  lastOkAt: string | null;
  backlog: number;
}

/** quota: the AI model's daily limit is spent; failing: no successful run for too long. */
export type StaleReason = 'quota' | 'backlog' | 'failing' | 'never';

// ---- constants ---------------------------------------------------------------------------------

/** Below this many vacancies a statistic is not shown: "даних замало" (owner's rule). */
export const MIN_N = 10;
/** ADR 0007: the banner shows when the queue is longer than one run can take… */
const STALE_BACKLOG = 300;
/** …or when the last successful extraction run is older than this. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const PERCENT_PRECISION = 1000;

// ---- functions ---------------------------------------------------------------------------------

export function toShares(counts: Count[]): Share[] {
  const total = counts.reduce((sum, count) => sum + count.n, 0);
  return counts.map((count) => ({
    ...count,
    share: total === 0 ? 0 : Math.round((count.n / total) * PERCENT_PRECISION) / PERCENT_PRECISION,
  }));
}

/** Quartiles of the salaries in one group, or nulls when the group is too small to trust. */
export function salaryRow(group: string, salaries: number[]): SalaryRow {
  const sorted = salaries.toSorted((a, b) => a - b);
  if (sorted.length < MIN_N) {
    return { group, n: sorted.length, median: null, p25: null, p75: null };
  }
  return {
    group,
    n: sorted.length,
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
  };
}

/** Linear interpolation between closest ranks, rounded to a whole currency unit. */
function quantile(sorted: number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const lower = sorted[Math.floor(position)] ?? 0;
  const upper = sorted[Math.ceil(position)] ?? lower;
  return Math.round(lower + (upper - lower) * (position - Math.floor(position)));
}

export function judgeFreshness(status: PipelineStatus, now: Date): Freshness {
  const lastOkAt = status.lastOkAt?.toISOString() ?? null;
  const reason = staleReason(status, now);
  return { isStale: reason !== null, reason, lastOkAt, backlog: status.backlog };
}

function staleReason(status: PipelineStatus, now: Date): StaleReason | null {
  if (!status.lastOkAt) {
    return 'never';
  }
  const isOld = now.getTime() - status.lastOkAt.getTime() > STALE_AFTER_MS;
  if (!isOld && status.backlog <= STALE_BACKLOG) {
    return null;
  }
  if (status.lastStatus === 'quota_exhausted') {
    return 'quota';
  }
  return isOld ? 'failing' : 'backlog';
}
