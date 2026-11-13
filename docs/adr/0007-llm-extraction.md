# 0007. LLM extraction of structured vacancy fields

- Status: accepted
- Date: 2026-11-13

## Context

The dashboard, the «Запитай ринок» agent and the podcast all need structured facts per vacancy:
role, seniority, salary and so on. The raw layer (ADR 0001) only holds RSS text. We extract these
fields with an LLM on the Gemini free tier. That makes three failure modes the main risks:

- hallucinated numbers;
- silent quality drift when a prompt or model changes;
- quota exhaustion.

## Decision

**Fields.** Each field is NULL when the vacancy doesn't state it. The model never guesses.

| Field                  | Values                                                     |
| ---------------------- | ---------------------------------------------------------- |
| `role`                 | enum of 22 specialisations, incl. `other`                  |
| `seniority`            | intern / junior / middle / senior / lead                   |
| `salary_*`             | min, max, currency (USD/EUR/UAH), period (hour/month/year) |
| `work_format`          | remote / office / hybrid                                   |
| `locations`            | cities, plus `abroad_allowed`                              |
| `english`              | none / basic / intermediate / upper / fluent               |
| `experience_years_min` | 0–30                                                       |
| `company_type`         | product / outsource / outstaff                             |
| `domain`               | enum of 15 domains plus `other`                            |
| `skills`               | raw names plus `required`; mapped by the skill taxonomy    |

We left out free-text summaries (raw text under another name) and culture/benefits (noisy, and
nothing in v1 needs them).

**Storage** (migration 003) is append-only, like the raw layer:

- **`extraction`**: one row per (`raw_item_id`, `extractor_version`), with typed columns and CHECK
  constraints. SQL stays plain, and Postgres rejects invalid values as one more guard.
- **`extraction_skill`**: raw skill names. The taxonomy maps them later, so a taxonomy change never
  needs a re-extraction.
- **`extraction_error`**: the retry queue.
- **`job_run`**: run telemetry.
- **Views**: the dashboard and agent read only `vacancy_current` (latest content version plus its
  latest extraction). After a version bump the previous extraction stays visible until the queue
  catches up. `pipeline_status` feeds the freshness indicator.

**Pipeline**

- A separate `extract` workflow is triggered by `workflow_run` after each `collect`. An LLM outage
  must never break collection: history can't be re-collected, but extraction can be re-run.
- **Queue, not "new since last run"**: every raw version without an extraction for the current
  `extractor_version`. One mechanism covers new vacancies, edits, missed runs, prompt changes and
  the backfill.
- At most 300 vacancies per run, to protect the free-tier quota.
- A separate `extractor` role with SELECT on everything, INSERT on results and UPDATE only on the
  retry counters. The collector can't write results, and the extractor can't touch raw data (ADR
  0004).

**Hallucination guards**

1. Structured output: a JSON Schema generated from the same zod contract that validates the answer
   in code (`src/extractor/fields.ts`), so the schema and the validation can't drift apart.
2. **Evidence quotes** for salary, experience, english and domain. The model returns a verbatim
   quote, and code checks that it is a substring of the vacancy text after whitespace
   normalisation. If it isn't, the field is nulled and counted as `hallucination_dropped`. This is
   deterministic and free.
3. The eval set catches misinterpretation of a real quote. If eval shows salary is often misread,
   add a regex cross-check for salary only.

We rejected an LLM judge and self-consistency: both double the quota and their errors correlate.
We also rejected model-reported confidence, because it is poorly calibrated.

**Errors.** An invalid response or API error is retried once in the run. After that the vacancy
goes to `extraction_error` and is retried in later runs. After 3 attempts it is a dead letter. If
more than 10% of a run errors, the run pings `/fail` on the `it-pulse-extract` check. A queue that
grows three runs in a row also alerts.

**Model**

- **`gemini-3.5-flash-lite`**, pinned, never a `-latest` alias, which could change silently.
  Google recommends Flash-Lite for high-volume extraction, and it has the most free-tier headroom.
  The eval compares it with `gemini-3.8-flash`. If it falls short, we switch through a new
  `extractor_version`.
- **Interactions API** (`/v1beta/interactions`), which Google now recommends over the legacy
  `generateContent`. Requests set `store: false`, so Google keeps no conversation history. We call
  it with plain `fetch`: one endpoint doesn't justify an SDK.
- **No temperature.** Gemini 3.5+ ignores sampling parameters (`temperature`, `top_p`, `top_k`),
  and future models will reject them. Consistency comes from the pinned model, structured output
  and the eval gate instead.
- **Pacing:** one request every 4 s (15 per minute). A 429 waits 60 s and retries once. A second
  429 stops the run with `quota_exhausted`, and the queue waits.
- A model or prompt change means a new `extractor_version`, and the PR must pass the eval gate.
- **No fallback model**: when the quota runs out, the queue waits. A fallback would mix models
  within one `extractor_version`, and eval would guarantee nothing.
- Free-tier prompts may be used by Google to improve its models. That is acceptable for public
  vacancies. CVs never go to the free tier.

**Freshness in the UI.** The dashboard always shows "Дані оновлено: …". When extraction lags (a
backlog over 300, or more than 6h since the last `ok` run), a banner explains the delay in plain
words: quota exhausted or a temporary error. The agent adds the same disclaimer to its answers,
and that is an agent eval case.

**Observability.** Langfuse Cloud, EU region, Hobby tier:

- a trace per extraction call (prompt, response, model, tokens, latency, validation result);
- datasets for the eval set and each eval run.

At ~300 new vacancies a day we expect 20–30k of the 50k monthly units. If we near the limit, trace
all errors and 20% of successes. Self-hosting was rejected because it is one more server to run.

**Eval set.** 150 vacancies, stratified by source, role and seniority, with hard cases
oversampled: salary, English-language posts, unusual salary formats.

- 30 are labelled blind.
- 120 are model pre-labels corrected by hand.
- Labelling happens in Langfuse annotation queues.

Comparing accuracy on the blind and the corrected subsets measures anchoring bias. We report it
in the README.

## Consequences

- Dashboard numbers are only as fresh as the queue, and the UI says so instead of hiding it.
- A prompt change re-extracts everything over a few runs. Old rows stay, so versions can be
  compared on real traffic, not only on the eval set.
- NULL means "not stated", so analytics must report n alongside every share ("даних замало" when
  n < 10).
