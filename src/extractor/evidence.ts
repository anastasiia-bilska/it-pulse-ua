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
  /** Numbers the quote itself must state, beyond merely being in the text. */
  quotedNumbers?: (fields: ExtractedFields) => number[];
  /** The values that "not stated" means for this field. */
  unstated: Partial<ExtractedFields>;
}

// ---- constants ---------------------------------------------------------------------------------

const RISKY_FIELD_RULES: RiskyFieldRule[] = [
  {
    name: 'salary',
    isStated: (fields) => fields.salary_min !== null || fields.salary_max !== null,
    quote: (fields) => fields.salary_quote,
    // A real quote can still carry a made-up amount: "25 000 грн + до 50 000" read as max 75000.
    quotedNumbers: (fields) =>
      [fields.salary_min, fields.salary_max].filter((amount) => amount !== null),
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

// Experience has no quotedNumbers on purpose: quotes say "three years", "6 months" for 0.5 or "not
// required" for 0, and a digits-only rule dropped 19 of 630 correct values (ADR 0007).

/** "32 000", "2,000", "4000", "1.5": grouped thousands first, so "32 000" stays one number. */
const NUMBER = /(\d{1,3}(?:[\s,.]\d{3})+(?!\d)|\d+(?:[.,]\d+)?)\s*(k|к|тис)?/giu;
const GROUPED_THOUSANDS = /^\d{1,3}(?:[\s,.]\d{3})+$/u;
/** "$3-4k": the k of the last number belongs to the first one too. */
const SHARED_THOUSANDS_RANGE = /(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(k|к|тис)/giu;
const THOUSAND = 1000;

// ---- functions ---------------------------------------------------------------------------------

export function checkEvidence(fields: ExtractedFields, vacancyText: string): CheckedFields {
  const searchableText = comparable(vacancyText);
  const result: CheckedFields = { fields: { ...fields }, evidence: {}, dropped: [] };

  for (const rule of RISKY_FIELD_RULES) {
    if (!rule.isStated(fields)) {
      continue;
    }
    const quote = rule.quote(fields);
    if (
      quote !== null &&
      isQuoteIn(searchableText, quote) &&
      hasQuotedNumbers(quote, rule, fields)
    ) {
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

function hasQuotedNumbers(quote: string, rule: RiskyFieldRule, fields: ExtractedFields): boolean {
  const quoted = numbersIn(quote);
  return (rule.quotedNumbers?.(fields) ?? []).every((value) => quoted.includes(value));
}

/** Every amount the quote states, with "4k" and "4 тис" read as 4000. */
export function numbersIn(quote: string): number[] {
  const text = quote.normalize('NFKC').replaceAll(SHARED_THOUSANDS_RANGE, '$1$3-$2$3');
  return text
    .matchAll(NUMBER)
    .map(([, digits = '', thousands]) => toNumber(digits) * (thousands ? THOUSAND : 1))
    .toArray();
}

function toNumber(digits: string): number {
  // "2,000" is two thousand; "1,5" is one and a half.
  return Number(
    GROUPED_THOUSANDS.test(digits) ? digits.replaceAll(/\D/g, '') : digits.replace(',', '.'),
  );
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
