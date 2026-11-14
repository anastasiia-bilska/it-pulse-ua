// Minimal ElevenLabs client: text-to-speech and the subscription usage. Plain fetch: two endpoints
// do not justify an SDK.

// ---- types -------------------------------------------------------------------------------------

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  /** Overridable so integration tests can point it at a local fake. */
  baseUrl: string;
}

export interface Usage {
  /** Characters (credits) used this billing month. */
  used: number;
  limit: number;
}

interface SubscriptionResponse {
  character_count: number;
  character_limit: number;
}

// ---- constants ---------------------------------------------------------------------------------

export const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';
/** Speaks Ukrainian and English with the same voice; chosen over v2 and v3 by ear (ADR 0013). */
const TTS_MODEL = 'eleven_v4';
const OUTPUT_FORMAT = 'mp3_44100_128';
const REQUEST_TIMEOUT_MS = 120_000;
/** A key without the "User" permission may not read its own usage; the check is then skipped. */
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

// ---- functions ---------------------------------------------------------------------------------

export async function synthesize(config: ElevenLabsConfig, text: string): Promise<Uint8Array> {
  const url = `${config.baseUrl}/v1/text-to-speech/${config.voiceId}?output_format=${OUTPUT_FORMAT}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': config.apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: TTS_MODEL }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs text-to-speech HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Undefined when the key may not read usage: the key's own credit limit still caps spending. */
export async function readUsage(config: ElevenLabsConfig): Promise<Usage | undefined> {
  const response = await fetch(`${config.baseUrl}/v1/user/subscription`, {
    headers: { 'xi-api-key': config.apiKey },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`ElevenLabs subscription HTTP ${response.status}`);
  }
  const subscription = (await response.json()) as SubscriptionResponse;
  return { used: subscription.character_count, limit: subscription.character_limit };
}
