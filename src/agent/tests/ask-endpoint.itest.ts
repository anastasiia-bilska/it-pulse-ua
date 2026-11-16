// Integration: POST /api/ask against real Postgres, connecting as the read-only `agent` role the
// endpoint uses in production, with a local fake of Gemini. Fixtures are synthetic.
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import pg from 'pg';
import { resetDatabase, testDatabaseUrl } from '../../db/testing.ts';
import { handleAsk, type AskResponse } from '../index.ts';
import { CLIENT_DAILY_QUESTIONS, DAILY_QUESTIONS, hashClient } from '../quota.ts';

// ---- constants ---------------------------------------------------------------------------------

const ADMIN_URL = testDatabaseUrl();
const SALT = 'test-salt';
const VISITOR_IP = '203.0.113.7';
const HTTP_TOO_MANY_REQUESTS = 429;
const DISTRIBUTION_PLAN = {
  language: 'en',
  tool: 'distribution',
  role: null,
  seniority: null,
  skill: null,
  dimension: 'role',
};

// ---- shared state (set up in before()) ---------------------------------------------------------

let geminiStatus = 200;
let geminiCalls = 0;
let server: Server;
let geminiUrl = '';
let admin: pg.Client;
const pending: Promise<unknown>[] = [];

// ---- fakes -------------------------------------------------------------------------------------

function respond(request: IncomingMessage, response: ServerResponse): void {
  let body = '';
  request.on('data', (chunk: Buffer) => (body += chunk.toString()));
  request.on('end', () => {
    geminiCalls++;
    const { system_instruction: system } = JSON.parse(body) as { system_instruction: string };
    const answer = system.startsWith('You route questions')
      ? DISTRIBUTION_PLAN
      : { answer: 'All 12 analysed vacancies (100%) are backend.' };
    response.writeHead(geminiStatus).end(completed(JSON.stringify(answer)));
  });
}

function completed(text: string): string {
  return JSON.stringify({
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'text', text }] }],
  });
}

/** One POST from a visitor; waits for the work the endpoint hands to waitUntil. */
async function post(body: unknown): Promise<{ status: number; json: AskResponse }> {
  const agentUrl = new URL(ADMIN_URL);
  agentUrl.username = 'agent';
  agentUrl.password = 'agent';
  const response = await handleAsk({
    request: new Request('https://example.test/api/ask', {
      method: 'POST',
      headers: { 'cf-connecting-ip': VISITOR_IP },
      body: JSON.stringify(body),
    }),
    env: {
      DATABASE_URL: agentUrl.href,
      GEMINI_API_KEY: 'test-key',
      GEMINI_BASE_URL: geminiUrl,
      ASK_CLIENT_SALT: SALT,
    },
    waitUntil: (promise) => {
      pending.push(promise);
    },
  });
  await Promise.all(pending);
  return { status: response.status, json: (await response.json()) as AskResponse };
}

// ---- database ----------------------------------------------------------------------------------

async function seedBackendVacancies(count: number): Promise<void> {
  for (let index = 0; index < count; index++) {
    const externalId = `backend-${index}`;
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
    await admin.query(
      `insert into extraction (raw_item_id, extractor_version, model, prompt_hash, role)
       values ($1, 'v1', 'gemini-test', 'hash', 'backend')`,
      [rows[0]!.id],
    );
  }
}

/** Fills today's quota rows directly, as if earlier questions had been asked. */
async function recordQuestions(clientHash: string, count: number): Promise<void> {
  await admin.query(
    `insert into agent_question (client_hash) select $1 from generate_series(1, $2::int)`,
    [clientHash, count],
  );
}

async function questionsToday(): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(
    `select count(*)::int as n from agent_question where asked_on = current_date`,
  );
  return rows[0]?.n ?? 0;
}

// ---- lifecycle ---------------------------------------------------------------------------------

before(async () => {
  server = createServer(respond);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  geminiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await resetDatabase(admin, ADMIN_URL);
  await seedBackendVacancies(12);
  // A fresh extraction run: without one the answer carries the stale-data warning.
  await admin.query(
    `insert into job_run (job, started_at, status, backlog) values ('extract', now(), 'ok', 0)`,
  );
});

beforeEach(async () => {
  await admin.query('truncate agent_question');
  geminiStatus = 200;
  geminiCalls = 0;
});

after(async () => {
  await admin.end();
  server.close();
});

// ---- scenarios ---------------------------------------------------------------------------------

test('a question is answered and counted against the quota, as the agent role', async () => {
  const response = await post({ question: 'Which roles hire the most?', language: 'en' });

  assert.equal(response.status, 200);
  assert.deepEqual(response.json, {
    kind: 'answered',
    text: 'All 12 analysed vacancies (100%) are backend.',
  });
  assert.equal(await questionsToday(), 1);
});

test('a malformed question is refused before any quota or model use', async () => {
  const response = await post({ question: 'hi', language: 'uk' });

  assert.equal(response.status, 400);
  assert.deepEqual(response.json, {
    kind: 'invalid',
    text: 'Питання має бути від 3 до 300 символів.',
  });
  assert.equal(await questionsToday(), 0);
  assert.equal(geminiCalls, 0);
});

test('a visitor over the per-client cap is refused, without a model call', async () => {
  await recordQuestions(await hashClient(VISITOR_IP, new Date(), SALT), CLIENT_DAILY_QUESTIONS);

  const response = await post({ question: 'Which roles hire the most?', language: 'uk' });

  assert.equal(response.status, HTTP_TOO_MANY_REQUESTS);
  assert.equal(response.json.kind, 'limit');
  assert.match(response.json.text, /максимум питань/);
  assert.equal(geminiCalls, 0);
});

test('the daily cap stops everyone, whoever asked before', async () => {
  await recordQuestions('a'.repeat(64), DAILY_QUESTIONS);

  const response = await post({ question: 'Which roles hire the most?', language: 'en' });

  assert.equal(response.status, HTTP_TOO_MANY_REQUESTS);
  assert.match(response.json.text, /daily limit/);
  assert.equal(geminiCalls, 0);
});

test('a spent Gemini quota is a "busy" reply, not an error', async () => {
  geminiStatus = HTTP_TOO_MANY_REQUESTS;

  const response = await post({ question: 'Which roles hire the most?', language: 'en' });

  assert.equal(response.status, 503);
  assert.equal(response.json.kind, 'busy');
});

test('the client hash is hex, stable within a day and different the next day', async () => {
  const today = new Date('2026-11-16T10:00:00Z');
  const tomorrow = new Date('2026-11-17T10:00:00Z');

  const first = await hashClient(VISITOR_IP, today, SALT);

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(await hashClient(VISITOR_IP, today, SALT), first);
  assert.notEqual(await hashClient(VISITOR_IP, tomorrow, SALT), first);
});
