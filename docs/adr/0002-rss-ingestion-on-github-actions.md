# 0002. Ingestion: category RSS feeds polled by GitHub Actions cron

- Status: accepted
- Date: 2026-11-13

## Context

- RSS has no history: trends only build up from the day collection starts, so the collector had to ship first.
- The general DOU feed (50 entries) covers about 1.5h on a weekday morning, most of it bumps. A DOU category feed holds 25 entries, and the busiest one (Marketing) spans about 38h. The Djinni general feed holds 100 entries over about 15h and carries `<category>` tags. Filtered Djinni feeds (`?primary_keyword=`) also exist.
- Both sites send `Last-Modified`, but both answer `If-Modified-Since` with 200, so conditional GET saves nothing.
- Clause 2.5 of the DOU terms (dou.ua/legal) forbids automated collection without the administration's consent. Content is CC BY-NC-SA. The Djinni terms say nothing about job listings. robots.txt on both sites allows the feeds.
- Budget is $0. A server (Oracle Always Free) is not guaranteed to have capacity.

## Decision

- Poll all 59 DOU category feeds and the Djinni general feed **every 2 hours** from a GitHub Actions cron job, sequentially, waiting 1s between requests. The User-Agent names the project repository.
- Retry with backoff on 429 and 5xx, honoring `Retry-After`.
- Log coverage to `fetch_log`. A fetch counts as a **gap** when its oldest entry was never seen before, meaning the feed moved past us between runs. The poll interval is tuned from this data, not from a one-off snapshot.
- Publish only extracted facts and links, never full vacancy texts. Raw texts stay in Postgres and never go into the repository or the Actions logs, which are public.
- Ask DOU and Djinni for consent. The repository owner decides whether to run the schedule before they reply.

## Consequences

- About 1,400 small requests a day and roughly 360 Actions runs a month. The repository is public, so Actions minutes are free.
- Scheduled runs can start late, and GitHub disables schedules in a public repository after 60 days without activity. This is acceptable for v1. If it becomes a problem, move the job into the NestJS worker (BullMQ repeatable job) on a VM.
- Backfilling history by walking DOU's sequential vacancy ids is possible, but it means scraping pages in bulk. It is out of scope.
- Rejected: polling only the general DOU feed, which would need ~15-minute polling at peak and gives no DOU category. Also rejected: scraping HTML pages, which is heavier and further from what the sites intend.
