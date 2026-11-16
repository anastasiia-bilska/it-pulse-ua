// Step 2 of an answer (ADR 0021): fixed, parameterised SQL over vacancy_current. These are the only
// source of numbers the agent may state. The window, the n < 10 rule and the salary rule are the
// dashboard's (ADR 0011), so both always say the same.
import type pg from 'pg';
import {
  MIN_N,
  rateParameters,
  salaryRow,
  usdMonthSalarySql,
  WINDOW_DAYS,
  type Count,
  type UsdRates,
} from '../dashboard/index.ts';
import type { Dimension, Filters, Plan } from './plan.ts';

// ---- types -------------------------------------------------------------------------------------

export type ToolPlan = Exclude<Plan, { tool: 'unsupported' }>;

export interface Part {
  value: string;
  n: number;
  /** Rounded to 0.1 %. */
  percent: number;
}

export type Facts = { filters: Filters; windowDays: number } & (
  | {
      tool: 'salary';
      currency: 'USD';
      period: 'month';
      /** True when EUR and UAH salaries are counted too, at the NBU rate. */
      includesEurUah: boolean;
      n: number;
      p25: number;
      median: number;
      p75: number;
    }
  | { tool: 'top_skills'; analysed: number; skills: Part[] }
  | { tool: 'skill_demand'; analysed: number; skill: string; n: number; percent: number }
  | { tool: 'distribution'; analysed: number; dimension: Dimension; parts: Part[] }
);

export type ToolResult =
  | { kind: 'facts'; facts: Facts }
  /** The sample is below MIN_N: the agent must say «даних замало», never a number from it. */
  | { kind: 'insufficient'; n: number }
  | { kind: 'unknown_skill' };

// ---- constants ---------------------------------------------------------------------------------

const TOP_SKILLS = 10;
const PERCENT_SCALE = 1000;

/** $1 window days, $2 role, $3 seniority: the filters every tool shares. */
const FILTERED = `
  vacancy_current.last_seen > now() - make_interval(days => $1)
  and vacancy_current.extraction_id is not null
  and ($2::text is null or vacancy_current.role = $2)
  and ($3::text is null or vacancy_current.seniority = $3)`;

const ANALYSED_SQL = `select count(*)::int as n from vacancy_current where ${FILTERED}`;

// One salary per vacancy in USD per month, EUR and UAH at the NBU rate (the dashboard's rule);
// $4 and $5 are the EUR and UAH rates.
const SALARIES_SQL = `
  select salary
  from (select ${usdMonthSalarySql(4)} as salary from vacancy_current where ${FILTERED}) as converted
  where salary is not null`;

const TOP_SKILLS_SQL = `
  select resolved.skill_name as value, count(distinct vacancy_current.raw_item_id)::int as n
  from vacancy_current
  join extraction_skill_resolved resolved on resolved.extraction_id = vacancy_current.extraction_id
  where ${FILTERED} and resolved.skill_name is not null
  group by resolved.skill_name
  order by n desc, value
  limit $4`;

// A canonical name, slug or any effective alias (seed, LLM triage, human) names the skill.
const RESOLVE_SKILL_SQL = `
  select skill.id::text as id, skill.name
  from skill
  where normalize_skill_name(skill.name) = normalize_skill_name($1)
     or skill.slug = normalize_skill_name($1)
     or skill.id in (select skill_id from skill_alias_effective where alias = normalize_skill_name($1))
  order by skill.id
  limit 1`;

const SKILL_DEMAND_SQL = `
  select count(distinct vacancy_current.raw_item_id)::int as n
  from vacancy_current
  join extraction_skill_resolved resolved on resolved.extraction_id = vacancy_current.extraction_id
  where ${FILTERED} and resolved.skill_id = $4`;

// ---- functions ---------------------------------------------------------------------------------

/** Rates load only for a salary question; null (NBU unreachable) leaves USD salaries only. */
export async function runTool(
  db: pg.Client,
  plan: ToolPlan,
  loadUsdRates: () => Promise<UsdRates | null>,
): Promise<ToolResult> {
  switch (plan.tool) {
    case 'salary': {
      return salary(db, plan.filters, await loadUsdRates());
    }
    case 'top_skills': {
      return topSkills(db, plan.filters);
    }
    case 'skill_demand': {
      return skillDemand(db, plan.filters, plan.skill);
    }
    case 'distribution': {
      return distribution(db, plan.filters, plan.dimension);
    }
  }
}

async function salary(
  db: pg.Client,
  filters: Filters,
  usdRates: UsdRates | null,
): Promise<ToolResult> {
  const { rows } = await db.query<{ salary: number }>(SALARIES_SQL, [
    ...filterParameters(filters),
    ...rateParameters(usdRates),
  ]);
  const row = salaryRow(
    'all',
    rows.map((row) => row.salary),
  );
  if (row.median === null || row.p25 === null || row.p75 === null) {
    return { kind: 'insufficient', n: row.n };
  }
  const { n, p25, median, p75 } = row;
  return {
    kind: 'facts',
    facts: {
      ...base(filters),
      tool: 'salary',
      currency: 'USD',
      period: 'month',
      includesEurUah: usdRates !== null,
      n,
      p25,
      median,
      p75,
    },
  };
}

async function topSkills(db: pg.Client, filters: Filters): Promise<ToolResult> {
  const analysed = await countAnalysed(db, filters);
  if (analysed < MIN_N) {
    return { kind: 'insufficient', n: analysed };
  }
  const { rows } = await db.query<Count>(TOP_SKILLS_SQL, [
    ...filterParameters(filters),
    TOP_SKILLS,
  ]);
  const skills = rows.map((row) => ({ ...row, percent: toPercent(row.n, analysed) }));
  return { kind: 'facts', facts: { ...base(filters), tool: 'top_skills', analysed, skills } };
}

async function skillDemand(
  db: pg.Client,
  filters: Filters,
  skillName: string,
): Promise<ToolResult> {
  const skill = await resolveSkill(db, skillName);
  if (!skill) {
    return { kind: 'unknown_skill' };
  }
  const analysed = await countAnalysed(db, filters);
  if (analysed < MIN_N) {
    return { kind: 'insufficient', n: analysed };
  }
  const { rows } = await db.query<{ n: number }>(SKILL_DEMAND_SQL, [
    ...filterParameters(filters),
    skill.id,
  ]);
  const n = rows[0]?.n ?? 0;
  return {
    kind: 'facts',
    facts: {
      ...base(filters),
      tool: 'skill_demand',
      analysed,
      skill: skill.name,
      n,
      percent: toPercent(n, analysed),
    },
  };
}

/** Percents are over analysed vacancies; "not_stated" is a value of its own, never hidden. */
async function distribution(
  db: pg.Client,
  filters: Filters,
  dimension: Dimension,
): Promise<ToolResult> {
  const { rows } = await db.query<Count>(
    `select coalesce(${dimension}::text, 'not_stated') as value, count(*)::int as n
     from vacancy_current where ${FILTERED}
     group by 1 order by n desc, value`,
    filterParameters(filters),
  );
  const analysed = rows.reduce((sum, row) => sum + row.n, 0);
  if (analysed < MIN_N) {
    return { kind: 'insufficient', n: analysed };
  }
  const parts = rows.map((row) => ({ ...row, percent: toPercent(row.n, analysed) }));
  return {
    kind: 'facts',
    facts: { ...base(filters), tool: 'distribution', analysed, dimension, parts },
  };
}

async function countAnalysed(db: pg.Client, filters: Filters): Promise<number> {
  const { rows } = await db.query<{ n: number }>(ANALYSED_SQL, filterParameters(filters));
  return rows[0]?.n ?? 0;
}

async function resolveSkill(
  db: pg.Client,
  name: string,
): Promise<{ id: string; name: string } | undefined> {
  const { rows } = await db.query<{ id: string; name: string }>(RESOLVE_SKILL_SQL, [name]);
  return rows[0];
}

function filterParameters(filters: Filters): [number, string | null, string | null] {
  return [WINDOW_DAYS, filters.role, filters.seniority];
}

function base(filters: Filters): { filters: Filters; windowDays: number } {
  return { filters, windowDays: WINDOW_DAYS };
}

/** n of total as a percent rounded to 0.1, the precision the dashboard shows. */
function toPercent(n: number, total: number): number {
  return Math.round((n / total) * PERCENT_SCALE) / (PERCENT_SCALE / 100);
}
