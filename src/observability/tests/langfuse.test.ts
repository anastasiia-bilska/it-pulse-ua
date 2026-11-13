// The tracer against a local fake of Langfuse's OTLP endpoint: request shape and best-effort sends.
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createLangfuseTracer, type GenerationTrace } from '../index.ts';

// ---- types -------------------------------------------------------------------------------------

interface ReceivedRequest {
  path: string;
  authorization: string;
  body: {
    resourceSpans: {
      scopeSpans: {
        spans: {
          traceId: string;
          attributes: { key: string; value: { stringValue?: string } }[];
          status: { code: number };
        }[];
      }[];
    }[];
  };
}

// ---- constants ---------------------------------------------------------------------------------

const GENERATION: GenerationTrace = {
  name: 'extract-vacancy',
  model: 'gemini-test',
  startedAt: new Date('2026-11-13T21:00:00Z'),
  endedAt: new Date('2026-11-13T21:00:02Z'),
  input: 'Synthetic vacancy text',
  output: '{"role":"qa"}',
  usage: { input: 900, output: 120 },
  metadata: { extractor_version: 'v1', outcome: 'saved' },
  tags: ['extractor', 'v1'],
};

// ---- shared state ------------------------------------------------------------------------------

const received: ReceivedRequest[] = [];
let respondWith = 200;
let server: Server;
let baseUrl = '';

// ---- fake Langfuse -----------------------------------------------------------------------------

function respond(request: IncomingMessage, response: ServerResponse): void {
  let body = '';
  request.on('data', (chunk: Buffer) => (body += chunk.toString()));
  request.on('end', () => {
    received.push({
      path: request.url ?? '',
      authorization: request.headers.authorization ?? '',
      body: JSON.parse(body) as ReceivedRequest['body'],
    });
    response.writeHead(respondWith).end('{}');
  });
}

function attributesOf(request: ReceivedRequest): Map<string, string | undefined> {
  const span = request.body.resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
  return new Map(span.attributes.map((attribute) => [attribute.key, attribute.value.stringValue]));
}

// ---- lifecycle ---------------------------------------------------------------------------------

before(async () => {
  server = createServer(respond);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

// ---- scenarios ---------------------------------------------------------------------------------

test('a generation is sent as an OTLP span with Langfuse attributes and basic auth', async () => {
  const tracer = createLangfuseTracer({ publicKey: 'pk', secretKey: 'sk', baseUrl });

  tracer.recordGeneration(GENERATION);
  await tracer.flush();

  const request = received.at(-1)!;
  assert.equal(request.path, '/api/public/otel/v1/traces');
  assert.equal(request.authorization, `Basic ${Buffer.from('pk:sk').toString('base64')}`);
  const attributes = attributesOf(request);
  assert.equal(attributes.get('langfuse.observation.type'), 'generation');
  assert.equal(attributes.get('langfuse.observation.model.name'), 'gemini-test');
  assert.equal(attributes.get('langfuse.observation.usage_details'), '{"input":900,"output":120}');
  assert.equal(attributes.get('langfuse.observation.metadata.outcome'), 'saved');
});

test('a failed call is marked as an error span', async () => {
  const tracer = createLangfuseTracer({ publicKey: 'pk', secretKey: 'sk', baseUrl });

  tracer.recordGeneration({ ...GENERATION, errorMessage: 'Gemini HTTP 500' });
  await tracer.flush();

  const span = received.at(-1)!.body.resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
  assert.equal(span.status.code, 2);
  assert.match(span.traceId, /^[\da-f]{32}$/);
});

test('flush sends in chunks and empties the buffer', async () => {
  const tracer = createLangfuseTracer({ publicKey: 'pk', secretKey: 'sk', baseUrl });
  received.length = 0;

  for (let index = 0; index < 120; index++) {
    tracer.recordGeneration(GENERATION);
  }
  await tracer.flush();
  await tracer.flush();

  assert.equal(received.length, 3, '120 spans in chunks of 50; the second flush sends nothing');
});

test('Langfuse being down never throws', async () => {
  const tracer = createLangfuseTracer({ publicKey: 'pk', secretKey: 'sk', baseUrl });
  respondWith = 503;

  tracer.recordGeneration(GENERATION);

  await assert.doesNotReject(tracer.flush());
  respondWith = 200;
});
