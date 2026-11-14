import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { dispatchWorkflow, WORKFLOW_BY_CRON, workflowFor } from '../collect-trigger.ts';

// ---- types -------------------------------------------------------------------------------------

interface Call {
  url: string;
  init: RequestInit;
}

// ---- functions ---------------------------------------------------------------------------------

/** A fetch that records each request and answers with `status`. */
function fakeFetch(status: number, calls: Call[]): typeof fetch {
  return (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: url instanceof Request ? url.url : url.toString(), init: init ?? {} });
    return Promise.resolve(new Response(null, { status }));
  };
}

// ---- scenarios ---------------------------------------------------------------------------------

test('the trigger dispatches collect.yml on main with the token', async () => {
  const calls: Call[] = [];

  await dispatchWorkflow('collect.yml', 'test-token', fakeFetch(204, calls));

  const [call] = calls;
  assert.ok(call && calls.length === 1);
  assert.match(call.url, /actions\/workflows\/collect\.yml\/dispatches$/);
  assert.equal(call.init.body, JSON.stringify({ ref: 'main' }));
  assert.equal(new Headers(call.init.headers).get('authorization'), 'Bearer test-token');
});

test('a refused dispatch fails the invocation instead of passing silently', async () => {
  await assert.rejects(dispatchWorkflow('digest.yml', 'expired', fakeFetch(401, [])), /HTTP 401/);
});

test('the Monday cron starts the digest, the 2-hour cron the collector', () => {
  assert.equal(workflowFor('5 8 * * 1'), 'digest.yml');
  assert.equal(workflowFor('17 */2 * * *'), 'collect.yml');
});

test('a cron with no workflow fails instead of doing nothing', () => {
  assert.throws(() => workflowFor('0 0 * * *'), /no workflow for cron/);
});

test('every cron in wrangler.toml has a workflow, and every workflow a cron', async () => {
  const toml = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');

  const cronList = /^crons = \[(.*)\]$/m.exec(toml)?.[1] ?? '';
  const crons = cronList
    .matchAll(/"([^"]+)"/g)
    .map((match) => match[1])
    .toArray();

  assert.deepEqual(crons.toSorted(), Object.keys(WORKFLOW_BY_CRON).toSorted());
});
