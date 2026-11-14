// Integration: one episode against real Postgres (as the read-only extractor role) and local fakes
// of Gemini and ElevenLabs. Fixtures are synthetic.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { connectAs, resetDatabase, testDatabaseUrl } from '../../db/testing.ts';
import type { Tracer } from '../../observability/index.ts';
import { parseIsoWeek } from '../iso-week.ts';
import { produceDigest } from '../produce-digest.ts';

// ---- constants ---------------------------------------------------------------------------------

const ADMIN_URL = testDatabaseUrl();
const WEEK = parseIsoWeek('2026-W46');
const THIS_WEEK_DAY = '2026-11-11T10:00:00Z';
const PREVIOUS_WEEK_DAY = '2026-11-04T10:00:00Z';
const FAKE_MP3 = 'ID3-fake-audio';
const NO_TRACING: Tracer = {
  recordGeneration: () => {
    // nothing to record
  },
  flush: () => Promise.resolve(),
};

// ---- shared state (set up in before()) ---------------------------------------------------------

/** What the fake Gemini answers next. */
let scriptAnswer = { uk: '', en: '' };
let quotaUsed = 0;
/** False mimics a key without the user-read permission: the usage endpoint answers 401. */
let canReadUsage = true;
const spoken: string[] = [];
let server: Server;
let baseUrl = '';
let admin: pg.Client;
let extractor: pg.Client;

// ---- fakes -------------------------------------------------------------------------------------

function respond(request: IncomingMessage, response: ServerResponse): void {
  let body = '';
  request.on('data', (chunk: Buffer) => (body += chunk.toString()));
  request.on('end', () => {
    if (request.url === '/v1beta/interactions') {
      response.writeHead(200).end(completed(JSON.stringify(scriptAnswer)));
    } else if (!canReadUsage && request.url === '/v1/user/subscription') {
      response.writeHead(401).end('{}');
    } else if (request.url === '/v1/user/subscription') {
      response
        .writeHead(200)
        .end(JSON.stringify({ character_count: quotaUsed, character_limit: 10_000 }));
    } else {
      spoken.push((JSON.parse(body) as { text: string }).text);
      response.writeHead(200, { 'content-type': 'audio/mpeg' }).end(FAKE_MP3);
    }
  });
}

function completed(text: string): string {
  return JSON.stringify({
    status: 'completed',
    usage: { total_input_tokens: 500, total_output_tokens: 300 },
    steps: [{ type: 'model_output', content: [{ type: 'text', text }] }],
  });
}

async function run(): Promise<{ problems: string[]; directory: URL }> {
  const directory = pathToFileURL(`${await mkdtemp(path.join(tmpdir(), 'digest-'))}/`);
  const problems = await produceDigest(extractor, {
    week: WEEK,
    gemini: { apiKey: 'test-key', model: 'gemini-test', baseUrl },
    elevenLabs: { apiKey: 'test-key', voiceId: 'test-voice', baseUrl },
    tracer: NO_TRACING,
    outputDirectory: directory,
  });
  return { problems, directory };
}

// ---- database ----------------------------------------------------------------------------------

/** `count` synthetic backend vacancies first seen on `day`, all analysed. */
async function seedVacancies(prefix: string, count: number, day: string): Promise<void> {
  for (let index = 0; index < count; index++) {
    const externalId = `${prefix}-${index}`;
    const { rows } = await admin.query<{ id: string }>(
      `insert into raw_item (source, external_id, content_hash, payload, first_seen)
       values ('djinni', $1, md5($1), '{"title": "Synthetic"}'::jsonb, $2) returning id`,
      [externalId, day],
    );
    await admin.query(
      `insert into sighting (source, external_id, pub_date, feed, first_seen, last_seen)
       values ('djinni', $1, $2, 'djinni:all', $2, $2)`,
      [externalId, day],
    );
    await admin.query(
      `insert into extraction (raw_item_id, extractor_version, model, prompt_hash, role)
       values ($1, 'v1', 'gemini-test', 'hash', 'backend')`,
      [rows[0]!.id],
    );
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
  await seedVacancies('this', 12, THIS_WEEK_DAY);
  await seedVacancies('previous', 10, PREVIOUS_WEEK_DAY);
});

after(async () => {
  await extractor.end();
  await admin.end();
  server.close();
});

// ---- scenarios ---------------------------------------------------------------------------------

test('an honest script becomes two audio files and the transcript', async () => {
  scriptAnswer = { uk: 'Цього тижня 12 вакансій, на 20% більше.', en: '12 vacancies, up 20%.' };

  const { problems, directory } = await run();

  assert.deepEqual(problems, []);
  assert.deepEqual(spoken, [scriptAnswer.uk, scriptAnswer.en]);
  assert.equal(await readFile(new URL('digest-uk.mp3', directory), 'utf8'), FAKE_MP3);
  const episode = JSON.parse(await readFile(new URL('digest.json', directory), 'utf8')) as {
    facts: { newVacancies: { thisWeek: number; changePercent: number } };
  };
  assert.deepEqual(episode.facts.newVacancies, {
    thisWeek: 12,
    previousWeek: 10,
    changePercent: 20,
  });
});

test('an invented number publishes nothing and reports why', async () => {
  spoken.length = 0;
  scriptAnswer = { uk: 'Цього тижня 13 вакансій.', en: '12 vacancies.' };

  const { problems, directory } = await run();

  assert.match(problems.join('; '), /script rejected \(uk: numbers not in the facts: 13\)/);
  assert.deepEqual(spoken, []);
  assert.equal(existsSync(new URL('digest.json', directory)), false);
});

test('an episode that would overrun the voice quota is not spoken', async () => {
  scriptAnswer = { uk: 'Вакансій 12.', en: '12 vacancies.' };
  quotaUsed = 9990;

  const { problems } = await run();

  assert.match(problems.join('; '), /ElevenLabs quota left 10/);
  assert.deepEqual(spoken, []);
});

test('the 80% quota mark is reported even when the episode is published', async () => {
  quotaUsed = 8000;

  const { problems, directory } = await run();

  assert.match(problems.join('; '), /ElevenLabs quota at 80%/);
  assert.equal(existsSync(new URL('digest.json', directory)), true);
});

test('a key that may not read its usage still publishes, without the quota checks', async () => {
  canReadUsage = false;
  quotaUsed = 9990;

  const { problems, directory } = await run();

  assert.deepEqual(problems, []);
  assert.equal(existsSync(new URL('digest.json', directory)), true);
});
