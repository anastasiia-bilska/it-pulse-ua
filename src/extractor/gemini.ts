// Minimal client for the Gemini Interactions API (structured output only). Plain fetch: one
// endpoint does not justify an SDK.

// ---- types -------------------------------------------------------------------------------------

export type JsonSchema = Record<string, unknown>;

export interface GeminiConfig {
  apiKey: string;
  model: string;
  /** Overridable so integration tests can point it at a local fake. */
  baseUrl: string;
}

export interface GenerationRequest {
  systemInstruction: string;
  input: string;
  schema: JsonSchema;
}

export interface Generation {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

interface InteractionResponse {
  status?: string;
  usage?: { total_input_tokens?: number; total_output_tokens?: number };
  steps?: { type: string; content?: { type: string; text?: string }[] }[];
}

// ---- constants ---------------------------------------------------------------------------------

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
const API_REVISION = '2026-05-20';
const REQUEST_TIMEOUT_MS = 60_000;
const HTTP_TOO_MANY_REQUESTS = 429;

// ---- errors ------------------------------------------------------------------------------------

/** 429: per-minute or per-day quota. The caller decides whether to wait or stop the run. */
export class QuotaExhaustedError extends Error {
  override name = 'QuotaExhaustedError';
}

// ---- functions ---------------------------------------------------------------------------------

export async function generateJson(
  config: GeminiConfig,
  request: GenerationRequest,
): Promise<Generation> {
  const startedAt = performance.now();
  const response = await fetch(`${config.baseUrl}/v1beta/interactions`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': config.apiKey,
      'content-type': 'application/json',
      'api-revision': API_REVISION,
    },
    body: JSON.stringify({
      model: config.model,
      system_instruction: request.systemInstruction,
      input: request.input,
      response_format: { type: 'text', mime_type: 'application/json', schema: request.schema },
      store: false, // no server-side history: we never continue a conversation
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === HTTP_TOO_MANY_REQUESTS) {
    throw new QuotaExhaustedError('Gemini quota exhausted (429)');
  }
  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}`);
  }
  const interaction = (await response.json()) as InteractionResponse;
  return {
    text: outputText(interaction),
    inputTokens: interaction.usage?.total_input_tokens ?? 0,
    outputTokens: interaction.usage?.total_output_tokens ?? 0,
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

function outputText(interaction: InteractionResponse): string {
  if (interaction.status !== 'completed') {
    throw new Error(`Gemini interaction ${interaction.status ?? 'without status'}`);
  }
  const texts = (interaction.steps ?? [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .map((part) => part.text ?? '');
  return texts.join('');
}

/**
 * Gemini expresses "nullable" as a type array (`["string", "null"]`), while zod emits
 * `anyOf: [X, {type: "null"}]`. Rewrites the latter into the former, recursively, and drops the
 * `$schema` marker.
 */
export function toGeminiSchema(schema: JsonSchema): JsonSchema {
  const node: JsonSchema = { ...schema };
  delete node.$schema;
  const nullable = nullableBranch(node);
  return mapChildren(nullable ? withNull(nullable) : node);
}

function nullableBranch(node: JsonSchema): JsonSchema | undefined {
  const variants = node.anyOf;
  if (!Array.isArray(variants) || variants.length !== 2) {
    return undefined;
  }
  const [first, second] = variants as JsonSchema[];
  if (second?.type === 'null') {
    return first;
  }
  return first?.type === 'null' ? second : undefined;
}

function withNull(branch: JsonSchema): JsonSchema {
  const enumValues = branch.enum;
  return {
    ...branch,
    type: [branch.type, 'null'],
    ...(Array.isArray(enumValues) && { enum: [...(enumValues as unknown[]), null] }),
  };
}

function mapChildren(node: JsonSchema): JsonSchema {
  const result: JsonSchema = { ...node };
  if (isSchema(node.items)) {
    result.items = toGeminiSchema(node.items);
  }
  if (isSchema(node.properties)) {
    result.properties = Object.fromEntries(
      Object.entries(node.properties).map(([key, value]) => [
        key,
        toGeminiSchema(value as JsonSchema),
      ]),
    );
  }
  return result;
}

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
