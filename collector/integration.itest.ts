// Integration: real Postgres (TEST_DATABASE_URL, superuser, DESTROYS schema public) +
// local HTTP server serving synthetic RSS. Collector runs as the least-privilege role.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { migrate } from './migrate.ts';
import { collectAll, type Feed, type Options } from './ingest.ts';
import { findProblems } from './checks.ts';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
if (!ADMIN_URL) throw new Error('TEST_DATABASE_URL is required (superuser; schema public is wiped)');

// ---- synthetic feed server ---------------------------------------------------------------
type Route = { status: number; body?: string; headers?: Record<string, string> }[];
const routes = new Map<string, Route>(); // each request shifts one response; last one sticks
const hits = new Map<string, number>();
let server: Server;
let base = '';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rss = (items: string[]) =>
  `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>t</title>${items.join('')}</channel></rss>`;
const dou = (id: number, ts: number, title = `Synthetic role ${id}`) =>
  `<item><title>${esc(title)}</title><link>${base}/companies/acme/vacancies/${id}/?utm_source=jobsrss</link>` +
  `<description>${esc('<p>Synthetic description</p>')}</description><pubDate>${new Date(ts * 1000).toUTCString()}</pubDate>` +
  `<guid>${base}/companies/acme/vacancies/${id}/?${ts}</guid></item>`;
const djinni = (id: number, ts: number, cats: string[]) =>
  `<item><title>Synthetic ${id}</title><link>${base}/jobs/${id}-synthetic-slug/</link><description>d</description>` +
  `<pubDate>${new Date(ts * 1000).toUTCString()}</pubDate><guid>${base}/jobs/${id}-synthetic-slug/</guid>` +
  cats.map((c) => `<category>${c}</category>`).join('') + `</item>`;
const ok = (body: string): Route => [{ status: 200, body }];

const feeds = (): Feed[] => [
  { source: 'dou', feed: 'dou:A', url: `${base}/a` },
  { source: 'dou', feed: 'dou:B', url: `${base}/b` },
  { source: 'djinni', feed: 'djinni:all', url: `${base}/dj` },
];
const opts: Options = { userAgent: 'it-pulse-ua-test', delayMs: 0, retryBaseMs: 5 };

// ---- db helpers ---------------------------------------------------------------------------
let admin: pg.Client;
let collector: pg.Client;
const one = async (sql: string, args: unknown[] = []) => (await admin.query(sql, args)).rows[0];
const count = async (table: string) => Number((await one(`select count(*) as n from ${table}`)).n);

before(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '/';
    hits.set(path, (hits.get(path) ?? 0) + 1);
    const queue = routes.get(path);
    const r = queue ? (queue.length > 1 ? queue.shift()! : queue[0]) : { status: 404 };
    res.writeHead(r.status, r.headers).end(r.body ?? '');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  // Mirror production: role created outside migrations with Neon's read_only access.
  await admin.query(`
    drop schema if exists public cascade; create schema public;
    drop role if exists collector; create role collector login password 'collector';
    grant usage on schema public to collector;
    alter default privileges in schema public grant select on tables to collector;`);
  await migrate(ADMIN_URL, () => {});

  const url = new URL(ADMIN_URL);
  url.username = 'collector';
  url.password = 'collector';
  collector = new pg.Client({ connectionString: url.toString() });
  await collector.connect();
});

after(async () => {
  await collector?.end();
  await admin?.end();
  server?.close();
});

// Tests run in order and share state, like consecutive cron runs.
const T0 = 1_800_000_000;

test('first run stores each vacancy once, merges multi-category listings', async () => {
  routes.set('/a', ok(rss([dou(1, T0), dou(2, T0 + 60), dou(3, T0 + 120)])));
  routes.set('/b', ok(rss([dou(3, T0 + 120), dou(4, T0 + 180)])));
  routes.set('/dj', ok(rss([djinni(10, T0, ['Python', 'AI/ML']), djinni(11, T0, [])])));

  const s = await collectAll(collector, feeds(), opts);
  assert.deepEqual(s.failedFeeds, []);
  assert.deepEqual(s.gapFeeds, [], 'no gap on the very first fetch');
  assert.equal(s.newItems, 6);
  assert.equal(await count('raw_item'), 6);
  const v3 = await one(`select feeds from vacancy where source = 'dou' and external_id = '3'`);
  assert.deepEqual([...v3.feeds].sort(), ['dou:A', 'dou:B']);
  const v10 = await one(`select payload from raw_item where source = 'djinni' and external_id = '10'`);
  assert.deepEqual(v10.payload.categories, ['Python', 'AI/ML']);
});

test('identical second run is idempotent', async () => {
  const sightings = await count('sighting');
  const s = await collectAll(collector, feeds(), opts);
  assert.equal(s.newItems, 0);
  assert.deepEqual(s.gapFeeds, []);
  assert.equal(await count('raw_item'), 6);
  assert.equal(await count('sighting'), sightings);
});

test('bump: new guid timestamp adds a sighting, not a content version', async () => {
  routes.set('/a', ok(rss([dou(1, T0 + 999), dou(2, T0 + 60), dou(3, T0 + 120)])));
  const s = await collectAll(collector, feeds(), opts);
  assert.equal(s.newItems, 0);
  assert.equal(await count('raw_item'), 6);
  assert.equal(Number((await one(`select bumps from vacancy where external_id = '1'`)).bumps), 1);
});

test('edited vacancy produces a new raw version', async () => {
  routes.set('/a', ok(rss([dou(1, T0 + 999), dou(2, T0 + 60, 'Synthetic role 2 (edited)'), dou(3, T0 + 120)])));
  const s = await collectAll(collector, feeds(), opts);
  assert.equal(s.newItems, 1);
  assert.equal(Number((await one(`select count(*) as n from raw_item where external_id = '2'`)).n), 2);
});

test('gap is flagged when the oldest item of a fetch was never seen', async () => {
  routes.set('/a', ok(rss([dou(20, T0 + 2000), dou(21, T0 + 2100), dou(22, T0 + 2200)])));
  const s = await collectAll(collector, feeds(), opts);
  assert.deepEqual(s.gapFeeds, ['dou:A']);
  assert.ok((await findProblems(admin, s)).some((p) => p.startsWith('coverage gaps')));
});

test('429 is retried, persistent 500 and broken XML fail only their feed', async () => {
  const sameA = rss([dou(20, T0 + 2000), dou(21, T0 + 2100), dou(22, T0 + 2200)]);
  routes.set('/a', [{ status: 429, headers: { 'retry-after': '0' } }, { status: 200, body: sameA }]);
  routes.set('/b', [{ status: 500 }]);
  routes.set('/dj', ok('<rss><channel><item><title>broken'));
  hits.clear();
  const before = await count('raw_item');

  const s = await collectAll(collector, feeds(), opts);
  assert.equal(hits.get('/a'), 2, '429 retried once');
  assert.equal(hits.get('/b'), 4, '500 retried 3 times then given up');
  assert.deepEqual(s.failedFeeds.sort(), ['djinni:all', 'dou:B']);
  assert.equal(await count('raw_item'), before, 'broken feed wrote nothing');
  assert.equal((await one(`select status from fetch_log where feed = 'dou:B' order by id desc limit 1`)).status, 500);
  assert.ok((await findProblems(admin, s)).some((p) => p.startsWith('failed feeds (2)')));
});

test('collector role cannot destroy or rewrite history', async () => {
  for (const sql of [
    'delete from raw_item',
    'truncate sighting',
    'drop table fetch_log',
    `update raw_item set payload = '{}'`,
    `update sighting set pub_date = now()`,
  ]) {
    await assert.rejects(collector.query(sql), /permission denied|must be owner/, sql);
  }
});
