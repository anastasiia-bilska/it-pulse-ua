// The digest's view of the number guard (ADR 0013): the facts' numbers plus the parts of the
// week's dates, which the script says aloud.
import { findUnknownNumbers as unknownNumbers, numbersIn } from '../shared/index.ts';
import type { WeeklyFacts } from './weekly-facts.ts';

// ---- constants ---------------------------------------------------------------------------------

const DATE_PARTS = /\d+/g;

// ---- functions ---------------------------------------------------------------------------------

/** Numbers in `script` that the facts don't contain. Empty means the script may be published. */
export function findUnknownNumbers(script: string, facts: WeeklyFacts): string[] {
  return unknownNumbers(script, allowedNumbers(facts));
}

/** Every number in the facts and the parts of the dates. */
export function allowedNumbers(facts: WeeklyFacts): number[] {
  const dateParts = [facts.week, facts.firstDay, facts.lastDay]
    .flatMap((text) => text.match(DATE_PARTS) ?? [])
    .map(Number);
  return [...numbersIn(facts), ...dateParts];
}
