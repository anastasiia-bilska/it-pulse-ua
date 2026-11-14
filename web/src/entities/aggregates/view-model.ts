// Turns aggregates.json into what the widgets draw. Language-free and pure: labels and copy are
// applied by the widgets, so these rules are tested once for both languages.
import { fractionOf } from '../../shared/lib/index.ts';
import type { Aggregates, SalaryRow, Share } from './types.ts';

// ---- types -------------------------------------------------------------------------------------

/** leader: the largest stated value; missing: "not stated", drawn hatched and never hidden. */
export type BarTone = 'leader' | 'neutral' | 'missing';

export interface BarRow extends Share {
  /** n relative to the largest row shown: the bar's width. */
  fraction: number;
  tone: BarTone;
}

export interface ProfileSegment extends Share {
  isMissing: boolean;
}

export type ProfileDimension = keyof typeof PROFILE_ORDER;

export interface Kpis {
  vacancies: number;
  extracted: number;
  /** Remote vacancies among the analysed ones; null when nothing is analysed yet. */
  remote: Share | null;
  /** Vacancies with a USD monthly salary, the base of every salary number. */
  usdSalaries: number;
}

export type Insight =
  | { kind: 'domain'; value: string; n: number; share: number }
  | { kind: 'skill'; value: string; n: number; share: number }
  | { kind: 'missingSeniority'; n: number; share: number };

export interface SalaryGeometry {
  /** Left edge of the p25–p75 box, its width and the median line, as fractions of the scale. */
  boxStart: number;
  boxWidth: number;
  median: number;
}

// ---- constants ---------------------------------------------------------------------------------

export const NOT_STATED = 'not_stated';
const OTHER = 'other';

/** Stack order for the vacancy profile: a natural scale, not by size, so it reads the same daily. */
const PROFILE_ORDER = {
  seniority: ['intern', 'junior', 'middle', 'senior', 'lead'],
  work_format: ['remote', 'hybrid', 'office'],
  english: ['fluent', 'upper', 'intermediate', 'basic', 'none'],
  company_type: ['product', 'outsource', 'outstaff'],
} as const;

export const PROFILE_DIMENSIONS = Object.keys(PROFILE_ORDER) as ProfileDimension[];

/** Salary rows always list every level, so a level with no USD salaries says so instead of vanishing. */
const SENIORITY_ROWS = ['intern', 'junior', 'middle', 'senior', 'lead', NOT_STATED];

/** Salary axis ticks fall on thirds of the scale; a 1500 step keeps them round ($500 multiples). */
const SALARY_SCALE_STEP = 1500;

// ---- functions ---------------------------------------------------------------------------------

/** Bars for a distribution. "Not stated" stays in the list (ADR 0011) and is drawn hatched. */
export function barRows(shares: Share[], limit = shares.length): BarRow[] {
  const shown = shares.slice(0, limit);
  const largest = Math.max(0, ...shown.map((row) => row.n));
  const leader = shown.find((row) => !isUnspecific(row.value));
  return shown.map((row) => ({
    ...row,
    fraction: fractionOf(row.n, largest),
    tone: barTone(row, leader),
  }));
}

function barTone(row: Share, leader: Share | undefined): BarTone {
  if (row.value === NOT_STATED) {
    return 'missing';
  }
  return row === leader ? 'leader' : 'neutral';
}

function isUnspecific(value: string): boolean {
  return value === NOT_STATED || value === OTHER;
}

/** Profile stack: known values in their natural order, unknown ones after, "not stated" last. */
export function profileSegments(dimension: ProfileDimension, shares: Share[]): ProfileSegment[] {
  const order: readonly string[] = PROFILE_ORDER[dimension];
  const known = order.flatMap((value) => shares.filter((row) => row.value === value));
  const unknown = shares.filter((row) => !order.includes(row.value) && row.value !== NOT_STATED);
  const missing = shares.filter((row) => row.value === NOT_STATED);
  return [...known, ...unknown, ...missing].map((row) => ({
    ...row,
    isMissing: row.value === NOT_STATED,
  }));
}

export function kpis(aggregates: Aggregates): Kpis {
  return {
    vacancies: aggregates.totals.vacancies,
    extracted: aggregates.totals.extracted,
    remote: aggregates.distributions.work_format.find((row) => row.value === 'remote') ?? null,
    usdSalaries: sumN(aggregates.salaryUsdMonthBySeniority),
  };
}

function sumN(rows: { n: number }[]): number {
  return rows.reduce((sum, row) => sum + row.n, 0);
}

/** What stands out now: the top domain, the top skill and how many vacancies hide their level. */
export function insights(aggregates: Aggregates): Insight[] {
  const { extracted } = aggregates.totals;
  const domain = topStated(aggregates.distributions.domain);
  const skill = aggregates.topSkills[0];
  const missingSeniority = aggregates.distributions.seniority.find(
    (row) => row.value === NOT_STATED,
  );
  return [
    ...(domain ? [{ kind: 'domain' as const, ...domain }] : []),
    ...(skill ? [{ kind: 'skill' as const, ...skill, share: fractionOf(skill.n, extracted) }] : []),
    ...(missingSeniority
      ? [
          {
            kind: 'missingSeniority' as const,
            n: missingSeniority.n,
            share: missingSeniority.share,
          },
        ]
      : []),
  ];
}

function topStated(shares: Share[]): Share | undefined {
  return shares.find((row) => !isUnspecific(row.value));
}

/** One row per level in a fixed order, with n = 0 for a level that has no USD salaries yet. */
export function seniorityRows(rows: SalaryRow[]): SalaryRow[] {
  const listed = SENIORITY_ROWS.map(
    (group) =>
      rows.find((row) => row.group === group) ?? {
        group,
        n: 0,
        median: null,
        p25: null,
        p75: null,
      },
  );
  const extra = rows.filter((row) => !SENIORITY_ROWS.includes(row.group));
  return [...listed, ...extra];
}

/** The salary axis maximum: the largest p75 rounded up to a step, so every box fits. */
export function salaryScale(rows: SalaryRow[]): number {
  const largest = Math.max(0, ...rows.map((row) => row.p75 ?? 0));
  return Math.max(SALARY_SCALE_STEP, Math.ceil(largest / SALARY_SCALE_STEP) * SALARY_SCALE_STEP);
}

export function salaryGeometry(row: SalaryRow, scale: number): SalaryGeometry | null {
  if (row.median === null || row.p25 === null || row.p75 === null) {
    return null;
  }
  return {
    boxStart: row.p25 / scale,
    boxWidth: (row.p75 - row.p25) / scale,
    median: row.median / scale,
  };
}
