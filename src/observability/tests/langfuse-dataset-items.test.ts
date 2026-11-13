// Reading dataset items back, against a local fake of the Langfuse public API.
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { fetchDatasetItems, type LangfuseCredentials } from '../index.ts';

// ---- constants ---------------------------------------------------------------------------------

const DATASET = 'eval set';
/** Synthetic items, more than one page of them. */
const STORED_ITEMS = Array.from({ length: 70 })
  .keys()
  .map((index) => ({
    id: `item-${index}`,
    input: { raw_item_id: String(index), text: 'synthetic' },
    expectedOutput: null,
    metadata: { labelling: 'blind' },
  }))
  .toArray();

// ---- shared state ------------------------------------------------------------------------------

const requestedUrls: URL[] = [];
const authorizations: string[] = [];
let server: Server;
let credentials: LangfuseCredentials;

// ---- fake Langfuse -----------------------------------------------------------------------------

function respond(request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? '', 'http://fake');
  requestedUrls.push(url);
  authorizations.push(request.headers.authorization ?? '');
  if (url.searchParams.get('datasetName') !== DATASET) {
    response.writeHead(404).end('{}');
    return;
  }
  const page = Number(url.searchParams.get('page'));
  const limit = Number(url.searchParams.get('limit'));
  const body = {
    data: STORED_ITEMS.slice((page - 1) * limit, page * limit),
    meta: {
      page,
      limit,
      totalItems: STORED_ITEMS.length,
      totalPages: Math.ceil(STORED_ITEMS.length / limit),
    },
  };
  response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
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

test('every page of items is fetched, with Basic auth and the dataset name', async () => {
  requestedUrls.length = 0;

  const items = await fetchDatasetItems(credentials, DATASET);

  assert.deepEqual(
    items.map((item) => item.id),
    STORED_ITEMS.map((item) => item.id),
  );
  assert.ok(requestedUrls.length > 1);
  assert.equal(requestedUrls[0]?.pathname, '/api/public/dataset-items');
  assert.equal(authorizations[0], `Basic ${Buffer.from('pk:sk').toString('base64')}`);
});

test('a dataset that does not exist yet has no items', async () => {
  const items = await fetchDatasetItems(credentials, 'missing');

  assert.deepEqual(items, []);
});
