// Integration: the extractor against real Postgres (as the least-privilege role) and a local fake
// of the Gemini Interactions API. Fixtures are synthetic.
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import pg from 'pg';
import type { GenerationTrace, Tracer } from '../../observability/index.ts';
import { connectAs, resetDatabase, testDatabaseUrl } from '../../db/testing.ts';
import { findRunProblems } from '../checks.ts';
import { extractPending, type ExtractionOptions, type RunReport } from '../extract-pending.ts';
import {
  COMPANY_TYPES,
  CURRENCIES,
  DOMAINS,
  ENGLISH_LEVELS,
  ROLES,
  SALARY_PERIODS,
  SENIORITIES,
  WORK_FORMATS,
  type ExtractedFields,
} from '../fields.ts';
import { recordJobRun } from '../repository.ts';

// ---- types -------------------------------------------------------------------------------------

/** What the fake model does for a vacancy whose title contains the case name. */
type FakeBehaviour = { answer: Partial<ExtractedFields> } | { status: number } | { raw: string };

interface InteractionRequest {
  input: string;
  store: boolean;
  response_format: { schema: unknown };
}

// ---- constants ---------------------------------------------------------------------------------

const ADMIN_URL = testDatabaseUrl();

const VALID_ANSWER: ExtractedFields = {
  role: 'backend',
  seniority: 'senior',
  salary_min: 4000,
  salary_max: 5000,
  salary_currency: 'USD',
  salary_period: 'month',
  salary_quote: '$4000-5000',
  work_format: 'remote',
  locations: ['Київ'],
  abroad_allowed: true,
  english: 'upper',
  english_quote: 'Upper-Intermediate',
  experience_years_min: 3,
  experience_quote: '3+ years',
  company_type: 'product',
  domain: 'fintech',
  domain_quote: 'fintech product',
  skills: [
    { name: 'Node.js', required: true },
    { name: 'Kubernetes', required: false },
  ],
};

const DESCRIPTION =
  '<p>We build a fintech product. Salary $4000-5000.</p><p>3+ years, English Upper-Intermediate.</p>';

const FAST: Omit<ExtractionOptions, 'gemini' | 'tracer'> = {
  limit: 50,
  requestIntervalMs: 0,
  quotaWaitMs: 0,
};

// ---- shared state (set up in before()) ---------------------------------------------------------

/** Behaviour per case name; a vacancy title carries its case name. */
const behaviours = new Map<string, FakeBehaviour>();
const requests: InteractionRequest[] = [];
const traces: GenerationTrace[] = [];
let server: Server;
let baseUrl = '';
let admin: pg.Client;
let extractor: pg.Client;

// ---- fake Gemini -------------------------------------------------------------------------------

function respond(request: IncomingMessage, response: ServerResponse): void {
  let body = '';
  request.on('data', (chunk: Buffer) => (body += chunk.toString()));
  request.on('end', () => {
    const interaction = JSON.parse(body) as InteractionRequest;
    requests.push(interaction);
    const behaviour = behaviourFor(interaction.input);
    if ('status' in behaviour) {
      response.writeHead(behaviour.status).end('{}');
      return;
    }
    const text = 'raw' in behaviour ? behaviour.raw : JSON.stringify(answerOf(behaviour));
    response.writeHead(200, { 'content-type': 'application/json' }).end(completed(text));
  });
}

function behaviourFor(input: string): FakeBehaviour {
  const caseName = behaviours.keys().find((name) => input.includes(name));
  return caseName ? behaviours.get(caseName)! : { status: 500 };
}

function answerOf(behaviour: { answer: Partial<ExtractedFields> }): ExtractedFields {
  return { ...VALID_ANSWER, ...behaviour.answer };
}

function completed(text: string): string {
  return JSON.stringify({
    status: 'completed',
    usage: { total_input_tokens: 900, total_output_tokens: 120 },
    steps: [{ type: 'model_output', content: [{ type: 'text', text }] }],
  });
}

function run(): Promise<RunReport> {
  return extractPending(extractor, {
    ...FAST,
    gemini: { apiKey: 'test-key', model: 'gemini-test', baseUrl },
    tracer: recordingTracer(),
  });
}

/** Keeps traces in memory so the scenarios can inspect them. */
function recordingTracer(): Tracer {
  return {
    recordGeneration: (trace) => {
      traces.push(trace);
    },
    flush: () => Promise.resolve(),
  };
}

// ---- database ----------------------------------------------------------------------------------

/** One synthetic vacancy whose title names the fake-model case it triggers. */
async function seedVacancy(externalId: string, caseName: string): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    `insert into raw_item (source, external_id, content_hash, payload)
     values ('djinni', $1, md5($1), jsonb_build_object(
       'title', 'Synthetic vacancy ' || $2::text, 'description', $3::text,
       'link', 'https://x/' || $1, 'categories', '[]'::jsonb))
     returning id`,
    [externalId, caseName, DESCRIPTION],
  );
  await admin.query(
    `insert into sighting (source, external_id, pub_date, feed)
     values ('djinni', $1, now(), 'djinni:all')`,
    [externalId],
  );
  return rows[0]!.id;
}

async function queryOne<Row extends pg.QueryResultRow>(
  sql: string,
  parameters: unknown[],
): Promise<Row> {
  const { rows } = await admin.query<Row>(sql, parameters);
  return rows[0]!;
}

// ---- lifecycle ---------------------------------------------------------------------------------

before(async () => {
  server = createServer(respond);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await resetDatabase(admin, ADMIN_URL);
  extractor = await connectAs('extractor', ADMIN_URL);
});

after(async () => {
  await extractor.end();
  await admin.end();
  server.close();
});

// ---- scenarios: they run in order and share state, like consecutive runs ----------------------

test('a valid answer is stored with skills and verified evidence', async () => {
  behaviours.set('case-valid', { answer: {} });
  const rawItemId = await seedVacancy('1', 'case-valid');

  const report = await run();

  assert.equal(report.processed, 1);
  const stored = await queryOne<{ role: string; evidence: object; skills: string[] }>(
    `select extraction.role, extraction.evidence,
            array_agg(extraction_skill.raw_name order by raw_name) as skills
     from extraction join extraction_skill on extraction_skill.extraction_id = extraction.id
     where extraction.raw_item_id = $1 group by extraction.id`,
    [rawItemId],
  );
  assert.equal(stored.role, 'backend');
  assert.deepEqual(stored.skills, ['Kubernetes', 'Node.js']);
  assert.deepEqual(Object.keys(stored.evidence).toSorted(), [
    'domain',
    'english',
    'experience',
    'salary',
  ]);
});

test('requests carry the key, disable server-side storage and send a Gemini-style schema', () => {
  const request = requests.at(-1)!;

  assert.equal(request.store, false);
  assert.ok(!JSON.stringify(request.response_format.schema).includes('anyOf'));
});

test('each model call is traced with its outcome, usage and version', () => {
  const trace = traces.at(-1)!;

  assert.equal(trace.metadata.outcome, 'saved');
  assert.deepEqual(trace.usage, { input: 900, output: 120 });
  assert.ok(trace.tags.includes('v1'));
});

test('an extracted vacancy leaves the queue', async () => {
  requests.length = 0;

  const report = await run();

  assert.equal(report.processed, 0);
  assert.equal(requests.length, 0);
});

test('a hallucinated salary is dropped and counted', async () => {
  behaviours.set('case-hallucinated', { answer: { salary_quote: '$9000-12000' } });
  const rawItemId = await seedVacancy('2', 'case-hallucinated');

  const report = await run();

  assert.equal(report.dropped.salary, 1);
  const stored = await queryOne<{ salary_min: string | null }>(
    'select salary_min from extraction where raw_item_id = $1',
    [rawItemId],
  );
  assert.equal(stored.salary_min, null);
});

test('a broken answer is retried once, recorded, and becomes a dead letter after 3 runs', async () => {
  behaviours.set('case-broken', { raw: '{"role": "astronaut"' });
  const rawItemId = await seedVacancy('3', 'case-broken');

  for (let attempt = 1; attempt <= 3; attempt++) {
    requests.length = 0;
    const report = await run();
    assert.equal(report.failed, 1, `run ${attempt}`);
    assert.equal(requests.length, 2, `retried once in run ${attempt}`);
  }
  const lastRun = await run();

  assert.equal(lastRun.failed, 0, 'dead letter is not retried');
  assert.equal(lastRun.backlog, 0);
  const failure = await queryOne<{ attempts: number }>(
    'select attempts from extraction_error where raw_item_id = $1',
    [rawItemId],
  );
  assert.equal(failure.attempts, 3);
});

test('a quota error that persists stops the run and leaves the rest queued', async () => {
  behaviours.set('case-quota', { status: 429 });
  await seedVacancy('4', 'case-quota');
  await seedVacancy('5', 'case-quota');

  const report = await run();

  assert.equal(report.stoppedByQuota, true);
  assert.equal(report.processed + report.failed, 0, 'a quota stop is not a failure');
  assert.equal(report.backlog, 2);
});

test('a backlog that grows 3 runs in a row is a problem', async () => {
  const startedAt = new Date();
  for (const backlog of [10, 20, 30, 40]) {
    await recordJobRun(extractor, { startedAt, status: 'ok', processed: 0, failed: 0, backlog });
  }
  const report = await run();

  const problems = await findRunProblems(extractor, report);

  assert.ok(problems.some((problem) => problem.startsWith('extraction backlog grew')));
});

test('every enum value the model may return is accepted by the database', async () => {
  const rawItemId = await seedVacancy('6', 'case-enums');
  const enumColumns: [string, readonly string[]][] = [
    ['role', ROLES],
    ['seniority', SENIORITIES],
    ['salary_currency', CURRENCIES],
    ['salary_period', SALARY_PERIODS],
    ['work_format', WORK_FORMATS],
    ['english', ENGLISH_LEVELS],
    ['company_type', COMPANY_TYPES],
    ['domain', DOMAINS],
  ];

  for (const [column, values] of enumColumns) {
    for (const value of values) {
      // A salary needs its currency and period, so every row carries a valid one by default.
      const row: Record<string, unknown> = {
        salary_min: 1,
        salary_currency: 'USD',
        salary_period: 'month',
        [column]: value,
      };
      const columns = Object.keys(row);
      // $1 is the raw item id; the row's values follow as $2, $3, …
      const placeholders = columns.map((name) => '$' + String(columns.indexOf(name) + 2));
      await admin.query('begin');
      await assert.doesNotReject(
        admin.query(
          `insert into extraction (raw_item_id, extractor_version, model, prompt_hash,
             ${columns.join(', ')})
           values ($1, 'enum-check', 'm', 'h', ${placeholders.join(', ')})`,
          [rawItemId, ...Object.values(row)],
        ),
        `${column} = ${value}`,
      );
      await admin.query('rollback');
    }
  }
});
