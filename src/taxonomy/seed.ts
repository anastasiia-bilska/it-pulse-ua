// Loads the committed dictionary, db/seed/skills.json, into skill and skill_alias.
// Re-runnable: new skills and aliases are added, so extending the seed later is one more run.
import path from 'node:path';
import pg from 'pg';
import seedFile from '../../db/seed/skills.json' with { type: 'json' };
import { inTransaction } from '../db/index.ts';
import { normalizeSkillName } from './normalize.ts';

// ---- types -------------------------------------------------------------------------------------

/** Mirrors the `skill.category` check in migration 004. */
export type SkillCategory =
  | 'cloud'
  | 'data_ml'
  | 'database'
  | 'devops'
  | 'framework'
  | 'frontend'
  | 'language'
  | 'methodology'
  | 'mobile'
  | 'other'
  | 'testing'
  | 'tool';

export interface Skill {
  slug: string;
  name: string;
  category: SkillCategory;
}

export interface SeedSkill extends Skill {
  aliases: string[];
}

export interface SeedSummary {
  skills: number;
  aliases: number;
}

// ---- constants ---------------------------------------------------------------------------------

/** The seed's shape is checked by unit tests and, on load, by the table constraints. */
export const SEED_SKILLS = seedFile as SeedSkill[];

// A seed edit to a skill's name or category reaches the database on the next run.
const UPSERT_SKILLS_SQL = `
  insert into skill (slug, name, category)
  select * from unnest($1::text[], $2::text[], $3::text[])
  on conflict (slug) do update set name = excluded.name, category = excluded.category`;

const INSERT_ALIASES_SQL = `
  insert into skill_alias (alias, skill_id, source)
  select seed.alias, skill.id, 'seed'
  from unnest($1::text[], $2::text[]) as seed (alias, slug)
  join skill on skill.slug = seed.slug
  on conflict (alias) do nothing`;

const CONFLICTING_ALIASES_SQL = `
  select seed.alias
  from unnest($1::text[], $2::text[]) as seed (alias, slug)
  join skill_alias on skill_alias.alias = seed.alias
  join skill on skill.id = skill_alias.skill_id
  where skill.slug <> seed.slug`;

// ---- functions ---------------------------------------------------------------------------------

/**
 * Upserts the seed skills and adds their aliases in one transaction. Fails if a seed alias
 * already points to another skill: moving an alias is a decision for a human, not for a re-run.
 */
export async function seedSkills(db: pg.Client): Promise<SeedSummary> {
  const aliases = SEED_SKILLS.flatMap((skill) =>
    spellingsOf(skill).map((alias) => ({ alias, slug: skill.slug })),
  );
  const aliasColumns = [aliases.map((row) => row.alias), aliases.map((row) => row.slug)];
  await inTransaction(db, async () => {
    await db.query(UPSERT_SKILLS_SQL, [
      SEED_SKILLS.map((skill) => skill.slug),
      SEED_SKILLS.map((skill) => skill.name),
      SEED_SKILLS.map((skill) => skill.category),
    ]);
    await db.query(INSERT_ALIASES_SQL, aliasColumns);
    await assertNoConflictingAliases(db, aliasColumns);
  });
  return { skills: SEED_SKILLS.length, aliases: aliases.length };
}

/** Every normalized spelling of a seed skill: its name plus its aliases. */
export function spellingsOf(skill: SeedSkill): string[] {
  return [...new Set([skill.name, ...skill.aliases].map((name) => normalizeSkillName(name)))];
}

async function assertNoConflictingAliases(db: pg.Client, aliasColumns: string[][]): Promise<void> {
  const { rows } = await db.query<{ alias: string }>(CONFLICTING_ALIASES_SQL, aliasColumns);
  if (rows.length === 0) {
    return;
  }
  const conflicts = rows.map((row) => row.alias).join(', ');
  throw new Error(`seed aliases already map to another skill: ${conflicts}`);
}

// ---- entry point -------------------------------------------------------------------------------

const isEntryPoint = import.meta.filename === path.resolve(process.argv[1] ?? '');
if (isEntryPoint) {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const summary = await seedSkills(db);
    console.log(`seeded ${summary.skills} skills, ${summary.aliases} aliases`);
  } finally {
    await db.end();
  }
}
