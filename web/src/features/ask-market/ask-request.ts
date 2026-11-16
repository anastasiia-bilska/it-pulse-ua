// POST /api/ask (ADR 0021): the Pages Function on the page's own origin. Every refusal (limit,
// invalid, busy) still comes back as {kind, text}, so the page shows the agent's own words.
import type { Language } from '../../shared/lib/index.ts';

// ---- types -------------------------------------------------------------------------------------

/** answered, insufficient, unsupported, unknown_skill, failed, limit, busy, invalid or error. */
export interface AgentReply {
  kind: string;
  text: string;
}

// ---- constants ---------------------------------------------------------------------------------

const ASK_URL = '/api/ask';

// ---- functions ---------------------------------------------------------------------------------

/** Throws only when there is no reply at all (offline, a proxy page): the caller says so. */
export async function requestAnswer(question: string, language: Language): Promise<AgentReply> {
  const response = await fetch(ASK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, language }),
  });
  const data: unknown = await response.json();
  if (!isAgentReply(data)) {
    throw new Error(`/api/ask: unexpected reply, HTTP ${response.status}`);
  }
  return data;
}

function isAgentReply(data: unknown): data is AgentReply {
  return (
    typeof data === 'object' &&
    data !== null &&
    'kind' in data &&
    typeof data.kind === 'string' &&
    'text' in data &&
    typeof data.text === 'string'
  );
}
