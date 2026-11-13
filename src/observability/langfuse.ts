// LLM traces to Langfuse Cloud (EU) over OTLP/HTTP JSON (ADR 0010). Spans are buffered during a run
// and sent in one go at the end. Tracing is best-effort: it never fails the job that traces.
import { randomBytes } from 'node:crypto';

// ---- types -------------------------------------------------------------------------------------

/** One model call, as Langfuse shows it: a generation inside its own trace. */
export interface GenerationTrace {
  name: string;
  model: string;
  startedAt: Date;
  endedAt: Date;
  input: string;
  output?: string;
  usage?: { input: number; output: number };
  /** Flat and filterable in Langfuse. */
  metadata: Record<string, string | number | boolean>;
  tags: string[];
  /** Set when the call or its answer failed. */
  errorMessage?: string;
}

export interface Tracer {
  recordGeneration: (trace: GenerationTrace) => void;
  /** Sends everything buffered; resolves even if Langfuse is down. */
  flush: () => Promise<void>;
}

interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}

interface OtlpAttribute {
  key: string;
  value: { stringValue: string } | { arrayValue: { values: { stringValue: string }[] } };
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
  status: { code: number; message?: string };
}

// ---- constants ---------------------------------------------------------------------------------

/** EU region: data stays in the EU (ADR 0007). */
export const LANGFUSE_EU_URL = 'https://cloud.langfuse.com';
const OTLP_TRACES_PATH = '/api/public/otel/v1/traces';
const SPANS_PER_REQUEST = 50;
const REQUEST_TIMEOUT_MS = 30_000;
const SPAN_KIND_CLIENT = 3;
const STATUS_OK = 1;
const STATUS_ERROR = 2;
const NANOS_PER_MILLI = 1_000_000n;
const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;

const NO_TRACING: Tracer = {
  recordGeneration: () => {
    // tracing is off: nothing to record
  },
  flush: () => Promise.resolve(),
};

// ---- functions ---------------------------------------------------------------------------------

/** Without both keys (local runs, tests) tracing is silently off. */
export function tracerFromEnvironment(): Tracer {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    return NO_TRACING;
  }
  return createLangfuseTracer({
    publicKey,
    secretKey,
    baseUrl: process.env.LANGFUSE_BASE_URL ?? LANGFUSE_EU_URL,
  });
}

export function createLangfuseTracer(config: LangfuseConfig): Tracer {
  const buffered: OtlpSpan[] = [];
  return {
    recordGeneration: (trace) => {
      buffered.push(toOtlpSpan(trace));
    },
    flush: async () => {
      const spans = buffered.splice(0);
      for (let start = 0; start < spans.length; start += SPANS_PER_REQUEST) {
        await sendSpans(config, spans.slice(start, start + SPANS_PER_REQUEST));
      }
    },
  };
}

/** Counts only in the log: a span carries vacancy text, and Actions logs are public. */
async function sendSpans(config: LangfuseConfig, spans: OtlpSpan[]): Promise<void> {
  const credentials = Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64');
  try {
    const response = await fetch(`${config.baseUrl}${OTLP_TRACES_PATH}`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${credentials}`,
        'content-type': 'application/json',
        'x-langfuse-ingestion-version': '4',
      },
      body: JSON.stringify(otlpRequest(spans)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`langfuse: HTTP ${response.status} for ${spans.length} spans`);
    }
  } catch (error) {
    console.error(`langfuse: ${spans.length} spans not sent: ${String(error)}`);
  }
}

function otlpRequest(spans: OtlpSpan[]): object {
  return {
    resourceSpans: [
      {
        resource: { attributes: [text('service.name', 'it-pulse-ua')] },
        scopeSpans: [{ scope: { name: 'it-pulse-ua' }, spans }],
      },
    ],
  };
}

function toOtlpSpan(trace: GenerationTrace): OtlpSpan {
  return {
    traceId: randomBytes(TRACE_ID_BYTES).toString('hex'),
    spanId: randomBytes(SPAN_ID_BYTES).toString('hex'),
    name: trace.name,
    kind: SPAN_KIND_CLIENT,
    startTimeUnixNano: unixNanos(trace.startedAt),
    endTimeUnixNano: unixNanos(trace.endedAt),
    attributes: generationAttributes(trace),
    status: trace.errorMessage
      ? { code: STATUS_ERROR, message: trace.errorMessage }
      : { code: STATUS_OK },
  };
}

/** Attribute names follow Langfuse's OpenTelemetry mapping. */
function generationAttributes(trace: GenerationTrace): OtlpAttribute[] {
  const attributes = [
    text('langfuse.trace.name', trace.name),
    tags('langfuse.trace.tags', trace.tags),
    text('langfuse.environment', 'production'),
    text('langfuse.observation.type', 'generation'),
    text('langfuse.observation.model.name', trace.model),
    text('langfuse.observation.input', trace.input),
    ...Object.entries(trace.metadata).map(([key, value]) =>
      text(`langfuse.observation.metadata.${key}`, String(value)),
    ),
  ];
  if (trace.output !== undefined) {
    attributes.push(text('langfuse.observation.output', trace.output));
  }
  if (trace.usage) {
    attributes.push(text('langfuse.observation.usage_details', JSON.stringify(trace.usage)));
  }
  return attributes;
}

function text(key: string, value: string): OtlpAttribute {
  return { key, value: { stringValue: value } };
}

function tags(key: string, values: string[]): OtlpAttribute {
  return {
    key,
    value: { arrayValue: { values: values.map((value) => ({ stringValue: value })) } },
  };
}

function unixNanos(date: Date): string {
  return (BigInt(date.getTime()) * NANOS_PER_MILLI).toString();
}
