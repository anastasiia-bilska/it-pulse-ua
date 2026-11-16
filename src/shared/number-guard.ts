// The guard against invented numbers (ADR 0013, ADR 0020): every number a model writes must be one
// the facts contain. A set lookup, not a tolerance check, because the model is given rounded
// numbers.
// ponytail: numbers written as words ("п'ять", "five") pass unseen; the prompts forbid them.

// ---- constants ---------------------------------------------------------------------------------

/**
 * "1 500" / "1,500" (thousand separators: space, no-break and narrow no-break space, comma) or a
 * plain number with an optional decimal part ("12", "3.5", "3,5").
 */
const NUMBER_PATTERN = /\d{1,3}(?:[ \u{A0}\u{202F},]\d{3})+(?!\d)|\d+(?:[.,]\d+)?/gu;
const GROUPED_NUMBER = /^\d{1,3}(?:[ \u{A0}\u{202F},]\d{3})+$/u;
const THOUSAND_SEPARATORS = /[ \u{A0}\u{202F},]/gu;

// ---- functions ---------------------------------------------------------------------------------

/** Numbers in `text` that are not in `allowed`. Empty means the text may be shown. */
export function findUnknownNumbers(text: string, allowed: number[]): string[] {
  const known = new Set(allowed.flatMap((number) => [number, Math.abs(number)]).map(String));
  const written = text.match(NUMBER_PATTERN) ?? [];
  return written.filter((number) => !known.has(normalise(number)));
}

/** Every number anywhere inside a JSON-like value. */
export function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') {
    return [value];
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return Object.values(value).flatMap((child) => numbersIn(child));
}

/** "1 500" → "1500", "3,5" → "3.5", "07" → "7": the form String(number) gives. */
function normalise(number: string): string {
  const plain = GROUPED_NUMBER.test(number)
    ? number.replaceAll(THOUSAND_SEPARATORS, '')
    : number.replace(',', '.');
  return String(Number(plain));
}
