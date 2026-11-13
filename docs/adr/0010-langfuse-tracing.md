# 0010. LLM traces in Langfuse over OTLP, without an SDK

- Status: accepted
- Date: 2026-11-13

## Context

ADR 0007 chose Langfuse Cloud (EU, Hobby tier) for LLM traces and eval datasets. The extractor
needs a trace per model call: prompt input, answer, model, tokens, latency and outcome. With that we
can see where and why extraction goes wrong, and compare extractor versions.

Langfuse's legacy batch ingestion API (`/api/public/ingestion`) is being sunset on Langfuse Cloud on
2026-11-16. The supported way in is its OpenTelemetry endpoint.

## Decision

- Send spans to `https://cloud.langfuse.com/api/public/otel/v1/traces` as **OTLP/HTTP JSON**. Use
  basic auth with the project keys and `x-langfuse-ingestion-version: 4`.
- **Plain `fetch`, no SDK.** The OpenTelemetry SDK stack is several packages and a background
  exporter, all to send one small batch per run.
- Each model call is one span (`langfuse.observation.type = generation`) in its own trace. Attributes
  follow Langfuse's OTel mapping:
  - model, input and output;
  - `usage_details` as `{input, output}` tokens;
  - flat metadata: `raw_item_id`, `extractor_version`, `prompt_hash`, `outcome`, `dropped`;
  - tags: `extractor` and the version.

  A failed call is an error span with the reason. A quota stop is not traced.

- Spans are buffered during the run and sent once at the end, in chunks of 50.
- **Best-effort**:
  - without both keys (local runs, tests) tracing is off;
  - an unreachable Langfuse logs a counts-only line and never fails extraction.

## Consequences

- A trace carries vacancy text. Langfuse is an EU processor we already accepted in ADR 0007. Actions
  logs still get counts only.
- At about 300 calls a day, usage stays well inside the Hobby tier. If it nears the limit, sample
  successes (ADR 0007).
- Rejected:
  - the Langfuse JS SDK: two more dependencies and a background flush, for one batch per run;
  - the legacy ingestion API: it is being sunset.
