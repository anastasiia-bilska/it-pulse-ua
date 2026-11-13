// Picks the eval set (ADR 0007): 150 vacancies, stratified, with hard cases oversampled, and 30
// of them marked for blind labelling. Pure and deterministic: the same population and seed always
// give the same sample, so the set can be rebuilt and audited.
import { createHash } from 'node:crypto';

// ---- types -------------------------------------------------------------------------------------

export interface Candidate {
  rawItemId: string;
  source: string;
  role: string | null;
  seniority: string | null;
  /** The text the model read; used only to detect hard cases here. */
  text: string;
}

export type Labelling = 'blind' | 'prelabelled';

export interface SampledVacancy {
  candidate: Candidate;
  /** Why it was picked: a hard-case quota or the stratum it fills. */
  reason: string;
  labelling: Labelling;
}

interface HardCaseQuota {
  reason: string;
  size: number;
  matches: (text: string) => boolean;
}

// ---- constants ---------------------------------------------------------------------------------

export const SAMPLE_SIZE = 150;
export const BLIND_SIZE = 30;
const SEED = 'eval-set-v1';

const SALARY_STATED = /(?:[$€₴]\s?\d|\d\s?(?:[$€₴]|грн|uah|usd|eur)\b)/i;
const UNUSUAL_SALARY = /\d\s?k\b|gross|net\b|до\s?\d|від\s?\d|грн/i;
const CYRILLIC = /\p{Script=Cyrillic}/gu;
const LETTER = /\p{L}/gu;
/** Below this share of Cyrillic letters a vacancy counts as written in English. */
const ENGLISH_CYRILLIC_SHARE = 0.1;

/** Hard cases first, so the eval set tests what most often goes wrong. Quotas may overlap. */
const HARD_CASES: HardCaseQuota[] = [
  { reason: 'salary', size: 40, matches: (text) => SALARY_STATED.test(text) },
  { reason: 'english', size: 20, matches: isEnglish },
  { reason: 'unusual-salary', size: 20, matches: (text) => UNUSUAL_SALARY.test(text) },
];

// ---- functions ---------------------------------------------------------------------------------

export function sampleEvalSet(candidates: Candidate[]): SampledVacancy[] {
  const shuffled = candidates.toSorted((a, b) => rank(a).localeCompare(rank(b)));
  const picked = new Map<string, string>();
  for (const quota of HARD_CASES) {
    pickHardCases(shuffled, quota, picked);
  }
  fillByStratum(shuffled, picked);

  const chosen = shuffled.filter((candidate) => picked.has(candidate.rawItemId));
  return chosen.map((candidate, index) => ({
    candidate,
    reason: picked.get(candidate.rawItemId) ?? 'stratum',
    labelling: isBlindSlot(index) ? 'blind' : 'prelabelled',
  }));
}

function pickHardCases(
  shuffled: Candidate[],
  quota: HardCaseQuota,
  picked: Map<string, string>,
): void {
  const matching = shuffled.filter(
    (candidate) => !picked.has(candidate.rawItemId) && quota.matches(candidate.text),
  );
  const taken = matching.slice(0, quota.size);
  for (const candidate of taken) {
    picked.set(candidate.rawItemId, quota.reason);
  }
}

/**
 * Fills the rest round-robin over (source, role, seniority) strata, so rare roles and levels get
 * in before a common stratum gets a second vacancy.
 */
function fillByStratum(shuffled: Candidate[], picked: Map<string, string>): void {
  const remaining = shuffled.filter((candidate) => !picked.has(candidate.rawItemId));
  const strata = Object.values(Object.groupBy(remaining, (candidate) => stratum(candidate)));
  for (
    let round = 0;
    picked.size < SAMPLE_SIZE && strata.some((queue) => queue && queue.length > round);
    round++
  ) {
    const roundPicks = strata
      .map((queue) => queue?.[round])
      .filter((candidate) => candidate !== undefined);
    const taken = roundPicks.slice(0, SAMPLE_SIZE - picked.size);
    for (const candidate of taken) {
      picked.set(candidate.rawItemId, `stratum ${stratum(candidate)}`);
    }
  }
}

/** Every 5th slot of the shuffled sample: blind items spread across all strata and quotas. */
function isBlindSlot(index: number): boolean {
  const step = Math.floor(SAMPLE_SIZE / BLIND_SIZE);
  return index % step === 0 && index / step < BLIND_SIZE;
}

function stratum(candidate: Candidate): string {
  return [candidate.source, candidate.role ?? 'none', candidate.seniority ?? 'none'].join('/');
}

/** A seeded hash order: random-looking, but reproducible. */
function rank(candidate: Candidate): string {
  return createHash('sha256').update(`${SEED}:${candidate.rawItemId}`).digest('hex');
}

function isEnglish(text: string): boolean {
  const letters = text.match(LETTER)?.length ?? 0;
  const cyrillic = text.match(CYRILLIC)?.length ?? 0;
  return letters > 0 && cyrillic / letters < ENGLISH_CYRILLIC_SHARE;
}
