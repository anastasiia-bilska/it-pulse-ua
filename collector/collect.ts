import pg from 'pg';
import { XMLParser } from 'fast-xml-parser';
import { externalId, contentHash, type Source, type Payload } from './normalize.ts';

// From the category <select> on jobs.dou.ua/vacancies/. Recheck occasionally.
const DOU_CATEGORIES = [
  '.NET', 'Account Manager', 'AI/ML', 'Analyst', 'Android', 'Animator', 'Architect', 'Artist', 'Assistant',
  'Big Data', 'Blockchain', 'C++', 'C-level', 'Copywriter', 'Data Engineer', 'Data Science', 'DBA', 'Design',
  'DevOps', 'Embedded', 'Engineering Manager', 'Erlang', 'ERP/CRM', 'Finance', 'Flutter', 'Front End', 'Golang',
  'Hardware', 'HR', 'iOS/macOS', 'Java', 'Legal', 'Marketing', 'No-code', 'Node.js', 'Office Manager', 'Other',
  'PHP', 'Procurement', 'Product Manager', 'Project Manager', 'Python', 'QA', 'React Native', 'Ruby', 'Rust',
  'Sales', 'Salesforce', 'SAP', 'Scala', 'Scrum Master', 'Security', 'SEO', 'Support', 'SysAdmin',
  'Technical Writer', 'Unity', 'Unreal Engine', 'Військова справа',
];

const FEEDS: { source: Source; feed: string; url: string }[] = [
  ...DOU_CATEGORIES.map((c) => ({
    source: 'dou' as const,
    feed: `dou:${c}`,
    url: `https://jobs.dou.ua/vacancies/feeds/?category=${encodeURIComponent(c)}`,
  })),
  // Djinni general feed carries <category> tags. Switch to ?primary_keyword=X feeds if fetch_log shows gaps.
  { source: 'djinni', feed: 'djinni:all', url: 'https://djinni.co/jobs/rss/' },
];

const UA = process.env.COLLECTOR_UA ?? 'it-pulse-ua-collector/0.1 (non-commercial research)';
const DELAY_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // keep guids/titles as strings
  isArray: (name) => name === 'item' || name === 'category',
});

async function fetchFeed(url: string, lastModified: string | null): Promise<Response> {
  const headers: Record<string, string> = { 'User-Agent': UA };
  if (lastModified) headers['If-Modified-Since'] = lastModified;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if ((res.status !== 429 && res.status < 500) || attempt === 3) return res;
    const retryAfter = Number(res.headers.get('retry-after')) || 0;
    await sleep(Math.max(retryAfter * 1000, 2 ** attempt * 5000));
  }
}

interface Item { externalId: string; pubDate: Date; payload: Payload }

function parseItems(source: Source, xml: string): Item[] {
  const items: any[] = parser.parse(xml)?.rss?.channel?.item ?? [];
  return items.map((it) => ({
    externalId: externalId(source, String(it.guid ?? it.link)),
    pubDate: new Date(it.pubDate),
    payload: {
      title: String(it.title ?? ''),
      description: String(it.description ?? ''),
      link: String(it.link),
      categories: (it.category ?? []).map(String),
    },
  }));
}

async function collectFeed(db: pg.Client, f: (typeof FEEDS)[number]) {
  const state = await db.query('select last_modified from feed_state where feed = $1', [f.feed]);
  const res = await fetchFeed(f.url, state.rows[0]?.last_modified ?? null);

  if (res.status !== 200) {
    await db.query('insert into fetch_log (feed, status) values ($1, $2)', [f.feed, res.status]);
    return { status: res.status, items: 0, newItems: 0, gap: false };
  }

  const items = parseItems(f.source, await res.text());
  let newItems = 0;
  let gap = false;

  await db.query('begin');
  try {
    const prior = await db.query('select 1 from fetch_log where feed = $1 and status = 200 limit 1', [f.feed]);
    if (prior.rowCount && items.length) {
      const oldest = items.reduce((a, b) => (a.pubDate <= b.pubDate ? a : b));
      const seen = await db.query(
        'select 1 from sighting where source = $1 and external_id = $2 and pub_date = $3 and feed = $4',
        [f.source, oldest.externalId, oldest.pubDate, f.feed],
      );
      gap = seen.rowCount === 0;
    }

    for (const it of items) {
      const raw = await db.query(
        `insert into raw_item (source, external_id, content_hash, payload) values ($1, $2, $3, $4)
         on conflict do nothing`,
        [f.source, it.externalId, contentHash(it.payload), it.payload],
      );
      newItems += raw.rowCount ?? 0;
      await db.query(
        `insert into sighting (source, external_id, pub_date, feed) values ($1, $2, $3, $4)
         on conflict (source, external_id, pub_date, feed) do update set last_seen = now()`,
        [f.source, it.externalId, it.pubDate, f.feed],
      );
    }

    await db.query(
      `insert into feed_state (feed, last_modified) values ($1, $2)
       on conflict (feed) do update set last_modified = excluded.last_modified`,
      [f.feed, res.headers.get('last-modified')],
    );
    await db.query(
      'insert into fetch_log (feed, status, items, new_items, gap) values ($1, 200, $2, $3, $4)',
      [f.feed, items.length, newItems, gap],
    );
    await db.query('commit');
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
  return { status: 200, items: items.length, newItems, gap };
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let failed = 0;
const total = { items: 0, newItems: 0, gaps: 0, notModified: 0 };
for (const f of FEEDS) {
  try {
    const r = await collectFeed(db, f);
    total.items += r.items;
    total.newItems += r.newItems;
    total.gaps += Number(r.gap);
    total.notModified += Number(r.status === 304);
    // Counts only: Actions logs are public, never print vacancy text.
    console.log(`${f.feed}\t${r.status}\titems=${r.items}\tnew=${r.newItems}${r.gap ? '\tGAP' : ''}`);
  } catch (e) {
    failed++;
    console.error(`${f.feed}\tERROR\t${(e as Error).message}`);
  }
  await sleep(DELAY_MS);
}
await db.end();
console.log(`feeds=${FEEDS.length} failed=${failed}`, total);
if (failed > FEEDS.length / 2) process.exit(1);
