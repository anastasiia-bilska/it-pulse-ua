# 0021. «Запитай ринок»: a router over fixed SQL tools, served from a Cloudflare Worker

- Status: accepted; supersedes the "planned backend is NestJS" note in
  [ADR 0003](0003-typescript-without-build-step.md) and [ADR 0011](0011-public-dashboard.md)
- Date: 2026-11-16

## Context

The agent answers questions about the Ukrainian IT job market in plain language. Its promises are
already on record: it reads only `vacancy_current` (ADR 0007), says «даних замало» when n < 10
(ADR 0011), warns when the data is stale (ADR 0007) and never states a number SQL didn't produce
(ADR 0005). It runs on the Gemini free tier that extraction also uses.

Two other plans were considered and dropped. A Python AI service (embeddings, hybrid search, RAG
citations) would bring a second language, the one ADR 0003 rejected, along with a second host. Its
citations would also put vacancy text on a public page, which ADR 0011 forbids. NestJS was only
ever a plan: it needs a server running all the time, while a Cloudflare Worker is already deployed
from CI (ADR 0018).

## Decision

- **Three steps, two model calls.**
  1. _Plan._ Gemini sees only the question and returns structured output: one tool out of
     `salary`, `top_skills`, `skill_demand`, `distribution` or `unsupported`, plus filters (role
     and seniority) taken from the extractor's enums. The code checks the plan. A plan missing what
     its tool needs becomes `unsupported`, never a guess.
  2. _Facts._ Fixed, parameterised SQL over `vacancy_current` and `extraction_skill_resolved`. The
     model never writes SQL. The window (30 days), `MIN_N` and the salary rule (USD per month, the
     midpoint of the range) are imported from the dashboard, so the page and the agent can't
     disagree. Skills resolve through the taxonomy: a name, a slug or any effective alias.
  3. _Answer._ Gemini writes 2–4 sentences from the facts JSON. The digest's number guard (moved to
     `shared`) rejects any number the facts don't contain, as well as an answer over 700 characters.
     A rejected answer gets one retry, then a fixed "couldn't answer" reply.
- **Fixed texts for everything that isn't numbers:** a sample below `MIN_N` (no model call),
  `unsupported`, a skill outside the taxonomy, a failed answer, and the stale-data warning (the
  dashboard's ADR 0007 rule). The answer is in the question's language, `uk` or `en`.
- **Aggregates only.** Like the dashboard, the agent's output holds no vacancy text, titles, links
  or company names, so it can be public.
- **Traces:** both calls go to Langfuse as `agent-plan` and `agent-answer`, tagged `agent`.
- **Eval:** the planner is the only step where the model decides what gets computed, so it is the
  step that gets scored. `npm run eval:planner` runs 20 synthetic questions, Ukrainian and English,
  covering every tool and including unsupported ones, and reports exact-match accuracy. It spends
  about 20 calls of the shared quota, so it runs on demand. It becomes a PR gate once there is a
  baseline. The guards are covered by unit tests and an integration test (real Postgres, fake
  Gemini).
- **Serving (next PR):** a Cloudflare Worker reaches Neon through its serverless driver, connecting
  as a new read-only `agent` role. The widget on the dashboard is public, with a hard daily cap and
  a per-IP cap. Once a cap is hit, the Worker answers with a fixed "limit reached" text instead of
  calling Gemini, so the extraction quota is safe. This PR ships the core and `npm run ask`.

## Consequences

- The agent answers fewer questions than free-form text-to-SQL would, and every number it gives
  is traceable to one of four queries. A new kind of question means a new tool and new eval cases.
- Each answered question costs 2 Gemini calls (3 with a retry) from the extraction quota. The cap
  in the Worker is what keeps the two from competing.
- Rejected:
  - the model writing SQL: more flexible, but the number guard can't vouch for a query it never saw;
  - multi-turn tool calling: one routing step covers every question the four tools can answer;
  - a template-only answer with no second model call: robust, but stiff in two languages, and the
    guard already makes the model's text safe;
  - a Python RAG service and NestJS: see Context.
