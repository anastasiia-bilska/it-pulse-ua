# 0012. Extraction eval harness and the PR eval gate

- Status: accepted
- Date: 2026-11-14

## Context

ADR 0007 requires that any prompt or model change passes an eval gate on the 150-vacancy eval set,
and that we measure anchoring bias by comparing the blind and the prelabelled subsets. The set
lives in the Langfuse dataset `extraction-eval-v1`. Each item has `input {raw_item_id, text}`, an
`expectedOutput` (the fields without quotes, or `null` for a blind item not labelled yet) and
metadata `labelling: blind | prelabelled`. Labelling has not started, so the harness must work
with zero labels and say so.

## Decision

- **`npm run eval`** (`src/evaluation/run-eval.ts`):
  1. reads every dataset item from the Langfuse public API, page by page;
  2. runs the **current** prompt and model on each labelled item through `extractFields`, the
     extractor's own path: schema validation, `tidyFields` and the evidence check. The harness has
     no copy of extractor logic;
  3. scores the answers, prints a counts-only table and writes `dist/eval/report.json`.

  Calls are paced like an extraction run: 4 s apart, one wait-and-retry on a 429. Quota that stays
  exhausted stops the run with an error, because a partial score is no gate result.

- **What counts as labelled.**
  - A blind item counts once its `expectedOutput` is set.
  - A prelabelled item already carries the model's own answer, so it counts only once the
    labeller has corrected it and set `"reviewed": true` in its metadata in the Langfuse UI.
    Otherwise the model would be scored against itself.
  - Everything else is skipped and counted.

- **Scoring rules** (`src/evaluation/score.ts`, pure):
  - Exact match for `role`, `seniority`, `work_format`, `english`, `company_type`, `domain`,
    `abroad_allowed` and `experience_years_min`. Null equals null: "not stated" is an answer.
  - Salary is one field. It is right when min, max, currency and period all match, or when both
    sides have no salary. Amounts match within 1%.
  - Locations are compared as sets: trimmed and case-insensitive.
  - Skills get precision, recall and F1 on trimmed, case-insensitive names. They are
    micro-averaged: counts are summed over items, then turned into ratios. `required` is not
    scored yet. An empty denominator scores 1, because no skills against no skills is right.
  - **Overall accuracy** is pooled over the 10 exact-match fields (the 8 scalars, salary and
    locations). Skills F1 is reported next to it, not mixed in.
  - A model call that fails (HTTP error, invalid answer) counts as wrong on every field. It stays
    in the denominator, so a prompt that breaks the contract can't look better.

- **Anchoring bias.** Every number is reported for all items, for blind items and for prelabelled
  items. `anchoringGap` is prelabelled minus blind accuracy. A large positive gap means the
  labellers kept the model's pre-labels where they should have corrected them.

- **The PR gate.** `.github/workflows/eval.yml` runs on `workflow_dispatch` and on every pull
  request that touches `src/extractor/**`. It uploads the report as an artifact.
  - The run exits non-zero when overall accuracy is below `MIN_ACCURACY`.
  - With no labelled items, or without Langfuse keys, it prints one line and exits 0 before it
    reads the Gemini key.
  - It is not a required check yet.
  - **TODO:** `MIN_ACCURACY` starts at 0, which means no gate. Set the real threshold after the
    first labelled baseline. Then make the `eval` job a required check.

## Consequences

- The output is counts and ratios only, with no vacancy text. Actions logs and artifacts of a
  public repository are public.
- A full run is about 150 Gemini calls, roughly 10 minutes of the free-tier per-minute quota.
  It competes with the scheduled extraction for the daily quota.
- Labellers have one extra step: they mark a corrected pre-label as reviewed.
- The harness scores the extractor as it ships, evidence check included. A field the evidence
  check nulls counts as wrong when the label states it. That is what the dashboard would show.
- Rejected: the Langfuse experiment runner SDK. One endpoint and a pure scorer don't justify a
  dependency, the same reasoning as ADR 0010.
