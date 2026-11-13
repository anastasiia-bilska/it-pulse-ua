// Public API of the taxonomy module. Other modules import only from here.
export { canMerge } from './guard.ts';
export { normalizeSkillName } from './normalize.ts';
export { recordDecision, resolveSkills } from './resolve.ts';
export type { TriageDecision, Verdict } from './resolve.ts';
export { seedSkills } from './seed.ts';
export type { Skill, SkillCategory } from './seed.ts';
