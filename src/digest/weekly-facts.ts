// The facts of one week, compared with the week before. Every number the script may say comes
// from here (ADR 0013): the model never does arithmetic.
import type pg from 'pg';
import { MIN_N, salaryRow } from '../dashboard/index.ts';
import type { IsoWeek } from './iso-week.ts';

// ---- types -------------------------------------------------------------------------------------

export interface Change {
  thisWeek: number;
  previousWeek: number;
  /** Rounded to a whole percent; null when last week is too small to compare with. */
  changePercent: number | null;
}

export interface NamedChange extends Change {
  name: string;
}

export interface WeeklyFacts {
  week: string;
  firstDay: string;
  lastDay: string;
  newVacancies: Change;
  /** Share of this week's new vacancies already analysed, whole percent. */
  analysedPercent: number;
  /** Below ANALYSED_ENOUGH the script must call the numbers preliminary. */
  isPreliminary: boolean;
  topRoles: NamedChange[];
  topSkills: NamedChange[];
  /** Midpoint of the USD monthly range; null when n < MIN_N. */
  medianSalaryUsdMonth: { value: number; n: number } | null;
}

export interface WeekRows {
  totals: TotalsRow;
  roles: WeekCountRow[];
  skills: WeekCountRow[];
  salaries: number[];
}

interface TotalsRow {
  this_week: number;
  previous_week: number;
  analysed: number;
}

interface WeekCountRow {
  value: string;
  this_week: number;
  previous_week: number;
}

// ---- constants ---------------------------------------------------------------------------------

const ANALYSED_ENOUGH = 90;
const TOP_ROLES = 3;
const TOP_SKILLS = 5;
const PERCENT = 100;

// $1 is this week's Monday. Both weeks are read in one pass.
const TWO_WEEKS = `first_seen >= $1::timestamptz - interval '7 days'
                  and first_seen < $1::timestamptz + interval '7 days'`;
const THIS_WEEK = `first_seen >= $1::timestamptz`;

const TOTALS_SQL = `
  select count(*) filter (where ${THIS_WEEK})::int as this_week,
         count(*) filter (where not ${THIS_WEEK})::int as previous_week,
         count(extraction_id) filter (where ${THIS_WEEK})::int as analysed
  from vacancy_current where ${TWO_WEEKS}`;

const ROLES_SQL = `
  select role as value,
         count(*) filter (where ${THIS_WEEK})::int as this_week,
         count(*) filter (where not ${THIS_WEEK})::int as previous_week
  from vacancy_current where ${TWO_WEEKS} and role is not null
  group by role`;

const SKILLS_SQL = `
  select resolved.skill_name as value,
         count(distinct vacancy_current.raw_item_id) filter (where ${THIS_WEEK})::int as this_week,
         count(distinct vacancy_current.raw_item_id) filter (where not ${THIS_WEEK})::int
           as previous_week
  from vacancy_current
  join extraction_skill_resolved resolved on resolved.extraction_id = vacancy_current.extraction_id
  where ${TWO_WEEKS} and resolved.skill_name is not null
  group by resolved.skill_name`;

// One salary per vacancy: the midpoint of the range, or the bound that is given.
const SALARIES_SQL = `
  select (coalesce(salary_min, salary_max) + coalesce(salary_max, salary_min))::float8 / 2 as salary
  from vacancy_current
  where ${THIS_WEEK} and first_seen < $1::timestamptz + interval '7 days'
    and salary_currency = 'USD' and salary_period = 'month'`;

// ---- functions ---------------------------------------------------------------------------------

export async function loadWeeklyFacts(db: pg.Client, week: IsoWeek): Promise<WeeklyFacts> {
  const parameters = [week.start];
  // One client runs one query at a time, so these go in sequence.
  const totals = await db.query<TotalsRow>(TOTALS_SQL, parameters);
  const roles = await db.query<WeekCountRow>(ROLES_SQL, parameters);
  const skills = await db.query<WeekCountRow>(SKILLS_SQL, parameters);
  const salaries = await db.query<{ salary: number }>(SALARIES_SQL, parameters);
  const rows: WeekRows = {
    totals: totals.rows[0] ?? { this_week: 0, previous_week: 0, analysed: 0 },
    roles: roles.rows,
    skills: skills.rows,
    salaries: salaries.rows.map((row) => row.salary),
  };
  return toFacts(week, rows);
}

/** Pure: rows in, facts out. Small samples are dropped here, so the model never sees them. */
export function toFacts(week: IsoWeek, rows: WeekRows): WeeklyFacts {
  const { totals } = rows;
  const analysedPercent =
    totals.this_week === 0 ? 0 : Math.round((totals.analysed / totals.this_week) * PERCENT);
  return {
    week: week.label,
    firstDay: week.start.toISOString().slice(0, 10),
    lastDay: week.lastDay,
    newVacancies: change(totals.this_week, totals.previous_week),
    analysedPercent,
    isPreliminary: analysedPercent < ANALYSED_ENOUGH,
    topRoles: topChanges(rows.roles, TOP_ROLES),
    topSkills: topChanges(rows.skills, TOP_SKILLS),
    medianSalaryUsdMonth: medianSalary(rows.salaries),
  };
}

function topChanges(rows: WeekCountRow[], limit: number): NamedChange[] {
  return rows
    .filter((row) => row.this_week >= MIN_N)
    .toSorted((a, b) => b.this_week - a.this_week || a.value.localeCompare(b.value))
    .slice(0, limit)
    .map((row) => ({ name: row.value, ...change(row.this_week, row.previous_week) }));
}

function change(thisWeek: number, previousWeek: number): Change {
  const changePercent =
    previousWeek < MIN_N ? null : Math.round(((thisWeek - previousWeek) / previousWeek) * PERCENT);
  return { thisWeek, previousWeek, changePercent };
}

function medianSalary(salaries: number[]): WeeklyFacts['medianSalaryUsdMonth'] {
  const row = salaryRow('all', salaries);
  return row.median === null ? null : { value: row.median, n: row.n };
}
