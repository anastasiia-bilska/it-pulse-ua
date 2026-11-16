# 0021. «Запитай ринок»: a router over fixed SQL tools, served from a Cloudflare Pages Function

- Status: accepted; supersedes the "planned backend is NestJS" note in
  [ADR 0003](0003-typescript-without-build-step.md) and [ADR 0011](0011-public-dashboard.md)
- Date: 2026-11-16

## Context

The agent answers questions about the Ukrainian IT job market in plain language. Its promises are
already on record: it reads only `vacancy_current` (ADR 0007), says «даних замало» when n < 10
(ADR 0011), warns when the data is stale (ADR 0007) and never states a number SQL didn't produce
(ADR 0005). It runs on the Gemini free tier, like extraction.

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
- **Serving:** `POST /api/ask` is a Cloudflare Pages Function in the dashboard's own Pages
  project (`functions/api/ask.ts` only wires `handleAsk` from the agent module). The page calls its
  own origin, so there is no CORS and no second deployment to keep in step: the endpoint and the
  page ship together from `dashboard.yml`. `pg` works under `nodejs_compat` over Cloudflare
  sockets, so no new driver is needed. The function connects as a new read-only `agent` role: it
  reads the views and may only insert into `agent_question`.
- **Caps, in Postgres:** 100 questions a day overall and 10 per client. A client is
  sha256(IP | UTC day | secret salt), so no IP is stored and the hash changes daily. The order is
  fixed: validate the question (3–300 characters), claim a quota row, only then call Gemini. A
  refused question is not recorded. Over a cap the reply is a fixed "limit reached" text (HTTP 429);
  a spent Gemini quota is a fixed "busy" text (503). The check-then-insert can let a burst go one or
  two over a cap, which is harmless; a strict cap would need a lock.
- **What the page draws:** next to the text the endpoint returns n, the window and, for a
  distribution or top skills, the five leading values with their n and percent. They are the tool's
  own facts, aggregates only like the dashboard (ADR 0011), and the page draws them with the
  dashboard's bars. Salary and a single skill's demand are one figure, so the text alone says them.
  The SQL itself is not shown: it is parameterised, and the n next to every answer is what lets a
  reader judge it.
- **Secrets** (`DATABASE_URL` as the `agent` role, `GEMINI_API_KEY` from its own Google Cloud
  project (see Consequences), `ASK_CLIENT_SALT`, optional
  Langfuse keys) are uploaded to the Pages project by `dashboard.yml` before each deploy. The smoke
  check posts a malformed question and expects 400, which costs no quota.

## Consequences

- The agent answers fewer questions than free-form text-to-SQL would, and every number it gives
  is traceable to one of four queries. A new kind of question means a new tool and new eval cases.
- Each answered question costs 2 Gemini calls (3 with a retry). The agent uses a key from its own
  Google Cloud project, because free-tier quota is per project and extraction works through its
  backlog until the shared quota runs out: on the shared key the agent answered "busy" for most of
  the day. The caps keep the agent's own quota for its readers.
- Rejected:
  - the model writing SQL: more flexible, but the number guard can't vouch for a query it never saw;
  - multi-turn tool calling: one routing step covers every question the four tools can answer;
  - a template-only answer with no second model call: robust, but stiff in two languages, and the
    guard already makes the model's text safe;
  - a Python RAG service and NestJS: see Context;
  - a standalone Worker on its own URL: the same runtime, plus CORS and a second deploy;
  - Neon's serverless driver: a new dependency, while `pg` already runs in workerd;
  - caps in Workers KV or a rate-limit binding: another store to provision, while Postgres already
    holds the data and the `agent` role.
