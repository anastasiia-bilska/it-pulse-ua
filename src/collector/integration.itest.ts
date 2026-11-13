// Integration: real Postgres (TEST_DATABASE_URL, superuser, DESTROYS schema public) plus a local
// HTTP server serving synthetic RSS. The collector runs as the least-privilege role.
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { findProblems } from './checks.ts';
import { collectAll, type Feed, type Options, type Summary } from './ingest.ts';
import { connectAs, resetDatabase, testDatabaseUrl } from '../db/test-database.ts';

// ---- types -------------------------------------------------------------------------------------

interface Reply {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}

// ---- constants ---------------------------------------------------------------------------------

const ADMIN_URL = testDatabaseUrl();

/** Base pubDate of the synthetic vacancies (unix seconds). */
const T0 = 1_800_000_000;

const TEST_OPTIONS: Options = { userAgent: 'it-pulse-ua-test', delayMs: 0, retryBaseMs: 5 };

// ---- shared state (set up in before(), like one long-lived deployment) -------------------------

/** Replies per path: each request takes the next one, the last one repeats. */
const routes = new Map<string, Reply[]>();
const hits = new Map<string, number>();
let server: Server;
let baseUrl = '';
let admin: pg.Client;
let collector: pg.Client;

// ---- synthetic feed server ---------------------------------------------------------------------

function respond(request: IncomingMessage, response: ServerResponse): void {
  const path = request.url ?? '/';
  hits.set(path, (hits.get(path) ?? 0) + 1);
  const reply = nextReply(path);
  response.writeHead(reply.status, reply.headers).end(reply.body ?? '');
}

function nextReply(path: string): Reply {
  const queue = routes.get(path);
  if (!queue?.[0]) {
    return { status: 404 };
  }
  return queue.length > 1 ? queue.shift()! : queue[0];
}

function ok(body: string): Reply[] {
  return [{ status: 200, body }];
}

function feeds(): Feed[] {
  return [
    { source: 'dou', feed: 'dou:A', url: `${baseUrl}/a` },
    { source: 'dou', feed: 'dou:B', url: `${baseUrl}/b` },
    { source: 'djinni', feed: 'djinni:all', url: `${baseUrl}/dj` },
  ];
}

// ---- synthetic RSS (never real vacancy text) ---------------------------------------------------

function rss(items: string[]): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>t</title>` +
    `${items.join('')}</channel></rss>`
  );
}

function douItem(id: number, bumpedAt: number, title = `Synthetic role ${id}`): string {
  const page = `${baseUrl}/companies/acme/vacancies/${id}/`;
  return (
    `<item><title>${escapeXml(title)}</title><link>${page}?utm_source=jobsrss</link>` +
    `<description>${escapeXml('<p>Synthetic description</p>')}</description>` +
    `<pubDate>${rfc822(bumpedAt)}</pubDate><guid>${page}?${bumpedAt}</guid></item>`
  );
}

function djinniItem(id: number, categories: string[]): string {
  const page = `${baseUrl}/jobs/${id}-synthetic-slug/`;
  const categoryTags = categories.map((category) => `<category>${category}</category>`).join('');
  return (
    `<item><title>Synthetic ${id}</title><link>${page}</link><description>d</description>` +
    `<pubDate>${rfc822(T0)}</pubDate><guid>${page}</guid>${categoryTags}</item>`
  );
}

/** Items never seen before, so the oldest one of the fetch is unknown: a gap. */
function freshDouBatch(ids: number[]): string {
  return rss(ids.map((id) => douItem(id, T0 + id * 100)));
}

function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function rfc822(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toUTCString();
}

// ---- database ----------------------------------------------------------------------------------

function collect(): Promise<Summary> {
  return collectAll(collector, feeds(), TEST_OPTIONS);
}

async function queryOne<Row extends pg.QueryResultRow>(sql: string): Promise<Row> {
  const { rows } = await admin.query<Row>(sql);
  return rows[0]!;
}

/** `count('raw_item')`, or with a filter: `count("raw_item where external_id = '2'")`. */
async function count(rowsOf: string): Promise<number> {
  return Number((await queryOne<{ count: string }>(`select count(*) from ${rowsOf}`)).count);
}

async function hasProblem(summary: Summary, prefix: string): Promise<boolean> {
  const problems = await findProblems(admin, summary);
  return problems.some((problem) => problem.startsWith(prefix));
}

before(async () => {
  server = createServer(respond);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await resetDatabase(admin, ADMIN_URL);
  collector = await connectAs('collector', ADMIN_URL);
});

after(async () => {
  await collector.end();
  await admin.end();
  server.close();
});

// ---- scenarios: they run in order and share state, like consecutive cron runs -----------------

test('first run stores each vacancy once, merges multi-category listings', async () => {
  routes.set('/a', ok(rss([douItem(1, T0), douItem(2, T0 + 60), douItem(3, T0 + 120)])));
  routes.set('/b', ok(rss([douItem(3, T0 + 120), douItem(4, T0 + 180)])));
  routes.set('/dj', ok(rss([djinniItem(10, ['Python', 'AI/ML']), djinniItem(11, [])])));

  const summary = await collect();

  assert.deepEqual(summary.failedFeeds, []);
  assert.deepEqual(summary.gapFeeds, [], 'no gap on the very first fetch');
  assert.equal(summary.newItems, 6);
  assert.equal(await count('raw_item'), 6);
  const vacancy3 = await queryOne<{ feeds: string[] }>(
    `select feeds from vacancy where source = 'dou' and external_id = '3'`,
  );
  assert.deepEqual(vacancy3.feeds.toSorted(), ['dou:A', 'dou:B']);
  const vacancy10 = await queryOne<{ payload: { categories: string[] } }>(
    `select payload from raw_item where source = 'djinni' and external_id = '10'`,
  );
  assert.deepEqual(vacancy10.payload.categories, ['Python', 'AI/ML']);
});

test('identical second run is idempotent', async () => {
  const sightingsBefore = await count('sighting');

  const summary = await collect();

  assert.equal(summary.newItems, 0);
  assert.deepEqual(summary.gapFeeds, []);
  assert.equal(await count('raw_item'), 6);
  assert.equal(await count('sighting'), sightingsBefore);
});

test('bump: new guid timestamp adds a sighting, not a content version', async () => {
  routes.set('/a', ok(rss([douItem(1, T0 + 999), douItem(2, T0 + 60), douItem(3, T0 + 120)])));

  const summary = await collect();

  assert.equal(summary.newItems, 0);
  assert.equal(await count('raw_item'), 6);
  const vacancy1 = await queryOne<{ bumps: string }>(
    `select bumps from vacancy where external_id = '1'`,
  );
  assert.equal(Number(vacancy1.bumps), 1);
});

test('edited vacancy produces a new raw version', async () => {
  const edited = douItem(2, T0 + 60, 'Synthetic role 2 (edited)');
  routes.set('/a', ok(rss([douItem(1, T0 + 999), edited, douItem(3, T0 + 120)])));

  const summary = await collect();

  assert.equal(summary.newItems, 1);
  assert.equal(await count(`raw_item where external_id = '2'`), 2);
});

test('a one-off gap is logged; only the same feed gapping 3 runs in a row alerts', async () => {
  const batches = [
    [20, 21, 22],
    [30, 31, 32],
    [40, 41, 42],
  ];
  for (const [index, ids] of batches.entries()) {
    const run = index + 1;
    routes.set('/a', ok(freshDouBatch(ids)));

    const summary = await collect();

    assert.deepEqual(summary.gapFeeds, ['dou:A'], `run ${run} gapped`);
    assert.equal(await hasProblem(summary, 'coverage gaps'), run === 3, `run ${run}`);
  }
});

test('429 is retried, persistent 500 and broken XML fail only their feed', async () => {
  routes.set('/a', [
    { status: 429, headers: { 'retry-after': '0' } },
    { status: 200, body: freshDouBatch([40, 41, 42]) },
  ]);
  routes.set('/b', [{ status: 500 }]);
  routes.set('/dj', ok('<rss><channel><item><title>broken'));
  hits.clear();
  const rawItemsBefore = await count('raw_item');

  const summary = await collect();

  assert.equal(hits.get('/a'), 2, '429 retried once');
  assert.equal(hits.get('/b'), 4, '500 retried 3 times then given up');
  assert.deepEqual(summary.failedFeeds.toSorted(), ['djinni:all', 'dou:B']);
  assert.equal(await count('raw_item'), rawItemsBefore, 'broken feed wrote nothing');
  const lastFetchOfB = await queryOne<{ status: number }>(
    `select status from fetch_log where feed = 'dou:B' order by id desc limit 1`,
  );
  assert.equal(lastFetchOfB.status, 500);
  assert.ok(await hasProblem(summary, 'failed feeds (2)'));
});

test('collector role cannot destroy or rewrite history', async () => {
  const destructiveStatements = [
    'delete from raw_item',
    'truncate sighting',
    'drop table fetch_log',
    `update raw_item set payload = '{}'`,
    `update sighting set pub_date = now()`,
  ];
  for (const sql of destructiveStatements) {
    await assert.rejects(collector.query(sql), /permission denied|must be owner/, sql);
  }
});
