// Integration: «Запитай ринок» against real Postgres (as the read-only extractor role) and a local
// fake of Gemini. Fixtures are synthetic.
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { connectAs, resetDatabase, testDatabaseUrl } from '../../db/testing.ts';
import type { Tracer } from '../../observability/index.ts';
import { askMarket, type MarketAnswer } from '../index.ts';

// ---- types -------------------------------------------------------------------------------------

interface SeedVacancy {
  prefix: string;
  count: number;
  role: string;
  seniority: string;
  /** A monthly salary and its currency. */
  salary?: { amount: number; currency: 'USD' | 'UAH' };
  skill?: string;
}

// ---- constants ---------------------------------------------------------------------------------

const ADMIN_URL = testDatabaseUrl();
const NO_TRACING: Tracer = {
  recordGeneration: () => {
    // nothing to record
  },
  flush: () => Promise.resolve(),
};
const ANY = { role: null, seniority: null, skill: null, dimension: null };
/** 1 EUR = 1.2 USD, 1 UAH = 0.025 USD: round numbers keep the quartiles easy to check. */
const USD_RATES = { date: '16.11.2026', eur: 1.2, uah: 0.025 };

// ---- shared state (set up in before()) ---------------------------------------------------------

/** What the fake Gemini answers next: the plan to the router, then the text to the writer. */
let planAnswer: object = {};
let textAnswers: string[] = [];
let answerCalls = 0;
let server: Server;
let baseUrl = '';
let admin: pg.Client;
let extractor: pg.Client;

// ---- fakes -------------------------------------------------------------------------------------

function respond(request: IncomingMessage, response: ServerResponse): void {
  let body = '';
  request.on('data', (chunk: Buffer) => (body += chunk.toString()));
  request.on('end', () => {
    const { system_instruction: system } = JSON.parse(body) as { system_instruction: string };
    const isRouter = system.startsWith('You route questions');
    if (!isRouter) {
      answerCalls++;
    }
    const text = JSON.stringify(isRouter ? planAnswer : { answer: textAnswers.shift() ?? '' });
    response.writeHead(200).end(completed(text));
  });
}

function completed(text: string): string {
  return JSON.stringify({
    status: 'completed',
    usage: { total_input_tokens: 100, total_output_tokens: 50 },
    steps: [{ type: 'model_output', content: [{ type: 'text', text }] }],
  });
}

async function ask(plan: object, answers: string[] = []): Promise<MarketAnswer> {
  planAnswer = plan;
  textAnswers = answers;
  answerCalls = 0;
  return askMarket(extractor, 'синтетичне питання', {
    gemini: { apiKey: 'test-key', model: 'gemini-test', baseUrl },
    tracer: NO_TRACING,
    usdRates: USD_RATES,
    now: new Date(),
  });
}

// ---- database ----------------------------------------------------------------------------------

/** `count` analysed vacancies seen today, with the given facts. */
async function seedVacancies(seed: SeedVacancy): Promise<void> {
  for (let index = 0; index < seed.count; index++) {
    const externalId = `${seed.prefix}-${index}`;
    const { rows } = await admin.query<{ id: string }>(
      `insert into raw_item (source, external_id, content_hash, payload, first_seen)
       values ('djinni', $1, md5($1), '{"title": "Synthetic"}'::jsonb, now()) returning id`,
      [externalId],
    );
    await admin.query(
      `insert into sighting (source, external_id, pub_date, feed, first_seen, last_seen)
       values ('djinni', $1, now(), 'djinni:all', now(), now())`,
      [externalId],
    );
    const extraction = await admin.query<{ id: string }>(
      `insert into extraction (raw_item_id, extractor_version, model, prompt_hash, role, seniority,
                               salary_min, salary_currency, salary_period)
       values ($1, 'v1', 'gemini-test', 'hash', $2, $3, $4, $5, $6) returning id`,
      [
        rows[0]!.id,
        seed.role,
        seed.seniority,
        seed.salary?.amount ?? null,
        seed.salary?.currency ?? null,
        seed.salary ? 'month' : null,
      ],
    );
    if (seed.skill) {
      await admin.query(
        `insert into extraction_skill (extraction_id, raw_name, required) values ($1, $2, true)`,
        [extraction.rows[0]!.id, seed.skill],
      );
    }
  }
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
  const skill = await admin.query<{ id: string }>(
    `insert into skill (slug, name, category) values ('go', 'Go', 'language') returning id`,
  );
  await admin.query(
    `insert into skill_alias (alias, skill_id, source) values ('golang', $1, 'seed')`,
    [skill.rows[0]!.id],
  );
  await seedVacancies({
    prefix: 'go',
    count: 4,
    role: 'backend',
    seniority: 'senior',
    salary: { amount: 5000, currency: 'USD' },
    skill: 'golang',
  });
  await seedVacancies({
    prefix: 'be',
    count: 8,
    role: 'backend',
    seniority: 'senior',
    salary: { amount: 4000, currency: 'USD' },
  });
  await seedVacancies({
    prefix: 'qa',
    count: 3,
    role: 'qa',
    seniority: 'junior',
    // 40 000 UAH = 1000 USD at the test rate: counted only if converted.
    salary: { amount: 40_000, currency: 'UAH' },
  });
  await admin.query(
    `insert into job_run (job, started_at, status, backlog) values ('extract', now(), 'ok', 0)`,
  );
});

after(async () => {
  await extractor.end();
  await admin.end();
  server.close();
});

// ---- scenarios ---------------------------------------------------------------------------------

test('a salary question is answered from SQL quartiles, and the facts travel with the answer', async () => {
  const plan = { ...ANY, language: 'uk', tool: 'salary', role: 'backend', seniority: 'senior' };

  const answer = await ask(plan, ['Медіана 4000 USD на місяць, за 12 вакансіями.']);

  assert.equal(answer.kind, 'answered');
  assert.equal(answer.text, 'Медіана 4000 USD на місяць, за 12 вакансіями.');
  assert.deepEqual(answer.facts, {
    filters: { role: 'backend', seniority: 'senior' },
    windowDays: 30,
    tool: 'salary',
    currency: 'USD',
    period: 'month',
    includesEurUah: true,
    n: 12,
    p25: 4000,
    median: 4000,
    p75: 5000,
  });
});

test('a sample below 10 gets «даних замало» (UAH salaries counted) and never reaches the writer', async () => {
  const plan = { ...ANY, language: 'uk', tool: 'salary', role: 'qa', seniority: 'junior' };

  const answer = await ask(plan, ['Медіана 1000.']);

  assert.equal(answer.kind, 'insufficient');
  assert.match(answer.text, /^Даних замало: .* вакансій — 3, а потрібно щонайменше 10\.$/);
  assert.equal(answerCalls, 0);
});

test('a skill named by its alias is counted over analysed vacancies', async () => {
  const plan = { ...ANY, language: 'en', tool: 'skill_demand', role: 'backend', skill: 'GoLang' };

  const answer = await ask(plan, ['4 of 12 backend vacancies (33.3%) ask for Go.']);

  assert.equal(answer.kind, 'answered');
  assert.deepEqual(answer.facts, {
    filters: { role: 'backend', seniority: null },
    windowDays: 30,
    tool: 'skill_demand',
    analysed: 12,
    skill: 'Go',
    n: 4,
    percent: 33.3,
  });
});

test('top skills are canonical names with their share of analysed vacancies', async () => {
  const plan = { ...ANY, language: 'uk', tool: 'top_skills', role: 'backend' };

  const answer = await ask(plan, ['Go просять у 4 з 12 вакансій (33.3%).']);

  assert.equal(answer.kind, 'answered');
  assert.deepEqual(answer.facts, {
    filters: { role: 'backend', seniority: null },
    windowDays: 30,
    tool: 'top_skills',
    analysed: 12,
    skills: [{ value: 'Go', n: 4, percent: 33.3 }],
  });
});

test('a skill outside the taxonomy is said so, not guessed', async () => {
  const plan = { ...ANY, language: 'uk', tool: 'skill_demand', skill: 'Cobol' };

  const answer = await ask(plan);

  assert.equal(answer.kind, 'unknown_skill');
});

test('a distribution keeps "not_stated" as a value of its own', async () => {
  const plan = { ...ANY, language: 'en', tool: 'distribution', dimension: 'work_format' };

  const answer = await ask(plan, ['All 15 vacancies (100%) do not state a work format.']);

  assert.equal(answer.kind, 'answered');
  assert.deepEqual(answer.facts, {
    filters: { role: null, seniority: null },
    windowDays: 30,
    tool: 'distribution',
    analysed: 15,
    dimension: 'work_format',
    parts: [{ value: 'not_stated', n: 15, percent: 100 }],
  });
});

test('an invented number is retried once, then the agent declines', async () => {
  const plan = { ...ANY, language: 'uk', tool: 'salary', role: 'backend', seniority: 'senior' };

  const answer = await ask(plan, ['Медіана 4500.', 'Медіана 4600.']);

  assert.equal(answer.kind, 'failed');
  assert.equal(answerCalls, 2);
});

test('a question the data cannot answer gets the fixed reply without any SQL or writer', async () => {
  const plan = { ...ANY, language: 'en', tool: 'unsupported' };

  const answer = await ask(plan);

  assert.equal(answer.kind, 'unsupported');
  assert.equal(answerCalls, 0);
});

test('stale data adds the warning the dashboard banner would show', async () => {
  await admin.query(
    `insert into job_run (job, started_at, status, backlog) values ('extract', now(), 'quota_exhausted', 500)`,
  );
  const plan = { ...ANY, language: 'en', tool: 'salary' };

  const answer = await ask(plan, ['The median is 4000 USD a month over 15 vacancies.']);

  assert.equal(answer.kind, 'answered');
  assert.equal(answer.isStale, true);
  assert.match(answer.text, /Note: the data is currently updating with a delay/);
});
