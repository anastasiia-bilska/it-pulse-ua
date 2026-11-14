// ISO weeks (Monday to Sunday, UTC) name the episodes: digest-2026-W46.

// ---- types -------------------------------------------------------------------------------------

export interface IsoWeek {
  /** "2026-W46". */
  label: string;
  /** Monday 00:00 UTC. */
  start: Date;
  /** Sunday, as YYYY-MM-DD. */
  lastDay: string;
}

// ---- constants ---------------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const ISO_WEEK_PATTERN = /^(\d{4})-W(\d{2})$/;
/** January 4th is always in week 1 (ISO 8601). */
const ALWAYS_IN_WEEK_ONE = 4;
const MAX_WEEK = 53;

// ---- functions ---------------------------------------------------------------------------------

/** "2026-W46" from a manual run; validated, because it comes from a workflow input. */
export function parseIsoWeek(label: string): IsoWeek {
  const match = ISO_WEEK_PATTERN.exec(label);
  const week = Number(match?.[2]);
  if (!match || week < 1 || week > MAX_WEEK) {
    throw new Error(`week must look like 2026-W46, got "${label}"`);
  }
  const start = new Date(mondayOfWeekOne(Number(match[1])).getTime() + (week - 1) * WEEK_MS);
  return { label, start, lastDay: isoDate(new Date(start.getTime() + 6 * DAY_MS)) };
}

/** The last full week before `now`: what a Monday run reports on. */
export function previousIsoWeek(now: Date): IsoWeek {
  const thisMonday = mondayOf(now);
  const start = new Date(thisMonday.getTime() - WEEK_MS);
  return parseIsoWeek(labelOf(start));
}

function mondayOfWeekOne(year: number): Date {
  return mondayOf(new Date(Date.UTC(year, 0, ALWAYS_IN_WEEK_ONE)));
}

function mondayOf(day: Date): Date {
  const midnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(midnight - daysSinceMonday * DAY_MS);
}

/** The ISO year is the year of the week's Thursday. */
function labelOf(monday: Date): string {
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.round((monday.getTime() - mondayOfWeekOne(year).getTime()) / WEEK_MS) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function isoDate(day: Date): string {
  return day.toISOString().slice(0, 10);
}
