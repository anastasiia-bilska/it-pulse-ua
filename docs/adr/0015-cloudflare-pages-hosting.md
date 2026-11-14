# 0015. Host the dashboard on Cloudflare Pages, with cache headers

- Status: accepted
- Date: 2026-11-14
- Amends: [ADR 0011](0011-public-dashboard.md) (hosting)

## Context

GitHub Pages serves every file with `Cache-Control: max-age=600`, and its headers can't be
changed. That is wrong both ways for this site:

- The Vite assets have a content hash in their names, so they could be cached for a year. Instead
  they are re-checked every 10 minutes.
- The page and `aggregates.json` change after each extract run. A reader can see numbers up to
  10 minutes older than the last build, and the freshness banner can't account for that.

## Decision

- **Cloudflare Pages, direct upload from the dashboard workflow** with `wrangler pages deploy`.
  The build is the same as before; it now also ships `web/public/_headers`.
- **Cache rules in `_headers`:**
  - `/assets/*` gets `max-age=31536000, immutable`: hashed files are never revalidated.
  - `/`, `/index.html` and `/aggregates.json` get `max-age=0, must-revalidate`. Every visit
    revalidates, which costs a 304 when nothing changed, so the numbers are never older than the
    last build.
  - Every file also gets `X-Content-Type-Options: nosniff` and a strict referrer policy.
- **Transition (done).** The workflow first deployed to both hosts. The GitHub Pages deploy was
  removed once `it-pulse-ua.pages.dev` was confirmed live with the cache headers (2026-11-14).
  Since then a deploy with no `CLOUDFLARE_*` secrets fails loudly instead of being skipped.
- **Least privilege** (as in ADR 0004): the API token is scoped to Cloudflare Pages edit on one
  account and lives only in GitHub secrets.
- Cloudflare Web Analytics stays off: the page sets no cookies and tracks no one.

## Consequences

- A repeat visit downloads only `index.html` and `aggregates.json` (or gets 304s). JS, CSS and
  fonts come from the browser cache.
- One more third party holds the published files. They are the same public aggregates (ADR 0011),
  so no new data is exposed.
- The public URL becomes `it-pulse-ua.pages.dev` (or a custom domain later).
- Rejected:
  - a service worker on GitHub Pages: client-side code that is hard to retire if it misbehaves,
    and it works around the headers instead of fixing them;
  - Netlify: the same `_headers` model, but stricter free-tier build minutes, and the build runs
    in Actions anyway.
