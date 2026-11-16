// CLI: computes the public aggregates and writes aggregates.json next to the web build in
// dist/site (ADR 0011, ADR 0014). Run `npm run build:web` first: the build empties dist/site.
// Aggregates only: no vacancy text, titles, links or company names ever reach the page.
import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { DIMENSIONS, type Aggregates, type Dimension } from './aggregates.ts';
import { readLatestDigest } from './latest-digest.ts';
import {
  judgeFreshness,
  MIN_N,
  salaryRow,
  toShares,
  type Count,
  type Freshness,
  type PipelineStatus,
  type SalaryRow,
  type Share,
  WINDOW_DAYS,
} from './statistics.ts';
import { fetchUsdRates, rateParameters, usdMonthSalarySql, type UsdRates } from './usd-rates.ts';

// ---- types -------------------------------------------------------------------------------------

interface PipelineStatusRow {
  last_status: string | null;
  last_ok_at: Date | null;
  last_run_at: Date | null;
  backlog: number;
  last_processed: number | null;
}

// ---- constants ---------------------------------------------------------------------------------

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

// One salary per vacancy, in USD per month (usd-rates.ts); $2 and $3 are the EUR and UAH rates.
const USD_MONTH_SALARIES_SQL = `
  select role, seniority, salary
  from (
    select coalesce(role, 'not_stated') as role, coalesce(seniority, 'not_stated') as seniority,
           ${usdMonthSalarySql(2)} as salary
    from vacancy_current
    where ${IN_WINDOW}
  ) as converted
  where salary is not null`;

// The newest run's processed count is not in the view, so it is read from job_run itself.
const PIPELINE_STATUS_SQL = `
  select status.last_status, status.last_ok_at, status.last_run_at, status.backlog,
         (select processed from job_run where job = 'extract' order by id desc limit 1)
           as last_processed
  from pipeline_status status where status.job = 'extract'`;

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
  const rates = await fetchUsdRates();
  const salaries = await usdMonthSalaries(db, rates);
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
    salaryRatesDate: rates?.date ?? null,
    digest: await readLatestDigest(),
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
  rates: UsdRates | null,
): Promise<{ role: string; seniority: string; salary: number }[]> {
  const { rows } = await db.query<{ role: string; seniority: string; salary: number }>(
    USD_MONTH_SALARIES_SQL,
    [WINDOW_DAYS, ...rateParameters(rates)],
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
  const { rows } = await db.query<PipelineStatusRow>(PIPELINE_STATUS_SQL);
  return judgeFreshness(toPipelineStatus(rows[0]), new Date());
}

/** No row means extraction has never run. */
function toPipelineStatus(row: PipelineStatusRow | undefined): PipelineStatus {
  if (!row) {
    return { lastStatus: null, lastOkAt: null, backlog: 0 };
  }
  const status: PipelineStatus = {
    lastStatus: row.last_status,
    lastOkAt: row.last_ok_at,
    backlog: row.backlog,
  };
  return row.last_run_at
    ? { ...status, lastRun: { at: row.last_run_at, processed: row.last_processed ?? 0 } }
    : status;
}

await buildDashboard();
