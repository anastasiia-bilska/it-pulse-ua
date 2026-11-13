import { normalizeSkillName } from './normalize.ts';
import { SEED_SKILLS, spellingsOf } from './seed.ts';

// ---- constants ---------------------------------------------------------------------------------

/**
 * Look-alike siblings that automated steps (LLM triage, any future fuzzy match) must never
 * merge: each group lists normalized spellings of different things. A human may still merge them.
 */
export const NEVER_MERGE: readonly (readonly string[])[] = [
  ['java', 'javascript'],
  ['javascript', 'typescript'],
  ['c', 'c++', 'c#', 'objective-c'],
  ['go', 'google', 'google cloud'],
  ['react', 'react native'],
  ['sql', 'nosql', 'mysql'],
  ['.net', '.net framework'],
  ['angular', 'angularjs'],
  ['next.js', 'nestjs', 'nuxt'],
  ['ruby', 'ruby on rails'],
  ['swift', 'swiftui'],
  ['kotlin', 'kotlin multiplatform'],
  ['spring', 'spring boot'],
  ['selenium', 'selenide'],
];

/** Each seed skill's slug and spellings, so a slug can be compared with an alias. */
const SPELLINGS_BY_SLUG = new Map(
  SEED_SKILLS.map((skill) => [skill.slug, new Set([skill.slug, ...spellingsOf(skill)])]),
);

// ---- functions ---------------------------------------------------------------------------------

/**
 * May an automated step map `alias` to the skill `skillSlug`? No when the alias is a guarded
 * sibling of one of the skill's spellings, e.g. "javascript" → java or "nosql" → sql.
 */
export function canMerge(alias: string, skillSlug: string): boolean {
  const spelling = normalizeSkillName(alias);
  const skillSpellings = SPELLINGS_BY_SLUG.get(skillSlug) ?? new Set([skillSlug]);
  const isSiblingOfSkill = NEVER_MERGE.some(
    (siblings) =>
      siblings.includes(spelling) && siblings.some((sibling) => skillSpellings.has(sibling)),
  );
  return skillSpellings.has(spelling) || !isSiblingOfSkill;
}
