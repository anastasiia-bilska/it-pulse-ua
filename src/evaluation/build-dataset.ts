// CLI: builds the extraction eval set and uploads it to a Langfuse dataset (ADR 0007).
// Run once the queue has drained, so the sample is drawn from the whole population.
import pg from 'pg';
import { EXTRACTOR_VERSION, vacancyText, type ExtractedFields } from '../extractor/index.ts';
import {
  ensureDataset,
  langfuseCredentialsFromEnvironment,
  upsertDatasetItems,
  type DatasetItem,
  type LangfuseCredentials,
} from '../observability/index.ts';
import { sampleEvalSet, type Candidate, type SampledVacancy } from './sample.ts';

// ---- types -------------------------------------------------------------------------------------

/** The model's answer without its quotes: what a label must match. */
type ExpectedFields = Omit<
  ExtractedFields,
  'salary_quote' | 'english_quote' | 'experience_quote' | 'domain_quote'
>;

interface CandidateRow extends ExpectedFields {
  raw_item_id: string;
  source: string;
  payload: Parameters<typeof vacancyText>[0];
}

// ---- constants ---------------------------------------------------------------------------------

export const DATASET_NAME = 'extraction-eval-v1';

const DATASET_DESCRIPTION =
  '150 vacancies for extraction eval (ADR 0007). Blind items: label from scratch. ' +
  'Prelabelled items: the expected output is the model answer, correct it.';

// The current extraction of every vacancy, for the current extractor version.
const CANDIDATES_SQL = `
  select vacancy_current.raw_item_id, vacancy_current.source, raw_item.payload,
         extraction.role, extraction.seniority, extraction.salary_min::float8 as salary_min,
         extraction.salary_max::float8 as salary_max, extraction.salary_currency,
         extraction.salary_period, extraction.work_format, extraction.locations,
         extraction.abroad_allowed, extraction.english,
         extraction.experience_years_min::float8 as experience_years_min,
         extraction.company_type, extraction.domain,
         coalesce(
           (select jsonb_agg(jsonb_build_object('name', raw_name, 'required', required)
                             order by raw_name)
            from extraction_skill where extraction_id = extraction.id),
           '[]') as skills
  from vacancy_current
  join raw_item on raw_item.id = vacancy_current.raw_item_id
  join extraction on extraction.raw_item_id = vacancy_current.raw_item_id
                 and extraction.extractor_version = $1`;

// ---- functions ---------------------------------------------------------------------------------

async function buildDataset(): Promise<void> {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows } = await db.query<CandidateRow>(CANDIDATES_SQL, [EXTRACTOR_VERSION]);
    const rowsById = new Map(rows.map((row) => [row.raw_item_id, row]));
    const sample = sampleEvalSet(rows.map((row) => toCandidate(row)));
    const credentials = credentialsFromEnvironment();
    await ensureDataset(credentials, { name: DATASET_NAME, description: DATASET_DESCRIPTION });
    await upsertDatasetItems(
      credentials,
      DATASET_NAME,
      sample.map((sampled) => toDatasetItem(sampled, rowsById)),
    );
    console.log(summaryLine(rows.length, sample));
  } finally {
    await db.end();
  }
}

function toCandidate(row: CandidateRow): Candidate {
  return {
    rawItemId: row.raw_item_id,
    source: row.source,
    role: row.role,
    seniority: row.seniority,
    text: vacancyText(row.payload),
  };
}

function toDatasetItem(sampled: SampledVacancy, rowsById: Map<string, CandidateRow>): DatasetItem {
  const { rawItemId, text } = sampled.candidate;
  const row = rowsById.get(rawItemId);
  return {
    id: `${DATASET_NAME}-${rawItemId}`,
    input: { raw_item_id: rawItemId, text },
    expectedOutput: row && sampled.labelling === 'prelabelled' ? expectedFields(row) : null,
    metadata: {
      labelling: sampled.labelling,
      reason: sampled.reason,
      source: sampled.candidate.source,
      prelabel_version: EXTRACTOR_VERSION,
    },
  };
}

function expectedFields(row: CandidateRow): ExpectedFields {
  return {
    role: row.role,
    seniority: row.seniority,
    salary_min: row.salary_min,
    salary_max: row.salary_max,
    salary_currency: row.salary_currency,
    salary_period: row.salary_period,
    work_format: row.work_format,
    locations: row.locations,
    abroad_allowed: row.abroad_allowed,
    english: row.english,
    experience_years_min: row.experience_years_min,
    company_type: row.company_type,
    domain: row.domain,
    skills: row.skills,
  };
}

function credentialsFromEnvironment(): LangfuseCredentials {
  const credentials = langfuseCredentialsFromEnvironment();
  if (!credentials) {
    throw new Error('LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required');
  }
  return credentials;
}

/** Counts only: Actions logs are public. */
function summaryLine(population: number, sample: SampledVacancy[]): string {
  const blind = sample.filter((sampled) => sampled.labelling === 'blind').length;
  const byReason = Object.entries(
    Object.groupBy(sample, (sampled) => sampled.reason.split(' ', 1)[0] ?? 'other'),
  )
    .map(([reason, items]) => `${reason}:${items?.length ?? 0}`)
    .join(',');
  return `population=${population} sample=${sample.length} blind=${blind} reasons=${byReason}`;
}

await buildDataset();
