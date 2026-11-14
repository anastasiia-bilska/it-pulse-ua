# 0019. Visitor analytics on Umami Cloud

- Status: accepted
- Date: 2026-11-14

## Context

The dashboard has no idea who reads it: how many unique visitors come, which blocks they scroll
to, and what they click (tabs, language, digest player, "show all", outbound links). Cloudflare
Web Analytics, already free with Pages (ADR 0015), counts page views only: it has no custom events,
so it can answer none of the last two questions.

## Decision

- **Umami Cloud** (free tier, 100k events a month). It is **cookieless**: a visitor is a daily
  salted hash, so the site needs no consent banner and stores nothing on the reader's device.
- The script loads **only on `it-pulse-ua.pages.dev`**: dev, previews and e2e runs never report
  and never call the network. The site ID is a constant in `shared/config`; it is public by design.
- **Clicks**: a `data-umami-event` attribute (plus `data-umami-event-*` details) on a `<button>` or
  `<a>`. Umami's script counts it; no handlers in our code.
- **Block views**: every top-level block carries `data-block="<name>"`. `shared/analytics` sends one
  `block-view` event per block per page load, when the block crosses the middle fifth of the
  screen. A share-of-block threshold would never fire for a block taller than the screen.
- In-page `#section` nav links are not tagged: Umami delays a tracked link's navigation, and block
  views already show where readers went.

## Consequences

- One more vendor, with the visitor's IP passing through it (Umami does not store it).
- Event names are a contract with the Umami reports: renaming a `data-block` or an event splits
  its history.
- Rejected:
  - Cloudflare Web Analytics: no custom events;
  - PostHog: cookies and a consent banner, a heavier script;
  - our own Pages Function and Workers Analytics Engine: more code, and no report UI.
