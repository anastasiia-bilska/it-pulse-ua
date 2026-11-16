// Cloudflare Pages Function: POST /api/ask on the dashboard's own origin (ADR 0021). Only wiring:
// the endpoint lives in the agent module.
import { handleAsk, type AskContext } from '../../src/agent/index.ts';

// ---- entry point -------------------------------------------------------------------------------

export function onRequestPost(context: AskContext): Promise<Response> {
  return handleAsk(context);
}
