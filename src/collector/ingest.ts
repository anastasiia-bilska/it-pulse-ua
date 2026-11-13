import { setTimeout as sleep } from 'node:timers/promises';
import { XMLParser } from 'fast-xml-parser';
import type pg from 'pg';
import { inTransaction } from '../db/db.ts';
import { contentHash, externalId, type Payload, type Source } from './normalize.ts';

// ---- types -------------------------------------------------------------------------------------

export interface Feed {
  source: Source;
  feed: string;
  url: string;
}

export interface Options {
  userAgent: string;
  /** Pause between feeds, so we stay a polite RSS reader. */
  delayMs: number;
  /** Backoff base for 429, 5xx and network errors. */
  retryBaseMs: number;
  log?: (line: string) => void;
}

export interface Summary {
  feeds: number;
  items: number;
  newItems: number;
  failedFeeds: string[];
  gapFeeds: string[];
}

interface Item {
  externalId: string;
  pubDate: Date;
  payload: Payload;
}

interface FeedOutcome {
  status: number;
  items: number;
  newItems: number;
  gap: boolean;
}

interface RssItem {
  title?: string;
  description?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  category?: string[];
}

interface RssDocument {
  rss?: { channel?: { item?: RssItem[] } };
}

// ---- constants ---------------------------------------------------------------------------------

const HTTP_OK = 200;
const HTTP_NOT_MODIFIED = 304;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 20_000;

const rssParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // keep guids and titles as strings
  isArray: (tagName) => tagName === 'item' || tagName === 'category',
});

// ---- collecting all feeds ----------------------------------------------------------------------

export async function collectAll(db: pg.Client, feeds: Feed[], options: Options): Promise<Summary> {
  const summary: Summary = {
    feeds: feeds.length,
    items: 0,
    newItems: 0,
    failedFeeds: [],
    gapFeeds: [],
  };
  for (const [index, feed] of feeds.entries()) {
    if (index > 0) {
      await sleep(options.delayMs);
    }
    const outcome = await collectFeedSafely(db, feed, options);
    addToSummary(summary, feed.feed, outcome);
    options.log?.(describe(feed.feed, outcome));
  }
  return summary;
}

/** One broken feed must never stop the others, so its error becomes its outcome. */
async function collectFeedSafely(
  db: pg.Client,
  feed: Feed,
  options: Options,
): Promise<FeedOutcome | Error> {
  try {
    return await collectFeed(db, feed, options);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function addToSummary(summary: Summary, feedName: string, outcome: FeedOutcome | Error): void {
  if (outcome instanceof Error || !isSuccessful(outcome.status)) {
    summary.failedFeeds.push(feedName);
  }
  if (outcome instanceof Error) {
    return;
  }
  summary.items += outcome.items;
  summary.newItems += outcome.newItems;
  if (outcome.gap) {
    summary.gapFeeds.push(feedName);
  }
}

/** Counts only: Actions logs are public, never print vacancy text. */
function describe(feedName: string, outcome: FeedOutcome | Error): string {
  if (outcome instanceof Error) {
    return `${feedName}\tERROR\t${outcome.message}`;
  }
  const gapMarker = outcome.gap ? '\tGAP' : '';
  return `${feedName}\t${outcome.status}\titems=${outcome.items}\tnew=${outcome.newItems}${gapMarker}`;
}

function isSuccessful(status: number): boolean {
  return status === HTTP_OK || status === HTTP_NOT_MODIFIED;
}

// ---- collecting one feed -----------------------------------------------------------------------

async function collectFeed(db: pg.Client, feed: Feed, options: Options): Promise<FeedOutcome> {
  const headers = await requestHeaders(db, feed, options);
  const response = await fetchWithRetry(feed.url, headers, options.retryBaseMs);
  if (response.status !== HTTP_OK) {
    const outcome = { status: response.status, items: 0, newItems: 0, gap: false };
    await logFetch(db, feed, outcome);
    return outcome;
  }

  // Parse before opening the transaction: a broken feed writes nothing.
  const items = parseItems(feed.source, await response.text());
  return inTransaction(db, async () => {
    // Order matters: the gap check must run before this fetch's sightings are stored.
    const hasCoverageGap = await hasGap(db, feed, items);
    const newItems = await storeItems(db, feed, items);
    const outcome = { status: HTTP_OK, items: items.length, newItems, gap: hasCoverageGap };
    await saveLastModified(db, feed, response.headers.get('last-modified'));
    await logFetch(db, feed, outcome);
    return outcome;
  });
}

async function requestHeaders(
  db: pg.Client,
  feed: Feed,
  options: Options,
): Promise<Record<string, string>> {
  const { rows } = await db.query<{ last_modified: string | null }>(
    'select last_modified from feed_state where feed = $1',
    [feed.feed],
  );
  const lastModified = rows[0]?.last_modified;
  const headers: Record<string, string> = { 'User-Agent': options.userAgent };
  if (lastModified) {
    headers['If-Modified-Since'] = lastModified;
  }
  return headers;
}

// ---- HTTP with retries -------------------------------------------------------------------------

/** Retries 429, 5xx and network errors with backoff; the last attempt is returned or thrown as is. */
async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  retryBaseMs: number,
): Promise<Response> {
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
    const response = await fetchOrUndefined(url, headers);
    if (response && !isRetryable(response.status)) {
      return response;
    }
    await sleep(backoffMs(attempt, retryBaseMs, response));
  }
  return request(url, headers);
}

function request(url: string, headers: Record<string, string>): Promise<Response> {
  return fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

/** A network error is retried like a 5xx; `undefined` stands for "no response at all". */
async function fetchOrUndefined(
  url: string,
  headers: Record<string, string>,
): Promise<Response | undefined> {
  try {
    return await request(url, headers);
  } catch {
    return undefined;
  }
}

function isRetryable(status: number): boolean {
  return status === HTTP_TOO_MANY_REQUESTS || status >= HTTP_SERVER_ERROR;
}

/** Exponential backoff, but never sooner than the server's Retry-After (in seconds). */
function backoffMs(attempt: number, retryBaseMs: number, response?: Response): number {
  const exponentialMs = 2 ** (attempt - 1) * retryBaseMs;
  const retryAfterMs = (Number(response?.headers.get('retry-after')) || 0) * 1000;
  return Math.max(exponentialMs, retryAfterMs);
}

// ---- RSS parsing -------------------------------------------------------------------------------

export function parseItems(source: Source, xml: string): Item[] {
  const channel = (rssParser.parse(xml) as RssDocument).rss?.channel;
  if (!channel) {
    throw new Error('not an RSS document');
  }
  return (channel.item ?? []).map((rssItem) => toItem(source, rssItem));
}

function toItem(source: Source, rssItem: RssItem): Item {
  const pubDate = new Date(rssItem.pubDate ?? '');
  if (Number.isNaN(pubDate.getTime())) {
    throw new TypeError(`bad pubDate: ${rssItem.pubDate ?? 'missing'}`);
  }
  const payload = toPayload(rssItem);
  return { externalId: externalId(source, rssItem.guid ?? payload.link), pubDate, payload };
}

function toPayload(rssItem: RssItem): Payload {
  return {
    title: rssItem.title ?? '',
    description: rssItem.description ?? '',
    link: rssItem.link ?? '',
    categories: rssItem.category ?? [],
  };
}

// ---- storage -----------------------------------------------------------------------------------

/**
 * A gap means items scrolled out of the RSS window between two fetches: the feed was fetched
 * successfully before, yet the oldest item of this fetch was never seen in it.
 */
async function hasGap(db: pg.Client, feed: Feed, items: Item[]): Promise<boolean> {
  const oldest = items.toSorted((a, b) => a.pubDate.getTime() - b.pubDate.getTime())[0];
  return (
    oldest !== undefined && (await wasFetchedBefore(db, feed)) && !(await wasSeen(db, feed, oldest))
  );
}

async function wasFetchedBefore(db: pg.Client, feed: Feed): Promise<boolean> {
  const { rowCount } = await db.query(
    'select 1 from fetch_log where feed = $1 and status = 200 limit 1',
    [feed.feed],
  );
  return rowCount === 1;
}

async function wasSeen(db: pg.Client, feed: Feed, item: Item): Promise<boolean> {
  const { rowCount } = await db.query(
    `select 1 from sighting
     where source = $1 and external_id = $2 and pub_date = $3 and feed = $4`,
    [feed.source, item.externalId, item.pubDate, feed.feed],
  );
  return rowCount === 1;
}

/** Stores every item and returns how many of them were new content versions. */
async function storeItems(db: pg.Client, feed: Feed, items: Item[]): Promise<number> {
  let newItems = 0;
  for (const item of items) {
    newItems += await insertContentVersion(db, feed.source, item);
    await recordSighting(db, feed, item);
  }
  return newItems;
}

/** Returns 1 when this content was new, 0 when this exact version is already stored. */
async function insertContentVersion(db: pg.Client, source: Source, item: Item): Promise<number> {
  const { rowCount } = await db.query(
    `insert into raw_item (source, external_id, content_hash, payload) values ($1, $2, $3, $4)
     on conflict do nothing`,
    [source, item.externalId, contentHash(item.payload), item.payload],
  );
  return rowCount ?? 0;
}

async function recordSighting(db: pg.Client, feed: Feed, item: Item): Promise<void> {
  await db.query(
    `insert into sighting (source, external_id, pub_date, feed) values ($1, $2, $3, $4)
     on conflict (source, external_id, pub_date, feed) do update set last_seen = now()`,
    [feed.source, item.externalId, item.pubDate, feed.feed],
  );
}

async function saveLastModified(
  db: pg.Client,
  feed: Feed,
  lastModified: string | null,
): Promise<void> {
  await db.query(
    `insert into feed_state (feed, last_modified) values ($1, $2)
     on conflict (feed) do update set last_modified = excluded.last_modified`,
    [feed.feed, lastModified],
  );
}

async function logFetch(db: pg.Client, feed: Feed, outcome: FeedOutcome): Promise<void> {
  await db.query(
    'insert into fetch_log (feed, status, items, new_items, gap) values ($1, $2, $3, $4, $5)',
    [feed.feed, outcome.status, outcome.items, outcome.newItems, outcome.gap],
  );
}
