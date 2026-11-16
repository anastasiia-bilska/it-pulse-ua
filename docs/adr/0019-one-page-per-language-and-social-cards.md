# 0019. One page per language, and generated social cards

- Status: accepted
- Date: 2026-11-14

## Context

The dashboard is in English and Ukrainian, but the language switched in place on one URL. Search
engines saw only the English page (its static `<html lang>`, title and description): the Ukrainian
copy never reached a Ukrainian search result, and a shared link always opened in English. Shared
links also previewed with no image.

## Decision

- **Two static pages from one app:** `index.html` (English, `/`) and `uk.html` (Ukrainian, `/uk`),
  both Vite entries. Each has its own `<html lang>`, title, description, canonical and Open Graph
  tags, plus `hreflang` links to both (`x-default` is English). `sitemap.xml` lists both with the
  same alternates. The app starts in the language of the page it was opened from.
- `uk.html` sits **next to** `index.html`, not in a `uk/` folder, so every relative URL
  (`assets/`, `aggregates.json`, `digest/`) resolves the same on both pages. Cloudflare Pages serves
  it at `/uk`.
- The switch stays in place (no reload) and **replaces the address and tab title**, so a link copied
  after switching opens in that language.
- Each page preloads the above-the-fold fonts of its own script (latin or cyrillic).
- **Social cards:** after `npm run dashboard`, `npm run social-card` renders the canvas design
  "Share" with this build's numbers (vacancies in the window, remote share, top skill) to
  `og-en.png` and `og-uk.png`. Chromium from the e2e setup paints it with the site's own fonts,
  inlined, so the render needs no network and no new dependency. The workflow step is
  `continue-on-error`: a failed card never blocks a deploy.

## Consequences

- The two heads are kept in step by hand; a comment in each points at the other. The tab titles
  also live in `messages.ts` for the in-place switch.
- Adding a language means one more HTML page, its `hreflang` lines in every page and the sitemap,
  and its card copy.
- The deploy installs Chromium (about a minute) for the cards.
- Social networks cache previews on their side; a fresh card shows only after their cache expires.
