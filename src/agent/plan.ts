// Step 1 of an answer (ADR 0021): the model reads the question and picks one fixed SQL tool and its
// filters. It never writes SQL, and it never sees a number at this step.
import { z } from 'zod';
import {
  COMPANY_TYPES,
  DOMAINS,
  ENGLISH_LEVELS,
  generateJson,
  ROLES,
  SENIORITIES,
  toGeminiSchema,
  WORK_FORMATS,
  type GeminiConfig,
} from '../extractor/index.ts';
import type { Tracer } from '../observability/index.ts';

// ---- types -------------------------------------------------------------------------------------

export type Language = (typeof LANGUAGES)[number];
export type Dimension = (typeof DIMENSIONS)[number];
type RawPlan = z.infer<typeof rawPlanSchema>;

export interface Filters {
  role: (typeof ROLES)[number] | null;
  seniority: (typeof SENIORITIES)[number] | null;
}

/** What to compute. `unsupported`: the data can't answer it (advice, forecasts, companies…). */
export type Plan = { language: Language } & (
  | { tool: 'salary'; filters: Filters }
  | { tool: 'top_skills'; filters: Filters }
  | { tool: 'skill_demand'; filters: Filters; skill: string }
  | { tool: 'distribution'; filters: Filters; dimension: Dimension }
  | { tool: 'unsupported' }
);

// ---- constants ---------------------------------------------------------------------------------

export const LANGUAGES = ['uk', 'en'] as const;
const TOOLS = ['salary', 'top_skills', 'skill_demand', 'distribution', 'unsupported'] as const;
/** Columns of vacancy_current, used verbatim in SQL, so they come only from this list. */
export const DIMENSIONS = [
  'role',
  'seniority',
  'work_format',
  'english',
  'company_type',
  'domain',
] as const;
const MAX_SKILL_CHARS = 60;

const rawPlanSchema = z.object({
  language: z.enum(LANGUAGES).describe('The language of the question'),
  tool: z.enum(TOOLS),
  role: z.enum(ROLES).nullable(),
  seniority: z.enum(SENIORITIES).nullable(),
  skill: z.string().max(MAX_SKILL_CHARS).nullable().describe('Only for skill_demand'),
  dimension: z.enum(DIMENSIONS).nullable().describe('Only for distribution'),
});

const RESPONSE_SCHEMA = toGeminiSchema(z.toJSONSchema(rawPlanSchema));

const SYSTEM_INSTRUCTION = `You route questions about the Ukrainian IT job market to one tool.
The data: vacancies from DOU and Djinni seen in the last 30 days, with extracted facts.

Tools:
- salary: salary quartiles in USD per month. Filters: role, seniority.
- top_skills: the most requested skills. Filters: role, seniority.
- skill_demand: how many vacancies ask for one skill ("skill", e.g. "Python", "Kubernetes").
  Filters: role, seniority.
- distribution: the split of vacancies by one dimension: role, seniority, work_format
  (${WORK_FORMATS.join(', ')}), english (${ENGLISH_LEVELS.join(', ')}), company_type
  (${COMPANY_TYPES.join(', ')}) or domain (${DOMAINS.join(', ')}). Filters: role, seniority.
- unsupported: anything else: advice, forecasts, specific companies or vacancies, other
  countries, salaries in other currencies, or a question that is not about the job market.

Rules:
- Set role and seniority only when the question names them; otherwise null.
- "language" is the language the question is written in: "uk" or "en".
- Never answer the question yourself.`;

// ---- functions ---------------------------------------------------------------------------------

export async function planQuestion(
  gemini: GeminiConfig,
  question: string,
  tracer: Tracer,
): Promise<Plan> {
  const startedAt = new Date();
  const generation = await generateJson(gemini, {
    systemInstruction: SYSTEM_INSTRUCTION,
    input: question,
    schema: RESPONSE_SCHEMA,
  });
  const plan = parsePlan(generation.text);
  tracer.recordGeneration({
    name: 'agent-plan',
    model: gemini.model,
    startedAt,
    endedAt: new Date(),
    input: question,
    output: generation.text,
    usage: { input: generation.inputTokens, output: generation.outputTokens },
    metadata: { tool: plan.tool, language: plan.language },
    tags: ['agent'],
  });
  return plan;
}

/** Pure: the model's raw answer in, a plan out. A plan missing what its tool needs is unsupported. */
export function parsePlan(answer: string): Plan {
  const parsed = rawPlanSchema.safeParse(JSON.parse(answer));
  return parsed.success ? toPlan(parsed.data) : { language: 'uk', tool: 'unsupported' };
}

function toPlan(raw: RawPlan): Plan {
  const { language } = raw;
  const unsupported: Plan = { language, tool: 'unsupported' };
  const filters: Filters = { role: raw.role, seniority: raw.seniority };
  const skill = raw.skill?.trim();
  if (raw.tool === 'skill_demand') {
    return skill ? { language, tool: raw.tool, filters, skill } : unsupported;
  }
  if (raw.tool === 'distribution') {
    return raw.dimension
      ? { language, tool: raw.tool, filters, dimension: raw.dimension }
      : unsupported;
  }
  return raw.tool === 'unsupported' ? unsupported : { language, tool: raw.tool, filters };
}
