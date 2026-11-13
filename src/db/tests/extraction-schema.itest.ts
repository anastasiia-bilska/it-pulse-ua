// Integration: the extraction layer schema (migration 003) on real Postgres, used through the
// least-privilege roles exactly as the pipeline will use it.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { connectAs, resetDatabase, testDatabaseUrl } from '../testing.ts';

// ---- types -------------------------------------------------------------------------------------

/** Raw content versions seeded in before(). */
interface SeededRawItems {
  vacancy1Old: string;
  vacancy1New: string;
  vacancy2: string;
}

interface ExtractionValues {
  rawItemId: string;
  version?: string;
  role?: string | null;
  seniority?: string | null;
  salary?: [number | null, number | null, string | null, string | null];
}

interface CurrentVacancy {
  raw_item_id: string;
  title: string;
  extractor_version: string | null;
  role: string | null;
}

// ---- constants ---------------------------------------------------------------------------------

const ADMIN_URL = testDatabaseUrl();

const EXTRACTION_COLUMNS = `raw_item_id, extractor_version, model, prompt_hash, role, seniority,
  salary_min, salary_max, salary_currency, salary_period, evidence`;

// ---- shared state (set up in before()) ---------------------------------------------------------

let admin: pg.Client;
let extractor: pg.Client;
let collector: pg.Client;
let raw: SeededRawItems;

// ---- fixtures (synthetic) ----------------------------------------------------------------------

/** Stores one content version of a vacancy plus a sighting, so it shows up in `vacancy`. */
async function seedRawVersion(externalId: string, title: string): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    `insert into raw_item (source, external_id, content_hash, payload)
     values ('dou', $1, md5($2), jsonb_build_object('title', $2::text, 'link', 'https://x/' || $1))
     returning id`,
    [externalId, title],
  );
  await admin.query(
    `insert into sighting (source, external_id, pub_date, feed) values ('dou', $1, now(), 'dou:A')
     on conflict do nothing`,
    [externalId],
  );
  return rows[0]!.id;
}

/** Inserts an extraction as the extractor role and returns its id. */
async function insertExtraction(values: ExtractionValues): Promise<string> {
  const [salaryMin, salaryMax, currency, period] = values.salary ?? [null, null, null, null];
  const { rows } = await extractor.query<{ id: string }>(
    `insert into extraction (${EXTRACTION_COLUMNS})
     values ($1, $2, 'gemini-test', 'hash', $3, $4, $5, $6, $7, $8, '{}') returning id`,
    [
      values.rawItemId,
      values.version ?? 'v1',
      values.role ?? null,
      values.seniority ?? null,
      salaryMin,
      salaryMax,
      currency,
      period,
    ],
  );
  return rows[0]!.id;
}

/** Vacancy 1 is the one with two content versions; the scenarios follow it. */
async function currentVacancy1(): Promise<CurrentVacancy> {
  const { rows } = await admin.query<CurrentVacancy>(
    `select raw_item_id, title, extractor_version, role from vacancy_current
     where external_id = '1'`,
  );
  return rows[0]!;
}

before(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await resetDatabase(admin, ADMIN_URL);
  extractor = await connectAs('extractor', ADMIN_URL);
  collector = await connectAs('collector', ADMIN_URL);

  raw = {
    vacancy1Old: await seedRawVersion('1', 'Synthetic role 1'),
    vacancy1New: await seedRawVersion('1', 'Synthetic role 1 (edited)'),
    vacancy2: await seedRawVersion('2', 'Synthetic role 2'),
  };
});

after(async () => {
  await extractor.end();
  await collector.end();
  await admin.end();
});

// ---- scenarios ---------------------------------------------------------------------------------

test('vacancy_current shows the latest content version, unextracted vacancies included', async () => {
  const vacancy1 = await currentVacancy1();
  assert.equal(vacancy1.raw_item_id, raw.vacancy1New);
  assert.equal(vacancy1.title, 'Synthetic role 1 (edited)');
  assert.equal(vacancy1.extractor_version, null, 'not extracted yet, still listed');
});

test('extractor appends an extraction with skills; vacancy_current picks it up', async () => {
  const extractionId = await insertExtraction({
    rawItemId: raw.vacancy1New,
    role: 'backend',
    seniority: 'senior',
    salary: [4000, 5000, 'USD', 'month'],
  });
  await extractor.query(
    `insert into extraction_skill (extraction_id, raw_name, required)
     values ($1, 'Python', true), ($1, 'k8s', false)`,
    [extractionId],
  );

  const vacancy1 = await currentVacancy1();

  assert.equal(vacancy1.extractor_version, 'v1');
  assert.equal(vacancy1.role, 'backend');
});

test('a newer extractor version wins, the old row stays for comparison', async () => {
  await insertExtraction({ rawItemId: raw.vacancy1New, version: 'v2', role: 'fullstack' });

  const vacancy1 = await currentVacancy1();
  const { rows } = await admin.query('select 1 from extraction where raw_item_id = $1', [
    raw.vacancy1New,
  ]);

  assert.equal(vacancy1.extractor_version, 'v2');
  assert.equal(vacancy1.role, 'fullstack');
  assert.equal(rows.length, 2);
});

test('constraints reject values the model must not produce', async () => {
  const invalid: [string, ExtractionValues][] = [
    ['unknown enum', { rawItemId: raw.vacancy2, role: 'astronaut' }],
    ['seniority outside the scale', { rawItemId: raw.vacancy2, seniority: 'god' }],
    ['min above max', { rawItemId: raw.vacancy2, salary: [5000, 4000, 'USD', 'month'] }],
    ['salary without currency', { rawItemId: raw.vacancy2, salary: [5000, null, null, 'month'] }],
    ['salary without period', { rawItemId: raw.vacancy2, salary: [5000, null, 'USD', null] }],
    ['negative salary', { rawItemId: raw.vacancy2, salary: [-1, null, 'USD', 'month'] }],
    ['duplicate version', { rawItemId: raw.vacancy1New, version: 'v1' }],
  ];
  for (const [reason, values] of invalid) {
    await assert.rejects(insertExtraction(values), /violates/, reason);
  }
});

test('the retry queue counts attempts', async () => {
  await extractor.query(
    `insert into extraction_error (raw_item_id, extractor_version, last_error)
     values ($1, 'v2', 'invalid JSON')`,
    [raw.vacancy2],
  );
  await extractor.query(
    `update extraction_error set attempts = attempts + 1, last_error = 'timeout',
            last_attempt_at = now()
     where raw_item_id = $1 and extractor_version = 'v2'`,
    [raw.vacancy2],
  );

  const { rows } = await admin.query<{ attempts: number }>(
    'select attempts from extraction_error where raw_item_id = $1',
    [raw.vacancy2],
  );

  assert.equal(rows[0]?.attempts, 2);
});

test('pipeline_status reports the latest run and the latest successful one', async () => {
  await extractor.query(
    `insert into job_run (job, started_at, finished_at, status, processed, backlog)
     values ('extract', now() - interval '3 hours', now() - interval '170 minutes', 'ok', 300, 10),
            ('extract', now() - interval '1 hour', now() - interval '50 minutes',
             'quota_exhausted', 40, 520)`,
  );

  const { rows } = await admin.query<{ last_status: string; backlog: number; is_stale: boolean }>(
    `select last_status, backlog, last_ok_at < last_run_at as is_stale
     from pipeline_status where job = 'extract'`,
  );

  assert.deepEqual(rows[0], { last_status: 'quota_exhausted', backlog: 520, is_stale: true });
});

test('extractor cannot rewrite results or touch the raw layer', async () => {
  const forbidden = [
    `update extraction set role = 'qa'`,
    'delete from extraction',
    'delete from extraction_skill',
    'delete from extraction_error',
    `update extraction_error set extractor_version = 'v9'`,
    'delete from job_run',
    `insert into raw_item (source, external_id, content_hash, payload) values ('dou', '9', 'h', '{}')`,
    `update sighting set last_seen = now()`,
  ];
  for (const sql of forbidden) {
    await assert.rejects(extractor.query(sql), /permission denied/, sql);
  }
});

test('collector cannot write extraction results', async () => {
  await assert.rejects(
    collector.query(
      `insert into extraction (raw_item_id, extractor_version, model, prompt_hash)
       values ($1, 'v9', 'm', 'h')`,
      [raw.vacancy2],
    ),
    /permission denied/,
  );
});
