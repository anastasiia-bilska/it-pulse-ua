// A scheduled job against a database that is down and a local fake of healthchecks.io.
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { runScheduledJob } from '../scheduled-job.ts';

// ---- constants ---------------------------------------------------------------------------------

/** Nothing listens on port 1, so connecting fails at once. */
const UNREACHABLE_DATABASE_URL = 'postgres://user:password@127.0.0.1:1/none';

// ---- module state (set in before()) ------------------------------------------------------------

const pingPaths: string[] = [];
let server: Server;

// ---- lifecycle ---------------------------------------------------------------------------------

before(async () => {
  server = createServer((request, response) => {
    pingPaths.push(request.url ?? '');
    response.end('OK');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  process.env.HEALTHCHECK_URL = `http://127.0.0.1:${port}/check`;
  process.env.DATABASE_URL = UNREACHABLE_DATABASE_URL;
});

after(() => {
  delete process.env.HEALTHCHECK_URL;
  delete process.env.DATABASE_URL;
  server.close();
});

// ---- scenarios ---------------------------------------------------------------------------------

test('a database that is down alerts with /fail at once, and the job fails', async () => {
  let hasWorkRun = false;

  await assert.rejects(
    runScheduledJob('test-job', () => {
      hasWorkRun = true;
      return Promise.resolve([]);
    }),
  );

  assert.equal(hasWorkRun, false);
  assert.deepEqual(pingPaths, ['/check/fail']);
});
