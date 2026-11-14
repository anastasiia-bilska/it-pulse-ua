// The public contract between `npm run dashboard` and the web page: the shape of aggregates.json.
// Aggregates only (ADR 0011): anything added here must carry no vacancy text, titles or links.
import type { Count, Freshness, SalaryRow, Share } from './statistics.ts';

// ---- types -------------------------------------------------------------------------------------

export interface Aggregates {
  generatedAt: string;
  windowDays: number;
  minN: number;
  freshness: Freshness;
  totals: { vacancies: number; extracted: number };
  distributions: Record<Dimension, Share[]>;
  topSkills: Count[];
  salaryUsdMonthByRole: SalaryRow[];
  salaryUsdMonthBySeniority: SalaryRow[];
  /** The latest audio digest episode, or null before the first one (ADR 0013). */
  digest: DigestEpisode | null;
}

/** Its scripts are written from aggregates only, so they are public like the rest. */
export interface DigestEpisode {
  /** Null for the trailer, published before the first weekly episode. */
  week: { label: string; firstDay: string; lastDay: string } | null;
  scripts: { uk: string; en: string };
}

export type Dimension = (typeof DIMENSIONS)[number];

// ---- constants ---------------------------------------------------------------------------------

/** Column names, used verbatim in SQL, so they come only from this list. */
export const DIMENSIONS = [
  'source',
  'role',
  'seniority',
  'work_format',
  'english',
  'company_type',
  'domain',
] as const;
