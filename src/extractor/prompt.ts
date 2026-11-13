// Everything that defines an extractor version. Changing any of it means a new EXTRACTOR_VERSION,
// which re-extracts every vacancy and must pass the eval gate (ADR 0007).
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { extractedFieldsSchema } from './fields.ts';
import { toGeminiSchema } from './gemini.ts';

// ---- constants ---------------------------------------------------------------------------------

export const EXTRACTOR_VERSION = 'v1';

/** Pinned, never a `-latest` alias: a silent model swap would make eval results meaningless. */
export const MODEL = 'gemini-3.5-flash-lite';

export const SYSTEM_INSTRUCTION = `You extract structured facts from one Ukrainian IT job vacancy.
The text may be in Ukrainian, English or a mix.

Hard rules:
- Use only what the vacancy states. If a field is not stated, return null (or [] for lists).
  Never guess, never use typical market values, never infer from the company name.
- Quotes (*_quote) must be copied verbatim from the vacancy text, 3 to 120 characters,
  without changing words, numbers or punctuation. Return null when the field is null.

Fields:
- role: the main specialisation. ml_ai covers ML, data science and LLM engineering.
  management covers engineering managers, CTOs and team leads without hands-on duties.
- seniority: the level the vacancy asks for. "Lead" and "Team Lead" mean lead.
- salary_*: only an explicitly stated salary. "від 2000$" means salary_min 2000.
  A single number is both salary_min and salary_max. Use salary_period month when the text
  states no period. salary_quote is the fragment with the numbers.
- work_format: remote, office or hybrid, only if stated.
- locations: cities named as places of work, in the language of the text.
  abroad_allowed: true only if working from outside Ukraine is explicitly allowed.
- english: required English level. B1 = intermediate, B2 = upper, C1/C2 = fluent,
  A1/A2 = basic.
- experience_years_min: the minimum years of experience asked for, as a number.
- company_type: only if the vacancy says the company is a product, outsource or outstaff company.
- domain: the business domain of the product or client, only if stated. Use other if the domain
  is stated but not in the list.
- skills: technologies, languages, frameworks, tools and methodologies, named as in the text
  (e.g. "Python", "Kubernetes", "Scrum"). required is false for "nice to have" / "буде плюсом".
  No soft skills, no spoken languages.`;

/** Fingerprint of the prompt and the output contract, stored with every extraction. */
export const PROMPT_HASH = createHash('sha256')
  .update(SYSTEM_INSTRUCTION)
  .update(JSON.stringify(z.toJSONSchema(extractedFieldsSchema)))
  .digest('hex')
  .slice(0, 16);

/** The JSON Schema sent to Gemini as the structured output format. */
export const RESPONSE_SCHEMA = toGeminiSchema(z.toJSONSchema(extractedFieldsSchema));
