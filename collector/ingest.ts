import type pg from 'pg';
import { XMLParser } from 'fast-xml-parser';
import { externalId, contentHash, type Source, type Payload } from './normalize.ts';

export interface Feed { source: Source; feed: string; url: string }

export interface Options {
  userAgent: string;
  delayMs: number;      // pause between feeds (politeness)
  retryBaseMs: number;  // backoff base for 429/5xx/network errors
  log?: (line: string) => void;
}

export interface Summary {
  feeds: number;
  items: number;
  newItems: number;
  failedFeeds: string[];
  gapFeeds: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // keep guids/titles as strings
  isArray: (name) => name === 'item' || name === 'category',
});

async function fetchFeed(url: string, lastModified: string | null, o: Options): Promise<Response> {
  const headers: Record<string, string> = { 'User-Agent': o.userAgent };
  if (lastModified) headers['If-Modified-Since'] = lastModified;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      if ((res.status !== 429 && res.status < 500) || attempt === 3) return res;
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      await sleep(Math.max(retryAfter * 1000, 2 ** attempt * o.retryBaseMs));
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(2 ** attempt * o.retryBaseMs);
    }
  }
}

interface Item { externalId: string; pubDate: Date; payload: Payload }

export function parseItems(source: Source, xml: string): Item[] {
  const rss = parser.parse(xml)?.rss;
  if (!rss?.channel) throw new Error('not an RSS document');
  const items: any[] = rss.channel.item ?? [];
  return items.map((it) => {
    const pubDate = new Date(it.pubDate);
    if (Number.isNaN(pubDate.getTime())) throw new Error(`bad pubDate: ${it.pubDate}`);
    return {
      externalId: externalId(source, String(it.guid ?? it.link)),
      pubDate,
      payload: {
        title: String(it.title ?? ''),
        description: String(it.description ?? ''),
        link: String(it.link),
        categories: (it.category ?? []).map(String),
      },
    };
  });
}

async function collectFeed(db: pg.Client, f: Feed, o: Options) {
  const state = await db.query('select last_modified from feed_state where feed = $1', [f.feed]);
  const res = await fetchFeed(f.url, state.rows[0]?.last_modified ?? null, o);

  if (res.status !== 200) {
    await db.query('insert into fetch_log (feed, status) values ($1, $2)', [f.feed, res.status]);
    return { status: res.status, items: 0, newItems: 0, gap: false };
  }

  // Parse before opening the transaction: a broken feed writes nothing.
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

export async function collectAll(db: pg.Client, feeds: Feed[], o: Options): Promise<Summary> {
  const s: Summary = { feeds: feeds.length, items: 0, newItems: 0, failedFeeds: [], gapFeeds: [] };
  for (const [i, f] of feeds.entries()) {
    try {
      const r = await collectFeed(db, f, o);
      s.items += r.items;
      s.newItems += r.newItems;
      if (r.gap) s.gapFeeds.push(f.feed);
      if (r.status !== 200 && r.status !== 304) s.failedFeeds.push(f.feed);
      // Counts only: Actions logs are public, never print vacancy text.
      o.log?.(`${f.feed}\t${r.status}\titems=${r.items}\tnew=${r.newItems}${r.gap ? '\tGAP' : ''}`);
    } catch (e) {
      s.failedFeeds.push(f.feed);
      o.log?.(`${f.feed}\tERROR\t${(e as Error).message}`);
    }
    if (i < feeds.length - 1) await sleep(o.delayMs);
  }
  return s;
}
