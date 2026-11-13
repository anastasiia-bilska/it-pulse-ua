import type pg from 'pg';
import type { Summary } from './ingest.ts';

/** A feed must gap on this many successful fetches in a row before we alert: one gap is noise. */
const GAP_STREAK = 3;
/** Alert when the last 24h brought less than this share of a typical day. */
const VOLUME_DROP_RATIO = 0.5;

/** Data checks after a run. Any problem turns the healthchecks.io ping into /fail. */
export async function findProblems(db: pg.Client, summary: Summary): Promise<string[]> {
  const problems = [
    failedFeedsProblem(summary.failedFeeds),
    await persistentGapsProblem(db, summary.gapFeeds),
    await volumeDropProblem(db),
  ];
  return problems.filter((problem) => problem !== undefined);
}

function failedFeedsProblem(failedFeeds: string[]): string | undefined {
  if (failedFeeds.length === 0) {
    return;
  }
  return `failed feeds (${failedFeeds.length}): ${failedFeeds.join(', ')}`;
}

// ---- coverage gaps -----------------------------------------------------------------------------

// Feeds whose last GAP_STREAK successful fetches all had a gap.
const PERSISTENT_GAPS_SQL = `
  select feed
  from (
    select feed, gap, row_number() over (partition by feed order by id desc) as recency
    from fetch_log
    where status = 200 and feed = any($1)
  ) as recent_fetches
  where recency <= $2
  group by feed
  having count(*) = $2 and bool_and(gap)
  order by feed`;

/** A single gap means a busy feed outran one poll. A streak means the poll interval is too slow. */
async function persistentGapsProblem(
  db: pg.Client,
  gapFeeds: string[],
): Promise<string | undefined> {
  if (gapFeeds.length === 0) {
    return;
  }
  const { rows } = await db.query<{ feed: string }>(PERSISTENT_GAPS_SQL, [gapFeeds, GAP_STREAK]);
  if (rows.length === 0) {
    return;
  }
  const feeds = rows.map((row) => row.feed).join(', ');
  return `coverage gaps on ${GAP_STREAK} runs in a row (${rows.length}): ${feeds}`;
}

// ---- volume drop -------------------------------------------------------------------------------

// New content versions per 24h window: window 0 is the last 24h, windows 1..7 the days before.
const DAILY_NEW_ITEMS_SQL = `
  select count(raw_item.id)::int as new_items
  from generate_series(0, 7) as days_ago
  left join raw_item
    on raw_item.first_seen >  now() - (days_ago + 1) * interval '1 day'
   and raw_item.first_seen <= now() - days_ago * interval '1 day'
  group by days_ago
  order by days_ago`;

const WEEK_OF_HISTORY_SQL = `
  select coalesce(min(first_seen) < now() - interval '8 days', false) as has_history
  from raw_item`;

/** A drop usually means a feed changed its format or we got blocked. */
async function volumeDropProblem(db: pg.Client): Promise<string | undefined> {
  if (!(await hasWeekOfHistory(db))) {
    return;
  }
  const [today = 0, ...previousDays] = await dailyNewItems(db);
  const typicalDay = median(previousDays);
  if (today >= typicalDay * VOLUME_DROP_RATIO) {
    return;
  }
  return `volume drop: ${today} new in 24h vs median ${typicalDay}`;
}

async function hasWeekOfHistory(db: pg.Client): Promise<boolean> {
  const { rows } = await db.query<{ has_history: boolean }>(WEEK_OF_HISTORY_SQL);
  return rows[0]?.has_history ?? false;
}

async function dailyNewItems(db: pg.Client): Promise<number[]> {
  const { rows } = await db.query<{ new_items: number }>(DAILY_NEW_ITEMS_SQL);
  return rows.map((row) => row.new_items);
}

export function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  const lower = sorted[middle - 1] ?? upper;
  return sorted.length % 2 === 0 ? (lower + upper) / 2 : upper;
}
