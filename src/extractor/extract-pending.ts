// One extraction run: take the queue, ask the model vacancy by vacancy, store or count failures.
import { setTimeout as sleep } from 'node:timers/promises';
import type pg from 'pg';
import type { Tracer } from '../observability/index.ts';
import { checkEvidence, type RiskyField } from './evidence.ts';
import { extractedFieldsSchema, type ExtractedFields } from './fields.ts';
import { generateJson, QuotaExhaustedError, type GeminiConfig, type Generation } from './gemini.ts';
import { EXTRACTOR_VERSION, PROMPT_HASH, RESPONSE_SCHEMA, SYSTEM_INSTRUCTION } from './prompt.ts';
import {
  countBacklog,
  pendingVacancies,
  recordFailure,
  saveExtraction,
  type PendingVacancy,
} from './repository.ts';
import { tidyFields } from './tidy-fields.ts';
import { vacancyText } from './vacancy-text.ts';

// ---- types -------------------------------------------------------------------------------------

export interface ExtractionOptions {
  gemini: GeminiConfig;
  /** At most this many vacancies per run: protects the free-tier quota (ADR 0007). */
  limit: number;
  /** Pause between model calls, to stay under the per-minute quota. */
  requestIntervalMs: number;
  /** After a 429, wait this long and try once more before stopping the run. */
  quotaWaitMs: number;
  /** Every model call becomes a Langfuse generation (ADR 0010). */
  tracer: Tracer;
}

export interface RunReport {
  processed: number;
  failed: number;
  /** Risky fields nulled by the evidence check, per field. */
  dropped: Record<RiskyField, number>;
  stoppedByQuota: boolean;
  backlog: number;
}

type Outcome =
  | { kind: 'saved'; dropped: RiskyField[]; generation: Generation }
  | { kind: 'failed'; reason: string }
  | { kind: 'quota' };

interface Attempt {
  vacancy: PendingVacancy;
  model: string;
  startedAt: Date;
}

interface ModelAnswer {
  fields: ExtractedFields;
  generation: Generation;
}

// ---- functions ---------------------------------------------------------------------------------

export async function extractPending(
  db: pg.Client,
  options: ExtractionOptions,
): Promise<RunReport> {
  const vacancies = await pendingVacancies(db, EXTRACTOR_VERSION, options.limit);
  const report = emptyReport();
  for (const [index, vacancy] of vacancies.entries()) {
    if (index > 0) {
      await sleep(options.requestIntervalMs);
    }
    const outcome = await extractOne(db, vacancy, options);
    addToReport(report, outcome);
    if (outcome.kind === 'quota') {
      break;
    }
  }
  report.backlog = await countBacklog(db, EXTRACTOR_VERSION);
  return report;
}

function emptyReport(): RunReport {
  return {
    processed: 0,
    failed: 0,
    dropped: { salary: 0, english: 0, experience: 0, domain: 0 },
    stoppedByQuota: false,
    backlog: 0,
  };
}

async function extractOne(
  db: pg.Client,
  vacancy: PendingVacancy,
  options: ExtractionOptions,
): Promise<Outcome> {
  const attempt = { vacancy, model: options.gemini.model, startedAt: new Date() };
  const outcome = await tryExtract(db, vacancy, options);
  traceAttempt(options.tracer, attempt, outcome);
  return outcome;
}

/** Never throws for one vacancy: its failure is recorded, and the run moves on. */
async function tryExtract(
  db: pg.Client,
  vacancy: PendingVacancy,
  options: ExtractionOptions,
): Promise<Outcome> {
  const text = vacancyText(vacancy.payload);
  try {
    const answer = await askModelWithOneRetry(text, options);
    const checked = checkEvidence(tidyFields(answer.fields), text);
    await saveExtraction(db, {
      rawItemId: vacancy.rawItemId,
      version: EXTRACTOR_VERSION,
      model: options.gemini.model,
      promptHash: PROMPT_HASH,
      generation: answer.generation,
      fields: checked.fields,
      evidence: checked.evidence,
    });
    return { kind: 'saved', dropped: checked.dropped, generation: answer.generation };
  } catch (error) {
    if (error instanceof QuotaExhaustedError) {
      return { kind: 'quota' };
    }
    const reason = error instanceof Error ? error.message : String(error);
    await recordFailure(db, { rawItemId: vacancy.rawItemId, version: EXTRACTOR_VERSION }, reason);
    return { kind: 'failed', reason };
  }
}

/** A quota stop is not traced: no answer came back, and the vacancy stays queued. */
function traceAttempt(tracer: Tracer, attempt: Attempt, outcome: Outcome): void {
  if (outcome.kind === 'quota') {
    return;
  }
  const generation = outcome.kind === 'saved' ? outcome.generation : undefined;
  tracer.recordGeneration({
    name: 'extract-vacancy',
    model: attempt.model,
    startedAt: attempt.startedAt,
    endedAt: new Date(),
    input: vacancyText(attempt.vacancy.payload),
    ...(generation && {
      output: generation.text,
      usage: { input: generation.inputTokens, output: generation.outputTokens },
    }),
    metadata: {
      raw_item_id: attempt.vacancy.rawItemId,
      extractor_version: EXTRACTOR_VERSION,
      prompt_hash: PROMPT_HASH,
      outcome: outcome.kind,
      dropped: outcome.kind === 'saved' ? outcome.dropped.join(',') : '',
    },
    tags: ['extractor', EXTRACTOR_VERSION],
    ...(outcome.kind === 'failed' && { errorMessage: outcome.reason }),
  });
}

/** A 429 waits out the per-minute window first; any other error is retried at once. */
async function askModelWithOneRetry(
  text: string,
  options: ExtractionOptions,
): Promise<ModelAnswer> {
  try {
    return await askModel(text, options.gemini);
  } catch (error) {
    if (error instanceof QuotaExhaustedError) {
      await sleep(options.quotaWaitMs);
    }
    return askModel(text, options.gemini);
  }
}

/** Throws on HTTP errors, invalid JSON and answers that break the contract. */
async function askModel(text: string, gemini: GeminiConfig): Promise<ModelAnswer> {
  const generation = await generateJson(gemini, {
    systemInstruction: SYSTEM_INSTRUCTION,
    input: text,
    schema: RESPONSE_SCHEMA,
  });
  const parsed = extractedFieldsSchema.safeParse(JSON.parse(generation.text));
  if (!parsed.success) {
    throw new Error(`answer breaks the contract: ${describeIssues(parsed.error.issues)}`);
  }
  return { fields: parsed.data, generation };
}

/** Field paths only: the values could quote vacancy text, and this lands in the database. */
function describeIssues(issues: { path: PropertyKey[] }[]): string {
  return issues.map((issue) => issue.path.map(String).join('.')).join(', ');
}

function addToReport(report: RunReport, outcome: Outcome): void {
  switch (outcome.kind) {
    case 'saved': {
      report.processed++;
      for (const field of outcome.dropped) {
        report.dropped[field]++;
      }
      break;
    }
    case 'failed': {
      report.failed++;
      break;
    }
    case 'quota': {
      report.stoppedByQuota = true;
      break;
    }
  }
}
