# 0014. Web app: React + Vite, Feature-Sliced layers, self-hosted fonts

- Status: accepted
- Date: 2026-11-14
- Amends: [ADR 0011](0011-public-dashboard.md) (page technology), [ADR 0003](0003-typescript-without-build-step.md) (scope)

## Context

The public dashboard was one vanilla `site/index.html` with inline JS. A redesign arrived as a
canvas with a UI-kit: tokens, about a dozen components with their states, a mobile layout with a
burger menu, a UA / EN switch, and teasers for the coming agent and voice digest. One inline
file can't hold that readably, and the agent will add a second screen. The owner asked for a
modular frontend (features, shared and so on).

## Decision

- **React 19 + Vite 8 in `web/`**, outside `src/`, with its own `tsconfig.json` (DOM libs,
  bundler resolution). `npm run build:web` writes `dist/site`. `npm run dashboard` then adds
  `aggregates.json` next to it, so the dashboard workflow runs them in that order. CI builds the
  web app on every PR.
- **ADR 0003 now covers the backend only.** Node still runs `src/` as `.ts` with no build step.
  Browsers can't, so the web app is bundled.
- **Feature-Sliced layers** under `web/src/`: `app` → `pages` → `widgets` → `features` →
  `entities` → `shared`.
  - A layer imports only the layers below it.
  - Another slice is reached only through its `index.ts`.
  - Slices are flat folders, with tests in `tests/` (ADR 0008).
  - ESLint `no-restricted-imports`, per layer, enforces both rules.
- **What goes where:**
  - `shared/ui` is the UI-kit; `shared/i18n` holds copy and language; `shared/lib` formatting.
  - `entities/aggregates` holds the data contract and pure view-model rules: bars, profile
    order, insights, salary axis.
  - `features` are user actions: `switch-language`, and `ask-market`, which is a teaser for now.
  - `widgets` are page blocks.
- **One data contract.** `Aggregates` lives in `src/dashboard/aggregates.ts`. The web app imports
  it type-only, so it is erased from the bundle. Freshness reasons are now codes (`quota`,
  `backlog`, `failing`, `never`), so the page can translate them.
- **Styles:** SCSS modules per component, with breakpoint mixins in
  `shared/styles/_breakpoints.scss`.
  - Sizes are written in the design's px through `rem()` (`shared/styles/_units.scss`) and
    compile to rem, so type and spacing follow the reader's browser font size.
  - Media queries are in em for the same reason.
  - Hairlines under 4px (borders, focus ring) stay in px so they stay crisp. Design tokens are CSS custom properties in
    `app/styles/tokens.scss`. Dark theme only, as designed.
- **Fonts, self-hosted** (Unbounded, Inter, JetBrains Mono; variable woff2 from
  `@fontsource-variable`).
  - Only latin and cyrillic `@font-face` rules are declared, so latin-ext, greek and vietnamese
    are never fetched. That is about 200 KB of files that are never requested.
  - The two above-the-fold files (Unbounded and Inter, cyrillic) get `<link rel=preload>` from a
    small Vite plugin.
  - fontaine generates metric-matched local fallbacks (`size-adjust`) for all three families, so
    swapping fonts in doesn't shift the layout.
  - ADR 0011's "no third-party fonts" still holds: nothing loads from another origin.
- **ADR 0011 rules carried over:**
  - Aggregates only.
  - Every share with its n.
  - "Not stated" is shown, hatched.
  - n < 10 shows "даних замало".
  - Data renders as text only: ESLint bans `dangerouslySetInnerHTML`.
  - No third-party scripts at runtime.
- **Not built yet, shown as "soon":** the agent and the voice digest. Nothing links to a screen
  that doesn't exist, and the player is drawn disabled, with no fake duration.
- **Dev data:** `npm run dev:web` uses a synthetic fixture behind `import.meta.env.DEV`, which
  is dropped from the production bundle.

## Consequences

- The page costs about 83 KB gzipped of JS, which is React. Fonts are about 200 KB across six
  files, and a Ukrainian page fetches only the ones whose glyphs it uses.
- Adding the agent is a new page and feature slices, with no restructuring.
- Two kinds of web tests, both in `tests/` (ADR 0008):
  - pure rules (`*.test.ts`) run under `node --test`, like the backend;
  - component tests (`*.test.tsx`) run in Vitest with Testing Library and happy-dom. They query by
    role and text, the way a reader or a screen reader meets the page. happy-dom is used rather
    than jsdom because it implements `<dialog>.showModal()`.
  - `npm test` runs both, so CI needs no new step.
- Rejected:
  - vanilla TS (manual DOM updates for tabs, menu, language);
  - Vue (a separate SFC lint toolchain);
  - Google Fonts (third-party origin, against ADR 0011);
  - subsetting Unbounded per glyph (a build step that must re-run on every copy change).
