// Integration: the shared salary rule (usd-rates.ts) on real Postgres. Fixtures are synthetic.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { resetDatabase, testDatabaseUrl } from '../../db/testing.ts';
import { rateParameters, usdMonthSalarySql, type UsdRates } from '../usd-rates.ts';

// ---- constants ---------------------------------------------------------------------------------

const ADMIN_URL = testDatabaseUrl();
const RATES: UsdRates = { date: '16.11.2026', eur: 1.25, uah: 0.025 };

/** [external id, min, max, currency, period] of one synthetic vacancy each. */
const SALARIES: [string, number | null, number | null, string, string][] = [
  ['usd-range', 3000, 4000, 'USD', 'month'],
  ['eur-from', 2000, null, 'EUR', 'month'],
  ['uah-range', 40_000, 80_000, 'UAH', 'month'],
  ['usd-year', 60_000, 60_000, 'USD', 'year'],
];

const SALARIES_SQL = `
  select raw_item.external_id, ${usdMonthSalarySql(1)} as salary
  from vacancy_current join raw_item on raw_item.id = vacancy_current.raw_item_id
  order by raw_item.external_id`;

// ---- module state (set in before()) ------------------------------------------------------------

let admin: pg.Client;

// ---- lifecycle ---------------------------------------------------------------------------------

before(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await resetDatabase(admin, ADMIN_URL);
  for (const [externalId, min, max, currency, period] of SALARIES) {
    await seedSalary(externalId, [min, max, currency, period]);
  }
});

after(async () => {
  await admin.end();
});

// ---- functions ---------------------------------------------------------------------------------

async function seedSalary(externalId: string, salary: unknown[]): Promise<void> {
  const { rows } = await admin.query<{ id: string }>(
    `insert into raw_item (source, external_id, content_hash, payload)
     values ('djinni', $1, md5($1), '{"title": "Synthetic"}'::jsonb) returning id`,
    [externalId],
  );
  await admin.query(
    `insert into sighting (source, external_id, pub_date, feed) values ('djinni', $1, now(), 'x')`,
    [externalId],
  );
  await admin.query(
    `insert into extraction (raw_item_id, extractor_version, model, prompt_hash,
       salary_min, salary_max, salary_currency, salary_period)
     values ($1, 'v1', 'm', 'h', $2, $3, $4, $5)`,
    [rows[0]!.id, ...salary],
  );
}

async function salariesAt(rates: UsdRates | null): Promise<Record<string, number | null>> {
  const { rows } = await admin.query<{ external_id: string; salary: number | null }>(
    SALARIES_SQL,
    rateParameters(rates),
  );
  return Object.fromEntries(rows.map((row) => [row.external_id, row.salary]));
}

// ---- scenarios ---------------------------------------------------------------------------------

test('EUR and UAH salaries are converted to USD per month; other periods stay out', async () => {
  const salaries = await salariesAt(RATES);

  assert.deepEqual(salaries, {
    'eur-from': 2500,
    'uah-range': 1500,
    'usd-range': 3500,
    'usd-year': null,
  });
});

test('without rates only USD salaries count', async () => {
  const salaries = await salariesAt(null);

  assert.deepEqual(salaries, {
    'eur-from': null,
    'uah-range': null,
    'usd-range': 3500,
    'usd-year': null,
  });
});
