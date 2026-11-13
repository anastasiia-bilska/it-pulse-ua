// The contract between the model and the database: what the model must return for a vacancy.
// The enums mirror the CHECK constraints of migration 003; an integration test keeps them in sync.
import { z } from 'zod';

// ---- types -------------------------------------------------------------------------------------

export type ExtractedFields = z.infer<typeof extractedFieldsSchema>;

// ---- constants ---------------------------------------------------------------------------------

export const ROLES = [
  'backend',
  'frontend',
  'fullstack',
  'mobile',
  'ml_ai',
  'data_engineering',
  'data_analytics',
  'devops',
  'qa',
  'security',
  'gamedev',
  'embedded',
  'design',
  'product',
  'project',
  'business_analysis',
  'marketing',
  'sales',
  'hr',
  'support',
  'management',
  'other',
] as const;

export const SENIORITIES = ['intern', 'junior', 'middle', 'senior', 'lead'] as const;
export const CURRENCIES = ['USD', 'EUR', 'UAH'] as const;
export const SALARY_PERIODS = ['hour', 'month', 'year'] as const;
export const WORK_FORMATS = ['remote', 'office', 'hybrid'] as const;
export const ENGLISH_LEVELS = ['none', 'basic', 'intermediate', 'upper', 'fluent'] as const;
export const COMPANY_TYPES = ['product', 'outsource', 'outstaff'] as const;

export const DOMAINS = [
  'fintech',
  'igaming',
  'gamedev',
  'ecommerce',
  'healthtech',
  'edtech',
  'adtech',
  'martech',
  'defense',
  'govtech',
  'logistics',
  'telecom',
  'automotive',
  'cybersecurity',
  'ai',
  'other',
] as const;

const MAX_SKILLS = 40;
const MAX_LOCATIONS = 10;
const MAX_EXPERIENCE_YEARS = 30;

/** A verbatim fragment of the vacancy text that backs a risky field (ADR 0007). */
const quote = z
  .string()
  .nullable()
  .describe('Verbatim fragment of the vacancy text that states this value, or null.');

const MAX_SKILL_NAME_LENGTH = 100;

const skillSchema = z.object({
  name: z.string().min(1).max(MAX_SKILL_NAME_LENGTH),
  required: z.boolean(),
});

/**
 * Field names are snake_case on purpose: they are the wire format with the model and map 1:1 to
 * the `extraction` columns.
 */
export const extractedFieldsSchema = z.object({
  role: z.enum(ROLES).nullable(),
  seniority: z.enum(SENIORITIES).nullable(),
  salary_min: z.number().positive().nullable(),
  salary_max: z.number().positive().nullable(),
  salary_currency: z.enum(CURRENCIES).nullable(),
  salary_period: z.enum(SALARY_PERIODS).nullable(),
  salary_quote: quote,
  work_format: z.enum(WORK_FORMATS).nullable(),
  locations: z.array(z.string().min(1)).max(MAX_LOCATIONS),
  abroad_allowed: z.boolean().nullable(),
  english: z.enum(ENGLISH_LEVELS).nullable(),
  english_quote: quote,
  experience_years_min: z.number().min(0).max(MAX_EXPERIENCE_YEARS).nullable(),
  experience_quote: quote,
  company_type: z.enum(COMPANY_TYPES).nullable(),
  domain: z.enum(DOMAINS).nullable(),
  domain_quote: quote,
  skills: z.array(skillSchema).max(MAX_SKILLS),
});
