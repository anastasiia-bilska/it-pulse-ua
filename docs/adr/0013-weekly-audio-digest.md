# 0013. Weekly audio digest in Ukrainian and English

- Status: accepted
- Date: 2026-11-14

## Context

The project promises a weekly audio digest: a short spoken summary of how the market moved. It
must be public, cheap, bilingual (the dashboard gets an English switch too), and it must never say
a number the data does not support. A made-up percentage in public audio would cost the project
its credibility.

## Decision

- **Where:** each episode is a GitHub Release `digest-<ISO week>` (for example `digest-2026-W46`)
  with `digest-uk.mp3`, `digest-en.mp3` and `digest.json` (the scripts). Releases are free and
  persist across Pages builds. The dashboard plays `releases/latest/download/digest-<lang>.mp3`.
  Every release in this repository is a digest, so "latest" is always the newest episode.
- **When:** Mondays at 08:05 UTC, just after the Gemini daily quota resets and before the 08:17
  collect triggers extraction, which would use the quota up. The episode covers the previous ISO
  week (Monday to Sunday, UTC) and compares it with the week before. A manual run takes a week
  input for backfills.
- **Idempotent:** if the week's release exists, the workflow stops before any API call, so a
  re-run never spends quota twice.
- **Facts come from code, words from the model.** `src/digest` computes every number the script
  may use: vacancy counts for both weeks, percent changes (rounded to whole numbers), the share of
  vacancies already analysed, the top roles and skills with their counts, and the median USD
  monthly salary. A value with n below 10 is not passed on at all (the dashboard's «даних замало»
  rule). The model never does arithmetic.
- **Script:** one Gemini call (`MODEL` from the extractor) writes both scripts, Ukrainian and
  English, from the same facts. Rules: digits only, no number that is not in the facts, at most
  1100 characters each. If less than 90% of the week's vacancies are analysed, the script must
  say the numbers are preliminary.
- **Number guard:** every number in each script must belong to the set of numbers in the facts
  (plus the week's dates and the year), after normalising thousand separators. Anything else, or a
  script over the limit, rejects the episode: nothing is published and healthchecks gets `/fail`.
  The guard cannot see numbers written as words; the prompt forbids them.
- **Speech:** ElevenLabs text-to-speech, model `eleven_multilingual_v2`, and the premade voice
  "Matilda" for both languages, pinned as a constant. The owner chose it from samples of three
  voices (and of the v3 and v4 models) rendered in a temporary workflow, so the key never left
  GitHub secrets.
- **Quota:** the API key has only the text-to-speech permission and a credit limit of 10,000 a
  month, so it cannot overspend even if it leaks. Such a key may not read its usage (HTTP 401); the
  job then skips the pre-check and the 80% warning (ADR 0005), and a run that hits the limit fails
  and alerts. A key with the user-read permission turns both checks back on.
- **Budget:** the free plan has 10,000 credits a month, one credit per character on
  `eleven_multilingual_v2`. Two scripts of at most 1100 characters, about 4.3 times a month, is
  about 9,500. That is tight on purpose. If it runs out, either Flash/Turbo (0.5 to 1 credit per
  character on the API, Ukrainian quality to be checked) or the Starter plan (30,000 credits)
  lifts the limit, and the script length goes back to 1.5 to 2 minutes.
- **Tracing:** the script generation is a Langfuse generation (ADR 0010), tagged `digest`.
- **Alerting:** a separate healthchecks.io check `it-pulse-digest` (`HEALTHCHECK_DIGEST_URL`) with
  a weekly period.
- **Attribution:** the player credits ElevenLabs as the voice. The free plan has no commercial
  licence; this is a non-commercial portfolio project.

## Consequences

- An episode is only as complete as extraction that week, and it says so.
- Input to the model is aggregates only, never vacancy text, so the scripts can be public.
- Rejected:
  - a template script: accurate but robotic and the same every week;
  - a model script without the guard: one invented number in public audio is too costly;
  - Crowdin for the English version: it manages UI strings, and the script is new every week;
  - a podcast RSS feed and a Telegram channel: possible later on top of the releases;
  - cloning the owner's voice: biometric data at a third party, and not on the free plan.
