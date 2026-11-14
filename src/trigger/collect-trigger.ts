// Cloudflare Worker: a reliable clock for scheduled workflows (ADR 0018). GitHub's own cron is
// best effort and drops slots under load (on 2026-11-14 only 3 of 12 ran), so Cloudflare Cron
// Triggers dispatch the workflows instead. It holds a token that may only run this repository's
// workflows.

// ---- types -------------------------------------------------------------------------------------

export interface TriggerEnvironment {
  /** Fine-grained GitHub token: Actions read/write on it-pulse-ua only. */
  DISPATCH_TOKEN: string;
}

/** The part of Cloudflare's ScheduledController the Worker reads. */
interface ScheduledController {
  cron: string;
}

// ---- constants ---------------------------------------------------------------------------------

const WORKFLOWS_URL =
  'https://api.github.com/repos/anastasiia-bilska/it-pulse-ua/actions/workflows';

/** Each cron in wrangler.toml and the workflow it starts. Keep the two in sync. */
export const WORKFLOW_BY_CRON: Record<string, string> = {
  '17 */2 * * *': 'collect.yml', // the collector, every 2 hours
  '5 8 * * 1': 'digest.yml', // the weekly digest, Mondays after the Gemini quota resets (ADR 0013)
};

const worker = {
  /** Cron Trigger entry point (wrangler.toml); a thrown error shows as a failed invocation. */
  async scheduled(controller: ScheduledController, environment: TriggerEnvironment): Promise<void> {
    await dispatchWorkflow(workflowFor(controller.cron), environment.DISPATCH_TOKEN, fetch);
  },
};

// ---- functions ---------------------------------------------------------------------------------

/** A cron without a workflow is a configuration error: fail loudly, never skip silently. */
export function workflowFor(cron: string): string {
  const workflow = WORKFLOW_BY_CRON[cron];
  if (!workflow) {
    throw new Error(`no workflow for cron "${cron}"`);
  }
  return workflow;
}

/** Starts one run of the workflow on main. Fails loudly: a silent miss looks like a quiet week. */
export async function dispatchWorkflow(
  workflow: string,
  token: string,
  fetcher: typeof fetch,
): Promise<void> {
  const response = await fetcher(`${WORKFLOWS_URL}/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'it-pulse-ua-collect-trigger',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (!response.ok) {
    throw new Error(`GitHub dispatch of ${workflow} HTTP ${response.status}`);
  }
}

// ---- entry point -------------------------------------------------------------------------------

export default worker;
