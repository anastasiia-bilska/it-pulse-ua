# 0011. Public dashboard: static aggregates on GitHub Pages

- Status: accepted; page technology amended by [ADR 0014](0014-web-app-react-fsd.md), hosting by
  [ADR 0015](0015-cloudflare-pages-hosting.md)
- Date: 2026-11-14

## Context

The project needs a public face: hiring managers should see the market numbers, not only the
pipeline. ADR 0007 also promised a freshness banner whenever extraction lags. There is no backend
server yet; NestJS comes later with the agent.

## Decision

- **A static page on GitHub Pages**, rebuilt by a workflow after every `extract` run and once a
  day. The daily run keeps the banner honest if extraction stops.
  - `npm run dashboard` reads `vacancy_current`, `extraction_skill_resolved` and `pipeline_status`
    with the read-only `extractor` role.
  - It writes `aggregates.json` and copies `site/index.html` into `dist/site`, which
    `actions/deploy-pages` publishes.
- **Aggregates only.** No vacancy text, titles, links or company names reach the page or the JSON.
- **Every share carries its n.** Shares are over analysed vacancies, and "не вказано" (not stated) is
  shown as its own value, never hidden.
- **Small samples are suppressed.** A salary group below n = 10 shows «даних замало» instead of
  numbers. The same rule binds the agent later.
- **Salary** is compared in USD per month: the range midpoint, as quartiles p25 / median / p75.
  - EUR and UAH salaries are converted at the official National Bank of Ukraine rate of the build
    day (amended 2026-11-16, `src/dashboard/usd-rates.ts`). USD-only had silently dropped about
    15% of salaries (30 of 196 in the window), mostly UAH. `aggregates.json` carries the rate date.
  - The same rule feeds the weekly digest.
  - If the NBU can't be reached, the build falls back to USD only and logs a PROBLEM line, instead
    of failing.
  - Hourly and yearly salaries stay out: converting them needs hours-per-month and bonus
    assumptions, and the extractor has found none so far.
- **Window**: vacancies seen in the feeds in the last 30 days.
- **Freshness banner**, the ADR 0007 rule: a backlog over 300 or more than 6h since the last `ok`
  run. The reason is a code (quota, queue, error) the page shows in plain language.
- The page is vanilla HTML, CSS and JS, inline, with no third-party scripts or fonts. It renders
  data with `textContent` only.

## Consequences

- The page is only as fresh as the last extract run, and it says so.
- Publishing is public: anything added to `aggregates.json` must pass the same no-raw-text rule.
- Rejected:
  - a hosted BI tool: one more third party holding the data, and harder to keep aggregate-only;
  - a server-rendered app now: no backend yet, and Pages is free and needs no secrets at runtime.
