import type pg from 'pg';
import type { Summary } from './ingest.ts';

const GAP_STREAK = 3;

// Data checks after a run. Any returned problem turns the healthchecks.io ping into /fail.
export async function findProblems(db: pg.Client, s: Summary): Promise<string[]> {
  const problems: string[] = [];
  if (s.failedFeeds.length) problems.push(`failed feeds (${s.failedFeeds.length}): ${s.failedFeeds.join(', ')}`);
  // A single gap is expected noise (a busy feed outran one poll). Alert only when the same feed
  // gapped on its last GAP_STREAK successful fetches: then the poll interval really is too slow.
  if (s.gapFeeds.length) {
    const { rows: persistent } = await db.query<{ feed: string }>(`
      select feed from (
        select feed, gap, row_number() over (partition by feed order by id desc) as rn
        from fetch_log where status = 200 and feed = any($1)
      ) t where rn <= $2
      group by feed having count(*) = $2 and bool_and(gap)
      order by feed`, [s.gapFeeds, GAP_STREAK]);
    if (persistent.length) {
      problems.push(`coverage gaps on ${GAP_STREAK} runs in a row (${persistent.length}): ${persistent.map((r) => r.feed).join(', ')}`);
    }
  }

  // Volume: new raw items in the last 24h vs median of the 7 previous 24h windows.
  // A drop usually means a feed format change or that we got blocked.
  const { rows } = await db.query<{ w: number; n: string }>(`
    select w, count(r.id) as n
    from generate_series(0, 7) as w
    left join raw_item r
      on r.first_seen >  now() - (w + 1) * interval '1 day'
     and r.first_seen <= now() - w * interval '1 day'
    group by w order by w`);
  const oldest = await db.query<{ ok: boolean }>(
    `select min(first_seen) < now() - interval '8 days' as ok from raw_item`,
  );
  if (oldest.rows[0]?.ok) {
    const today = Number(rows[0].n);
    const prev = rows.slice(1).map((r) => Number(r.n)).sort((a, b) => a - b);
    const median = (prev[3] + prev[4]) / 2;
    if (today < median * 0.5) problems.push(`volume drop: ${today} new in 24h vs median ${median}`);
  }
  return problems;
}
