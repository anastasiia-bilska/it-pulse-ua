// The guard against invented numbers (ADR 0013): every number a script says must be one the facts
// contain. A set lookup, not a tolerance check, because the model is given rounded numbers.
// ponytail: numbers written as words ("п'ять", "five") pass unseen; the prompt forbids them.
import type { WeeklyFacts } from './weekly-facts.ts';

// ---- constants ---------------------------------------------------------------------------------

/**
 * "1 500" / "1,500" (thousand separators: space, no-break and narrow no-break space, comma) or a
 * plain number with an optional decimal part ("12", "3.5", "3,5").
 */
const NUMBER_PATTERN = /\d{1,3}(?:[ \u{A0}\u{202F},]\d{3})+(?!\d)|\d+(?:[.,]\d+)?/gu;
const THOUSAND_SEPARATORS = /[ \u{A0}\u{202F},]/gu;
const DATE_PARTS = /\d+/g;

// ---- functions ---------------------------------------------------------------------------------

/** Numbers in `script` that the facts don't contain. Empty means the script may be published. */
export function findUnknownNumbers(script: string, facts: WeeklyFacts): string[] {
  const allowed = allowedNumbers(facts);
  const spoken = script.match(NUMBER_PATTERN) ?? [];
  return spoken.filter((number) => !allowed.has(normalise(number)));
}

/** Every number in the facts, its absolute value ("down 8%"), and the parts of the dates. */
export function allowedNumbers(facts: WeeklyFacts): Set<string> {
  const numbers = collectNumbers(facts).flatMap((number) => [number, Math.abs(number)]);
  const dateParts = [facts.week, facts.firstDay, facts.lastDay]
    .flatMap((text) => text.match(DATE_PARTS) ?? [])
    .map(Number);
  return new Set([...numbers, ...dateParts].map(String));
}

function collectNumbers(value: unknown): number[] {
  if (typeof value === 'number') {
    return [value];
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return Object.values(value).flatMap((child) => collectNumbers(child));
}

/** "1 500" → "1500", "3,5" → "3.5", "07" → "7": the form String(number) gives. */
function normalise(number: string): string {
  const isGrouped = /^\d{1,3}(?:[ \u{A0}\u{202F},]\d{3})+$/u.test(number);
  const plain = isGrouped ? number.replaceAll(THOUSAND_SEPARATORS, '') : number.replace(',', '.');
  return String(Number(plain));
}
