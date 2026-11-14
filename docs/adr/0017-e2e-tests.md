# 0017. End-to-end tests in real browsers with Playwright

- Status: accepted
- Date: 2026-11-14

## Context

The component tests run in a simulated DOM (happy-dom). It has no media playback and runs no
animations, so two real bugs reached readers with every test green:

- The digest audio did not play on iOS Safari: GitHub served the mp3 as
  `application/octet-stream` (fixed by serving it from the site, ADR 0013).
- The hero pulse line stood still in Chrome: an SMIL-animated gradient inside an SVG `<mask>` was
  never repainted (fixed with a CSS mask animation).

## Decision

- **Playwright** (`@playwright/test`, pinned) runs `web/e2e/tests/*.spec.ts` in Chromium, desktop
  WebKit (Safari's engine) and WebKit with the iPhone 13 profile.
- **The production build is under test**, not the dev server: dev loads the sample data in-process
  and plays the audio from GitHub. `npm run test:e2e` builds `dist/site`, adds what the dashboard
  workflow would add (`aggregates.json` from the synthetic `SAMPLE_AGGREGATES`, and a few seconds
  of silent mp3 as `digest/digest-<lang>.mp3`), then serves it with `vite preview`.
- **What the tests assert:** the page loads with no console errors and no requests outside the
  local server; the language switch; the audio really plays (`paused` false, `currentTime`
  advancing) and is served as `audio/mpeg`; the pulse line has a running animation whose mask
  moves, and nothing animates under `prefers-reduced-motion: reduce`.
- **CI:** a separate `e2e` job in `ci.yml`, on every PR and push to main. It installs the two
  browsers and uploads the Playwright report when it fails.

## Consequences

- A bug in media, animation or real layout can now fail a PR, in both engines.
- The CI run takes a few minutes longer (browser install), in parallel with the `check` job.
- Specs are named `*.spec.ts`, so the unit test globs (`*.test.ts`, `*.test.tsx`) never pick them
  up.
