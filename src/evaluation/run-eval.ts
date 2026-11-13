// CLI: runs the current extractor prompt and model on the labelled eval set and scores the
// answers (ADR 0012). The eval gate for prompt and model changes. Prints counts only: Actions
// logs are public.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import {
  extractedFieldsSchema,
  extractFields,
  EXTRACTOR_VERSION,
  GEMINI_BASE_URL,
  MODEL,
  PROMPT_HASH,
  QUOTA_WAIT_MS,
  QuotaExhaustedError,
  REQUEST_INTERVAL_MS,
  type ModelCallOptions,
} from '../extractor/index.ts';
import {
  fetchDatasetItems,
  langfuseCredentialsFromEnvironment,
  type StoredDatasetItem,
} from '../observability/index.ts';
import { DATASET_NAME, type Labelling } from './sample.ts';
import {
  SCORED_FIELDS,
  scoreEval,
  type EvalScore,
  type GroupScore,
  type ScoredCase,
} from './score.ts';

// ---- types -------------------------------------------------------------------------------------

interface EvalItem {
  labelling: Labelling;
  text: string;
  expected: ScoredCase['expected'];
}

// ---- constants ---------------------------------------------------------------------------------

/** TODO(ADR 0012): no gate yet. Set the real threshold after the first labelled baseline. */
const MIN_ACCURACY = 0;

const REPORT_PATH = 'dist/eval/report.json';
const COLUMN_WIDTH = 22;
const DECIMALS = 3;

const itemSchema = z.object({
  input: z.object({ text: z.string() }),
  expectedOutput: extractedFieldsSchema
    .omit({ salary_quote: true, english_quote: true, experience_quote: true, domain_quote: true })
    .nullable(),
  metadata: z.object({
    labelling: z.enum(['blind', 'prelabelled']),
    // Set by the labeller in the Langfuse UI once a pre-label is corrected (ADR 0012).
    reviewed: z.unknown().optional(),
  }),
});

// ---- functions ---------------------------------------------------------------------------------

async function runEval(): Promise<void> {
  const credentials = langfuseCredentialsFromEnvironment();
  if (!credentials) {
    console.log('eval skipped: LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are not set');
    return;
  }
  const stored = await fetchDatasetItems(credentials, DATASET_NAME);
  if (!stored) {
    console.log(`eval skipped: dataset ${DATASET_NAME} not found (run eval-dataset first)`);
    return;
  }
  const items = stored.map((item) => toEvalItem(item));
  if (items.every((item) => item.expected === null)) {
    console.log(`eval skipped: no labelled items yet (items=${items.length})`);
    return;
  }
  const score = scoreEval(await answerAll(items, modelOptions()));
  console.log(scoreTable(score));
  await writeReport(score);
  if (score.all.accuracy >= MIN_ACCURACY) {
    return;
  }
  console.error(`eval gate failed: accuracy below ${MIN_ACCURACY}`);
  process.exitCode = 1;
}

/**
 * Labels are edited by hand in Langfuse, so they are validated. Errors name paths, not values:
 * a value may quote the vacancy.
 */
function toEvalItem(item: StoredDatasetItem): EvalItem {
  const parsed = itemSchema.safeParse(item);
  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path.map(String).join('.'));
    throw new Error(`dataset item ${item.id} breaks the eval contract: ${paths.join(', ')}`);
  }
  const { input, expectedOutput, metadata } = parsed.data;
  return {
    labelling: metadata.labelling,
    text: input.text,
    expected: isLabelled(metadata) ? expectedOutput : null,
  };
}

/** An uncorrected pre-label is the model's own answer: scoring against it would prove nothing. */
function isLabelled(metadata: z.infer<typeof itemSchema>['metadata']): boolean {
  // The UI edits metadata as JSON, so both `true` and `"true"` mean reviewed.
  return metadata.labelling === 'blind' || String(metadata.reviewed) === 'true';
}

function modelOptions(): ModelCallOptions {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required');
  }
  return {
    gemini: { apiKey, model: MODEL, baseUrl: process.env.GEMINI_BASE_URL ?? GEMINI_BASE_URL },
    quotaWaitMs: QUOTA_WAIT_MS,
  };
}

/** Paced like an extraction run. Unlabelled items are never sent to the model. */
async function answerAll(items: EvalItem[], options: ModelCallOptions): Promise<ScoredCase[]> {
  const cases: ScoredCase[] = [];
  for (const item of items) {
    if (item.expected === null) {
      cases.push({ labelling: item.labelling, expected: null, actual: null });
      continue;
    }
    if (cases.some((scored) => scored.expected !== null)) {
      await sleep(REQUEST_INTERVAL_MS);
    }
    cases.push({ ...item, actual: await answerOrNull(item.text, options) });
  }
  return cases;
}

/**
 * A broken answer is a wrong answer, and the run goes on. Exhausted quota stops the run: a partial
 * score is no gate result.
 */
async function answerOrNull(
  text: string,
  options: ModelCallOptions,
): Promise<ScoredCase['actual']> {
  try {
    return await extractFields(text, options);
  } catch (error) {
    if (error instanceof QuotaExhaustedError) {
      throw error;
    }
    return null;
  }
}

/** Counts and ratios only: no vacancy text. */
function scoreTable(score: EvalScore): string {
  const groups = [score.all, score.blind, score.prelabelled];
  return [
    tableRow('field', ['all', 'blind', 'prelabelled']),
    ...SCORED_FIELDS.map((field) =>
      tableRow(
        field,
        groups.map((group) => `${group.fields[field].correct}/${group.fields[field].total}`),
      ),
    ),
    tableRow(
      'accuracy',
      groups.map((group) => group.accuracy.toFixed(DECIMALS)),
    ),
    tableRow(
      'skills p/r/f1',
      groups.map((group) => skillCell(group)),
    ),
    [
      `items=${score.all.items}`,
      `skipped=${score.skipped}`,
      `failed=${score.failed}`,
      `anchoring_gap=${score.anchoringGap?.toFixed(DECIMALS) ?? 'n/a'}`,
    ].join(' '),
  ].join('\n');
}

function tableRow(label: string, cells: string[]): string {
  return [label, ...cells].map((cell) => cell.padEnd(COLUMN_WIDTH)).join('');
}

function skillCell({ skills }: GroupScore): string {
  return [skills.precision, skills.recall, skills.f1].map((value) => value.toFixed(2)).join('/');
}

async function writeReport(score: EvalScore): Promise<void> {
  const report = {
    dataset: DATASET_NAME,
    extractorVersion: EXTRACTOR_VERSION,
    model: MODEL,
    promptHash: PROMPT_HASH,
    minAccuracy: MIN_ACCURACY,
    ...score,
  };
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, undefined, 2)}\n`);
}

await runEval();
