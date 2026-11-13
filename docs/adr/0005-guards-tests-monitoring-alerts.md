# 0005. Guards: tests, eval harnesses, data checks, alerts

- Status: accepted
- Date: 2026-11-13

## Context

The pipeline runs unattended on a cron, and its history can't be rebuilt (ADR 0002). The failures that hurt most here are silent ones:
- a feed changes format;
- we get blocked;
- GitHub disables the schedule after 60 days of repo inactivity;
- a prompt change quietly makes extraction worse.

A failed run already sends a GitHub email. A run that never starts sends nothing.

## Decision

Guards come in four layers. Each one is added together with the stage it protects.

1. **CI on every PR** (`ci.yml`), required by branch protection on `main`:
   - `tsc --noEmit`, since Node type stripping does no type checking;
   - unit tests;
   - **integration tests**: Postgres 17 as a service container plus a local HTTP server serving synthetic RSS.

   The integration tests run migrations from scratch and connect as the real least-privilege role. They cover:
   - idempotency, bumps, edits, multi-category merge;
   - gap detection;
   - 429 retry, persistent 500 and broken XML each failing only their own feed;
   - the collector role being unable to delete or rewrite rows.

   Fixtures are synthetic only.
2. **Eval harnesses** (added with each AI stage), gating PRs that change prompts or models:
   - extraction on 150 hand-labelled vacancies;
   - skill-resolution precision;
   - cross-site dedup on labelled pairs;
   - the agent's numbers checked against SQL ground truth, including a mandatory "not enough data" answer when n < 10;
   - podcast scripts where every number must trace back to SQL.

   Results go to Langfuse datasets.
3. **Data checks after each run** (`checks.ts`):
   - failed feeds;
   - coverage gaps;
   - a volume drop: new items in 24h below 50% of the median of the previous 7 windows, checked once there are 8 days of history.

   Extraction-quality and quota checks (Neon, Gemini, ElevenLabs at 80%) come with their stages.
4. **Alerts via healthchecks.io → Telegram.** The collector pings at the end of each run:
   - a success ping is a heartbeat, and a missing ping (2h period plus 1h grace) raises an alert, which also covers a cron that never started;
   - any problem from the data checks, or a crash, pings `/fail` with a counts-only summary.

   Ping failures never fail the collector. With `HEALTHCHECK_URL` unset, pinging is skipped.

## Consequences

- A silent stop, a format change or a block reaches Telegram within about 3 hours.
- Logs and ping bodies carry counts and feed names only, never vacancy text, because public repo logs are public.
- Every failed feed raises an alert. If transient failures get noisy, alert only on two consecutive failures.
- Rejected:
  - Sentry now, because there is no long-running server yet, so it comes with NestJS;
  - a custom Telegram bot, because healthchecks.io already sends to Telegram and adds a heartbeat that a bot wouldn't;
  - Grafana or Prometheus, because it's a server to run for no gain at this scale.
