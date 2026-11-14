# 0018. The collector's clock moves to a Cloudflare Cron Trigger

- Status: accepted
- Date: 2026-11-14

## Context

`collect.yml` ran on a GitHub Actions schedule every 2 hours. GitHub runs scheduled workflows on a
best-effort basis and drops them under load: on the night of 2026-11-13 two slots in a row were
skipped, and on 2026-11-14 only 3 of 12 slots ran, with gaps of 6.5 and 9 hours. No data was lost
(the RSS windows are long), but extraction and the dashboard lagged, and the alerts were right to
fire. A longer healthchecks grace would only hide it.

## Decision

- A **Cloudflare Worker with a Cron Trigger** (`src/trigger`, `17 */2 * * *` UTC) calls the GitHub
  API to dispatch `collect.yml` on `main`. Cloudflare's cron is reliable and free, and the site is
  already on Cloudflare (ADR 0015).
- The Worker holds a **fine-grained GitHub token** that can only read and write Actions on this one
  repository (`COLLECT_DISPATCH_TOKEN`, uploaded as a Worker secret by `collect-trigger.yml`). It has
  no public URL. A refused dispatch fails the invocation loudly.
- Deployment is CI: `collect-trigger.yml` runs `wrangler deploy` on a change to `src/trigger`, with
  a Workers-only Cloudflare token (`CLOUDFLARE_WORKERS_API_TOKEN`).
- **Rollout:** the GitHub schedule stays as a backup until the Worker has fired on time for a day;
  `concurrency: collect` queues an overlapping run. A follow-up then drops the GitHub schedule, so
  DOU and Djinni are not polled twice.
- healthchecks.io keeps watching the outcome either way: a dead Worker or an expired token shows as
  a missing ping.

## Consequences

- One more moving part with a secret that expires: the token is set for a year; renewing it is a
  calendar item, and healthchecks catches it if forgotten.
- Rejected:
  - more cron lines on GitHub: they fail together under the same load;
  - an hourly GitHub schedule: twice the requests to the job boards, and still best effort;
  - a third-party cron service: one more vendor, when Cloudflare is already in use;
  - running the collector itself in a Worker: a rewrite for the same result.
