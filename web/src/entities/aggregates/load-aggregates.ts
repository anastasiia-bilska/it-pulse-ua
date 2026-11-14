// Fetches aggregates.json, the one input the page has. It is checked at the boundary: a broken file
// shows the error state instead of a half-drawn page.
import type { Aggregates } from './types.ts';

// ---- constants ---------------------------------------------------------------------------------

/** Relative, so it resolves next to index.html under the Pages base path. */
const DATA_URL = 'aggregates.json';
/** The parts every widget reads. */
const REQUIRED_KEYS = [
  'totals',
  'freshness',
  'distributions',
  'topSkills',
  'salaryUsdMonthBySeniority',
];

// ---- functions ---------------------------------------------------------------------------------

export async function loadAggregates(): Promise<Aggregates> {
  // Dev has no database: the synthetic fixture stands in. The branch is dropped from the build.
  if (import.meta.env.DEV) {
    const { SAMPLE_AGGREGATES } = await import('./sample-aggregates.ts');
    return SAMPLE_AGGREGATES;
  }
  const response = await fetch(DATA_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`aggregates.json: HTTP ${response.status}`);
  }
  const data: unknown = await response.json();
  if (!isAggregates(data)) {
    throw new Error('aggregates.json: unexpected shape');
  }
  return data;
}

/** A shallow check of the parts every widget reads; the producer is our own typed CLI. */
function isAggregates(data: unknown): data is Aggregates {
  return (
    typeof data === 'object' &&
    data !== null &&
    REQUIRED_KEYS.every((key) => Object.hasOwn(data, key))
  );
}
