// All SQL of the extractor: the work queue, results, the retry queue and run telemetry.
import type pg from 'pg';
import type { Payload } from '../collector/index.ts';
import { inTransaction } from '../db/index.ts';
import type { Evidence } from './evidence.ts';
import type { ExtractedFields } from './fields.ts';
import type { Generation } from './gemini.ts';

// ---- types -------------------------------------------------------------------------------------

export interface PendingVacancy {
  rawItemId: string;
  payload: Payload;
}

export interface ExtractionRecord {
  rawItemId: string;
  version: string;
  model: string;
  promptHash: string;
  generation: Generation;
  fields: ExtractedFields;
  evidence: Evidence;
}

export interface JobRunRecord {
  startedAt: Date;
  status: 'ok' | 'quota_exhausted';
  processed: number;
  failed: number;
  backlog: number;
}

// ---- constants ---------------------------------------------------------------------------------

/** After this many failed attempts a vacancy is a dead letter and leaves the queue. */
export const MAX_ATTEMPTS = 3;

// The queue: the current content version of each vacancy that has no extraction for this
// extractor version yet and is not a dead letter. Newest first, so fresh data lands first.
const QUEUE_CONDITION = `
  not exists (
    select 1 from extraction
    where extraction.raw_item_id = vacancy_current.raw_item_id
      and extraction.extractor_version = $1)
  and not exists (
    select 1 from extraction_error
    where extraction_error.raw_item_id = vacancy_current.raw_item_id
      and extraction_error.extractor_version = $1
      and extraction_error.attempts >= $2)`;

const PENDING_SQL = `
  select raw_item.id as raw_item_id, raw_item.payload
  from vacancy_current
  join raw_item on raw_item.id = vacancy_current.raw_item_id
  where ${QUEUE_CONDITION}
  order by raw_item.id desc
  limit $3`;

const BACKLOG_SQL = `
  select count(*)::int as backlog
  from vacancy_current
  where ${QUEUE_CONDITION}`;

const INSERT_EXTRACTION_SQL = `
  insert into extraction (
    raw_item_id, extractor_version, model, prompt_hash, latency_ms, tokens_in, tokens_out,
    role, seniority, salary_min, salary_max, salary_currency, salary_period, work_format,
    locations, abroad_allowed, english, experience_years_min, company_type, domain, evidence)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21)
  returning id`;

const INSERT_SKILLS_SQL = `
  insert into extraction_skill (extraction_id, raw_name, required)
  select $1, skill.name, skill.required
  from unnest($2::text[], $3::boolean[]) as skill (name, required)`;

const RECORD_FAILURE_SQL = `
  insert into extraction_error (raw_item_id, extractor_version, last_error)
  values ($1, $2, $3)
  on conflict (raw_item_id, extractor_version) do update
  set attempts = extraction_error.attempts + 1,
      last_error = excluded.last_error,
      last_attempt_at = now()`;

// started_at comes from the runner's clock, finished_at from the database's. least() keeps a small
// clock skew from breaking the started_at <= finished_at constraint.
const INSERT_JOB_RUN_SQL = `
  insert into job_run (job, started_at, status, processed, failed, backlog)
  values ('extract', least($1::timestamptz, now()), $2, $3, $4, $5)`;

const RECENT_BACKLOGS_SQL = `
  select backlog from job_run where job = 'extract' order by id desc limit $1`;

// ---- functions ---------------------------------------------------------------------------------

export async function pendingVacancies(
  db: pg.Client,
  version: string,
  limit: number,
): Promise<PendingVacancy[]> {
  const { rows } = await db.query<{ raw_item_id: string; payload: Payload }>(PENDING_SQL, [
    version,
    MAX_ATTEMPTS,
    limit,
  ]);
  return rows.map((row) => ({ rawItemId: row.raw_item_id, payload: row.payload }));
}

export async function countBacklog(db: pg.Client, version: string): Promise<number> {
  const { rows } = await db.query<{ backlog: number }>(BACKLOG_SQL, [version, MAX_ATTEMPTS]);
  return rows[0]?.backlog ?? 0;
}

/** One extraction and its skills land together or not at all. */
export async function saveExtraction(db: pg.Client, record: ExtractionRecord): Promise<void> {
  await inTransaction(db, async () => {
    const { rows } = await db.query<{ id: string }>(
      INSERT_EXTRACTION_SQL,
      extractionValues(record),
    );
    const extractionId = rows[0]?.id;
    const { skills } = record.fields;
    await db.query(INSERT_SKILLS_SQL, [
      extractionId,
      skills.map((skill) => skill.name),
      skills.map((skill) => skill.required),
    ]);
  });
}

function extractionValues(record: ExtractionRecord): unknown[] {
  const { fields, generation } = record;
  return [
    record.rawItemId,
    record.version,
    record.model,
    record.promptHash,
    generation.latencyMs,
    generation.inputTokens,
    generation.outputTokens,
    fields.role,
    fields.seniority,
    fields.salary_min,
    fields.salary_max,
    fields.salary_currency,
    fields.salary_period,
    fields.work_format,
    fields.locations,
    fields.abroad_allowed,
    fields.english,
    fields.experience_years_min,
    fields.company_type,
    fields.domain,
    record.evidence,
  ];
}

/** Counts the attempt; at MAX_ATTEMPTS the vacancy drops out of the queue as a dead letter. */
export async function recordFailure(
  db: pg.Client,
  vacancy: { rawItemId: string; version: string },
  reason: string,
): Promise<void> {
  await db.query(RECORD_FAILURE_SQL, [vacancy.rawItemId, vacancy.version, reason]);
}

export async function recordJobRun(db: pg.Client, run: JobRunRecord): Promise<void> {
  await db.query(INSERT_JOB_RUN_SQL, [
    run.startedAt,
    run.status,
    run.processed,
    run.failed,
    run.backlog,
  ]);
}

/** Backlog sizes of the latest runs, newest first. */
export async function recentBacklogs(db: pg.Client, runs: number): Promise<number[]> {
  const { rows } = await db.query<{ backlog: number }>(RECENT_BACKLOGS_SQL, [runs]);
  return rows.map((row) => row.backlog);
}
