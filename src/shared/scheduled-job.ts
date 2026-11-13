import pg from 'pg';

// ---- constants ---------------------------------------------------------------------------------

const HEALTHCHECK_TIMEOUT_MS = 10_000;

// ---- functions ---------------------------------------------------------------------------------

/**
 * Runs one scheduled job (collect, extract) the same way every time:
 * - connect to DATABASE_URL;
 * - run the work, which returns the problems it found;
 * - report to healthchecks.io: a success ping is the heartbeat, `/fail` alerts now;
 * - on a crash, alert and rethrow so the Actions run fails too.
 *
 * Logs carry counts only: Actions logs are public.
 */
export async function runScheduledJob(
  jobName: string,
  work: (db: pg.Client) => Promise<string[]>,
): Promise<void> {
  const pingUrl = healthchecksUrlFromEnvironment();
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const problems = await work(db);
    for (const problem of problems) {
      console.log(`PROBLEM\t${problem}`);
    }
    await pingHealthchecks(pingUrl, problems);
  } catch (error) {
    await pingHealthchecks(pingUrl, [`${jobName} crashed: ${String(error)}`]);
    throw error;
  } finally {
    await db.end();
  }
}

/**
 * A malformed URL is a configuration error, so it fails the run at once (and GitHub emails),
 * instead of being swallowed like a network blip. An unset URL means "no alerting", e.g. locally.
 */
function healthchecksUrlFromEnvironment(): string | undefined {
  const pingUrl = process.env.HEALTHCHECK_URL;
  if (!pingUrl) {
    return undefined;
  }
  if (!URL.canParse(pingUrl)) {
    throw new Error('HEALTHCHECK_URL is not a valid URL (expected https://hc-ping.com/<uuid>)');
  }
  return pingUrl;
}

/** A broken healthchecks.io must never fail the job itself. */
async function pingHealthchecks(pingUrl: string | undefined, problems: string[]): Promise<void> {
  if (!pingUrl) {
    return;
  }
  const hasProblems = problems.length > 0;
  try {
    await fetch(hasProblems ? `${pingUrl}/fail` : pingUrl, {
      method: 'POST',
      body: hasProblems ? problems.join('\n') : 'ok',
      signal: AbortSignal.timeout(HEALTHCHECK_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`healthcheck ping failed: ${String(error)}`);
  }
}
