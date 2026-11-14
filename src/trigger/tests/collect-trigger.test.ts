import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatchCollect } from '../collect-trigger.ts';

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

  await dispatchCollect('test-token', fakeFetch(204, calls));

  const [call] = calls;
  assert.ok(call && calls.length === 1);
  assert.match(call.url, /actions\/workflows\/collect\.yml\/dispatches$/);
  assert.equal(call.init.body, JSON.stringify({ ref: 'main' }));
  assert.equal(new Headers(call.init.headers).get('authorization'), 'Bearer test-token');
});

test('a refused dispatch fails the invocation instead of passing silently', async () => {
  await assert.rejects(dispatchCollect('expired', fakeFetch(401, [])), /HTTP 401/);
});
