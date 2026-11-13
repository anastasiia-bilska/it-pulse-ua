// Hallucination guard (ADR 0007): a risky field survives only if its quote really is in the text.
import type { ExtractedFields } from './fields.ts';

// ---- types -------------------------------------------------------------------------------------

export type RiskyField = 'salary' | 'english' | 'experience' | 'domain';

/** Verified quotes, stored in `extraction.evidence`. */
export type Evidence = Partial<Record<RiskyField, string>>;

export interface CheckedFields {
  fields: ExtractedFields;
  evidence: Evidence;
  /** Fields nulled because their quote was missing or not found in the text. */
  dropped: RiskyField[];
}

interface RiskyFieldRule {
  name: RiskyField;
  isStated: (fields: ExtractedFields) => boolean;
  quote: (fields: ExtractedFields) => string | null;
  /** The values that "not stated" means for this field. */
  unstated: Partial<ExtractedFields>;
}

// ---- constants ---------------------------------------------------------------------------------

const RISKY_FIELD_RULES: RiskyFieldRule[] = [
  {
    name: 'salary',
    isStated: (fields) => fields.salary_min !== null || fields.salary_max !== null,
    quote: (fields) => fields.salary_quote,
    unstated: { salary_min: null, salary_max: null, salary_currency: null, salary_period: null },
  },
  {
    name: 'english',
    isStated: (fields) => fields.english !== null,
    quote: (fields) => fields.english_quote,
    unstated: { english: null },
  },
  {
    name: 'experience',
    isStated: (fields) => fields.experience_years_min !== null,
    quote: (fields) => fields.experience_quote,
    unstated: { experience_years_min: null },
  },
  {
    name: 'domain',
    isStated: (fields) => fields.domain !== null,
    quote: (fields) => fields.domain_quote,
    unstated: { domain: null },
  },
];

// ---- functions ---------------------------------------------------------------------------------

export function checkEvidence(fields: ExtractedFields, vacancyText: string): CheckedFields {
  const searchableText = comparable(vacancyText);
  const result: CheckedFields = { fields: { ...fields }, evidence: {}, dropped: [] };

  for (const rule of RISKY_FIELD_RULES) {
    if (!rule.isStated(fields)) {
      continue;
    }
    const quote = rule.quote(fields);
    if (quote !== null && isQuoteIn(searchableText, quote)) {
      result.evidence[rule.name] = quote;
    } else {
      Object.assign(result.fields, rule.unstated);
      result.dropped.push(rule.name);
    }
  }
  return result;
}

function isQuoteIn(searchableText: string, quote: string): boolean {
  const searchableQuote = comparable(quote);
  return searchableQuote !== '' && searchableText.includes(searchableQuote);
}

/** Case, Unicode form, whitespace and typographic quotes must not break a verbatim match. */
function comparable(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll(/[‘’ʼ`]/g, "'")
    .replaceAll(/[“”«»]/g, '"')
    .replaceAll(/\s+/g, ' ')
    .trim();
}
