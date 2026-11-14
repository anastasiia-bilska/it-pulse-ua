// Cloudflare Worker: a reliable clock for the collector (ADR 0018). GitHub's own cron is best
// effort and drops slots under load (on 2026-11-14 only 3 of 12 ran), so a Cloudflare Cron Trigger
// dispatches collect.yml instead. It holds a token that may only run this repository's workflows.

// ---- types -------------------------------------------------------------------------------------

export interface TriggerEnvironment {
  /** Fine-grained GitHub token: Actions read/write on it-pulse-ua only. */
  DISPATCH_TOKEN: string;
}

// ---- constants ---------------------------------------------------------------------------------

const DISPATCH_URL =
  'https://api.github.com/repos/anastasiia-bilska/it-pulse-ua/actions/workflows/collect.yml/dispatches';

const worker = {
  /** Cron Trigger entry point (wrangler.toml); a thrown error shows as a failed invocation. */
  async scheduled(controller: unknown, environment: TriggerEnvironment): Promise<void> {
    await dispatchCollect(environment.DISPATCH_TOKEN, fetch);
  },
};

// ---- functions ---------------------------------------------------------------------------------

/** Starts one collect run on main. Fails loudly: a silent miss would look like a quiet market. */
export async function dispatchCollect(token: string, fetcher: typeof fetch): Promise<void> {
  const response = await fetcher(DISPATCH_URL, {
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
    throw new Error(`GitHub workflow dispatch HTTP ${response.status}`);
  }
}

// ---- entry point -------------------------------------------------------------------------------

export default worker;
