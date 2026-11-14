# 0011. Public dashboard: static aggregates on GitHub Pages

- Status: accepted; page technology amended by [ADR 0013](0013-web-app-react-fsd.md), hosting by
  [ADR 0014](0014-cloudflare-pages-hosting.md)
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
- **Salary** is compared only for USD per month: the range midpoint, as quartiles p25 / median / p75.
  Mixing currencies or periods would need FX rates and assumptions we don't want in v1.
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
