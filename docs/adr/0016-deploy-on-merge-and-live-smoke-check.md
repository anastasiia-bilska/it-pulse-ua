# 0016. Deploy on merge, and a smoke check of the live site

- Status: accepted
- Date: 2026-11-14

## Context

Two bugs reached a reader's phone although CI was green: the digest audio would not play on iOS
Safari, and the hero animation stood still in Chrome. Unit tests run in jsdom, which has neither
media playback nor rendering, and nothing looked at the deployed site. Worse, a merged fix waited
for the next extract run before it went live: the dashboard rebuilt only after extraction, a digest
or the daily schedule.

## Decision

- **Deploy on merge.** The dashboard workflow also runs on a push to `main` that touches the page,
  its data CLI, the dependencies or the workflow itself.
- **Smoke check after every deploy** (`.github/scripts/smoke-check.sh`), against the public URL:
  1. waits until the live `aggregates.json` is this build's (the CDN may lag a little), so the
     check is about the new version;
  2. the page is HTML and loads a JavaScript bundle served as JavaScript;
  3. `aggregates.json` is JSON with totals, freshness and distributions;
  4. when there is an episode, both digest mp3 files are served as `audio/mpeg` and are not tiny.
     A failure fails the workflow, so GitHub notifies the owner.
- **Digest rehearsal.** `digest.yml` takes `dry_run`: the real data, the real Gemini call and the
  number guard, but no speech, no release and no healthcheck ping. The scripts are kept as a run
  artifact. It is how a prompt or guard change is tried before a Monday.
- Real-browser tests (Chromium and WebKit) are a separate step, ADR 0017.

## Consequences

- A merged page change is live within minutes, and a broken delivery (wrong content type, missing
  file, stale deploy) fails loudly instead of reaching a reader first.
- The smoke check covers delivery, not behaviour in a browser: whether audio plays or an animation
  runs is for the browser tests.
- Rejected: a paid uptime monitor (one more service; this check runs where the deploy happens).
