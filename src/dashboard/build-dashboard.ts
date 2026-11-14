// CLI: computes the public aggregates and writes aggregates.json next to the web build in
// dist/site (ADR 0011, ADR 0013). Run `npm run build:web` first: the build empties dist/site.
// Aggregates only: no vacancy text, titles, links or company names ever reach the page.
import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { DIMENSIONS, type Aggregates, type Dimension } from './aggregates.ts';
import {
  judgeFreshness,
  MIN_N,
  salaryRow,
  toShares,
  type Count,
  type Freshness,
  type SalaryRow,
  type Share,
} from './statistics.ts';

// ---- constants ---------------------------------------------------------------------------------

/** Vacancies seen in the feeds within this window count as current. */
const WINDOW_DAYS = 30;
const TOP_SKILLS = 30;
const OUTPUT_DIRECTORY = new URL('../../dist/site/', import.meta.url);

const IN_WINDOW = `last_seen > now() - make_interval(days => $1)`;

const TOTALS_SQL = `
  select count(*)::int as vacancies, count(extraction_id)::int as extracted
  from vacancy_current where ${IN_WINDOW}`;

const TOP_SKILLS_SQL = `
  select resolved.skill_name as value, count(distinct vacancy_current.raw_item_id)::int as n
  from vacancy_current
  join extraction_skill_resolved resolved on resolved.extraction_id = vacancy_current.extraction_id
  where ${IN_WINDOW} and resolved.skill_name is not null
  group by resolved.skill_name
  order by n desc, value
  limit $2`;

// One salary per vacancy: the midpoint of the range, or the bound that is given.
const USD_MONTH_SALARIES_SQL = `
  select coalesce(role, 'not_stated') as role, coalesce(seniority, 'not_stated') as seniority,
         (coalesce(salary_min, salary_max) + coalesce(salary_max, salary_min))::float8 / 2 as salary
  from vacancy_current
  where ${IN_WINDOW} and salary_currency = 'USD' and salary_period = 'month'`;

const PIPELINE_STATUS_SQL = `
  select last_status, last_ok_at, backlog from pipeline_status where job = 'extract'`;

// ---- functions ---------------------------------------------------------------------------------

async function buildDashboard(): Promise<void> {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const aggregates = await computeAggregates(db);
    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    await writeFile(new URL('aggregates.json', OUTPUT_DIRECTORY), JSON.stringify(aggregates));
    console.log(
      `vacancies=${aggregates.totals.vacancies} extracted=${aggregates.totals.extracted} ` +
        `stale=${aggregates.freshness.isStale}`,
    );
  } finally {
    await db.end();
  }
}

async function computeAggregates(db: pg.Client): Promise<Aggregates> {
  const salaries = await usdMonthSalaries(db);
  return {
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    minN: MIN_N,
    freshness: await freshness(db),
    totals: await totals(db),
    distributions: await distributions(db),
    topSkills: await topSkills(db),
    salaryUsdMonthByRole: salaryTable(salaries, 'role'),
    salaryUsdMonthBySeniority: salaryTable(salaries, 'seniority'),
  };
}

async function totals(db: pg.Client): Promise<Aggregates['totals']> {
  const { rows } = await db.query<Aggregates['totals']>(TOTALS_SQL, [WINDOW_DAYS]);
  return rows[0] ?? { vacancies: 0, extracted: 0 };
}

/** Shares are over extracted vacancies; "not_stated" is a value of its own, never hidden. */
async function distributions(db: pg.Client): Promise<Record<Dimension, Share[]>> {
  const entries = await Promise.all(
    DIMENSIONS.map(async (dimension) => [dimension, toShares(await countBy(db, dimension))]),
  );
  return Object.fromEntries(entries) as Record<Dimension, Share[]>;
}

async function countBy(db: pg.Client, dimension: Dimension): Promise<Count[]> {
  const { rows } = await db.query<Count>(
    `select coalesce(${dimension}::text, 'not_stated') as value, count(*)::int as n
     from vacancy_current
     where ${IN_WINDOW} and extraction_id is not null
     group by 1 order by n desc, value`,
    [WINDOW_DAYS],
  );
  return rows;
}

async function topSkills(db: pg.Client): Promise<Count[]> {
  const { rows } = await db.query<Count>(TOP_SKILLS_SQL, [WINDOW_DAYS, TOP_SKILLS]);
  return rows;
}

async function usdMonthSalaries(
  db: pg.Client,
): Promise<{ role: string; seniority: string; salary: number }[]> {
  const { rows } = await db.query<{ role: string; seniority: string; salary: number }>(
    USD_MONTH_SALARIES_SQL,
    [WINDOW_DAYS],
  );
  return rows;
}

function salaryTable(
  salaries: { role: string; seniority: string; salary: number }[],
  groupBy: 'role' | 'seniority',
): SalaryRow[] {
  const groups = Object.groupBy(salaries, (row) => row[groupBy]);
  return Object.entries(groups)
    .map(([group, rows]) =>
      salaryRow(
        group,
        (rows ?? []).map((row) => row.salary),
      ),
    )
    .toSorted((a, b) => b.n - a.n);
}

async function freshness(db: pg.Client): Promise<Freshness> {
  const { rows } = await db.query<{
    last_status: string | null;
    last_ok_at: Date | null;
    backlog: number;
  }>(PIPELINE_STATUS_SQL);
  const status = rows[0];
  return judgeFreshness(
    {
      lastStatus: status?.last_status ?? null,
      lastOkAt: status?.last_ok_at ?? null,
      backlog: status?.backlog ?? 0,
    },
    new Date(),
  );
}

await buildDashboard();
