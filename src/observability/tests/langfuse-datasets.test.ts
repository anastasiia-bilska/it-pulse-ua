// Dataset calls against a local fake of the Langfuse public API.
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { ensureDataset, upsertDatasetItems, type LangfuseCredentials } from '../index.ts';

// ---- types -------------------------------------------------------------------------------------

interface ReceivedRequest {
  method: string;
  path: string;
  body: Record<string, unknown> | undefined;
}

// ---- shared state ------------------------------------------------------------------------------

const received: ReceivedRequest[] = [];
const existingDatasets = new Set<string>();
let server: Server;
let credentials: LangfuseCredentials;

// ---- fake Langfuse -----------------------------------------------------------------------------

function respond(request: IncomingMessage, response: ServerResponse): void {
  let body = '';
  request.on('data', (chunk: Buffer) => (body += chunk.toString()));
  request.on('end', () => {
    const path = request.url ?? '';
    received.push({
      method: request.method ?? '',
      path,
      body: body ? (JSON.parse(body) as Record<string, unknown>) : undefined,
    });
    const datasetName = decodeURIComponent(path.split('/').at(-1) ?? '');
    const isMissingDataset = request.method === 'GET' && !existingDatasets.has(datasetName);
    response.writeHead(isMissingDataset ? 404 : 200).end('{}');
  });
}

// ---- lifecycle ---------------------------------------------------------------------------------

before(async () => {
  server = createServer(respond);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  credentials = { publicKey: 'pk', secretKey: 'sk', baseUrl: `http://127.0.0.1:${port}` };
});

after(() => {
  server.close();
});

// ---- scenarios ---------------------------------------------------------------------------------

test('a missing dataset is created, an existing one is left alone', async () => {
  await ensureDataset(credentials, { name: 'eval-set', description: 'd' });
  existingDatasets.add('eval-set');
  await ensureDataset(credentials, { name: 'eval-set', description: 'd' });

  const creations = received.filter((request) => request.method === 'POST');
  assert.equal(creations.length, 1);
  assert.equal(creations[0]?.path, '/api/public/v2/datasets');
});

test('items are upserted with their stable id and dataset name', async () => {
  received.length = 0;

  await upsertDatasetItems(credentials, 'eval-set', [
    {
      id: 'eval-set-1',
      input: { text: 'a' },
      expectedOutput: null,
      metadata: { labelling: 'blind' },
    },
  ]);

  const upsert = received[0]!;
  const body = upsert.body ?? {};
  assert.equal(upsert.path, '/api/public/dataset-items');
  assert.equal(body.id, 'eval-set-1');
  assert.equal(body.datasetName, 'eval-set');
});
