// Langfuse datasets over the public REST API (plain fetch): the eval set lives there, so labelling
// happens in the Langfuse UI and every eval run is compared against the same items (ADR 0007).

// ---- types -------------------------------------------------------------------------------------

export interface LangfuseCredentials {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}

export interface DatasetItem {
  /** Stable id: re-running the upload updates the item instead of adding a duplicate. */
  id: string;
  input: unknown;
  /** `null` for items to be labelled blind. */
  expectedOutput: unknown;
  metadata: Record<string, string>;
}

// ---- constants ---------------------------------------------------------------------------------

const DATASETS_PATH = '/api/public/v2/datasets';
const DATASET_ITEMS_PATH = '/api/public/dataset-items';
const REQUEST_TIMEOUT_MS = 30_000;
const HTTP_NOT_FOUND = 404;

// ---- functions ---------------------------------------------------------------------------------

/** Creates the dataset unless it already exists. */
export async function ensureDataset(
  credentials: LangfuseCredentials,
  dataset: { name: string; description: string },
): Promise<void> {
  const existing = await request(
    credentials,
    `${DATASETS_PATH}/${encodeURIComponent(dataset.name)}`,
  );
  if (existing.status !== HTTP_NOT_FOUND) {
    await assertOk(existing, 'read dataset');
    return;
  }
  const created = await request(credentials, DATASETS_PATH, dataset);
  await assertOk(created, 'create dataset');
}

/** Upserts items one by one (the API has no batch call); ids keep it idempotent. */
export async function upsertDatasetItems(
  credentials: LangfuseCredentials,
  datasetName: string,
  items: DatasetItem[],
): Promise<void> {
  for (const item of items) {
    const response = await request(credentials, DATASET_ITEMS_PATH, { datasetName, ...item });
    await assertOk(response, `upsert item ${item.id}`);
  }
}

function request(credentials: LangfuseCredentials, path: string, body?: object): Promise<Response> {
  const basic = Buffer.from(`${credentials.publicKey}:${credentials.secretKey}`).toString('base64');
  return fetch(`${credentials.baseUrl}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/json' },
    ...(body && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/** Status only in the error: a response may echo vacancy text, and Actions logs are public. */
async function assertOk(response: Response, action: string): Promise<void> {
  if (response.ok) {
    return;
  }
  await response.body?.cancel();
  throw new Error(`Langfuse: ${action} failed with HTTP ${response.status}`);
}
