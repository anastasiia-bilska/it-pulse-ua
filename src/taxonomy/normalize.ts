// ---- functions ---------------------------------------------------------------------------------

/**
 * Turns a skill name into the key that aliases are stored and matched under: NFKC (fullwidth and
 * compatibility forms), whitespace collapsed and trimmed, lower case. Mirrors the SQL function
 * `normalize_skill_name` (migration 004); an integration test keeps the two in step.
 */
export function normalizeSkillName(name: string): string {
  return name.normalize('NFKC').replaceAll(/\s+/g, ' ').trim().toLowerCase();
}
