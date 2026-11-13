import type pg from 'pg';
import type { Skill } from './seed.ts';
import { inTransaction } from '../db/index.ts';
import { canMerge } from './guard.ts';
import { normalizeSkillName } from './normalize.ts';

// ---- types -------------------------------------------------------------------------------------

/** What triage decided about an unknown spelling. */
export type Verdict =
  | { decision: 'mapped'; skillSlug: string }
  | { decision: 'new_skill'; skill: Skill }
  | { decision: 'rejected' };

/** One triage decision, by the LLM (later work) or by a human. */
export type TriageDecision = Verdict & {
  alias: string;
  decidedBy: 'human' | 'llm';
  confidence: number | null;
  reason: string;
};

// ---- constants ---------------------------------------------------------------------------------

/**
 * Exact alias matching happens in the view extraction_skill_resolved. Every name it leaves
 * unresolved becomes a candidate. Counts are recomputed from scratch, so a re-run or a
 * re-extraction never inflates them; a vacancy counts once across its content versions.
 */
const REFRESH_CANDIDATES_SQL = `
  insert into skill_candidate (alias, first_seen, last_seen, vacancy_count)
  select resolved.alias,
         min(extraction.extracted_at),
         max(extraction.extracted_at),
         count(distinct (raw_item.source, raw_item.external_id))
  from extraction_skill_resolved resolved
  join extraction on extraction.id = resolved.extraction_id
  join raw_item on raw_item.id = extraction.raw_item_id
  where resolved.skill_id is null
  group by resolved.alias
  on conflict (alias) do update
  set last_seen = excluded.last_seen, vacancy_count = excluded.vacancy_count`;

const SKILL_ID_BY_SLUG_SQL = 'select id from skill where slug = $1';

const INSERT_SKILL_SQL = `
  insert into skill (slug, name, category) values ($1, $2, $3) on conflict (slug) do nothing`;

const INSERT_DECISION_SQL = `
  insert into skill_decision (alias, decision, skill_id, decided_by, confidence, reason)
  values ($1, $2, $3, $4, $5, $6)`;

const INSERT_ALIAS_SQL = `
  insert into skill_alias (alias, skill_id, source) values ($1, $2, $3)
  on conflict (alias) do nothing`;

// The candidate shows the decision in force, so a late LLM decision can't hide a human one.
const SYNC_CANDIDATE_STATUS_SQL = `
  update skill_candidate set status = effective.decision
  from skill_decision_effective effective
  where effective.alias = skill_candidate.alias and skill_candidate.alias = $1`;

const ALIAS_SOURCE = { llm: 'llm_triage', human: 'human' } as const;

// ---- functions ---------------------------------------------------------------------------------

/**
 * Resolves every extracted skill name: an exact alias match maps it to a skill, any other name
 * is queued (or refreshed) in skill_candidate for triage. Idempotent. Returns how many distinct
 * unknown names there are.
 */
export async function resolveSkills(db: pg.Client): Promise<number> {
  const { rowCount } = await db.query(REFRESH_CANDIDATES_SQL);
  return rowCount ?? 0;
}

/**
 * The seam for triage: appends a decision and, when it maps the alias to a skill, adds the alias.
 * Nothing is overwritten; the views pick the decision in force (a human one beats the LLM).
 */
export async function recordDecision(db: pg.Client, triage: TriageDecision): Promise<void> {
  const alias = normalizeSkillName(triage.alias);
  assertMergeAllowed(alias, triage);
  await inTransaction(db, async () => {
    const skillId = await decidedSkillId(db, triage);
    const { decision, decidedBy, confidence, reason } = triage;
    await db.query(INSERT_DECISION_SQL, [alias, decision, skillId, decidedBy, confidence, reason]);
    if (skillId !== null) {
      await db.query(INSERT_ALIAS_SQL, [alias, skillId, ALIAS_SOURCE[decidedBy]]);
    }
    await db.query(SYNC_CANDIDATE_STATUS_SQL, [alias]);
  });
}

/** Only a human may merge look-alike siblings such as java and javascript. */
function assertMergeAllowed(alias: string, triage: TriageDecision): void {
  const isAutomatedMerge = triage.decidedBy === 'llm' && triage.decision === 'mapped';
  if (isAutomatedMerge && !canMerge(alias, triage.skillSlug)) {
    throw new Error(`automated triage must never merge "${alias}" into ${triage.skillSlug}`);
  }
}

/** The skill the decision points to: an existing one, a newly created one, or none. */
async function decidedSkillId(db: pg.Client, triage: TriageDecision): Promise<string | null> {
  switch (triage.decision) {
    case 'mapped': {
      return skillIdBySlug(db, triage.skillSlug);
    }
    case 'new_skill': {
      const { slug, name, category } = triage.skill;
      await db.query(INSERT_SKILL_SQL, [slug, name, category]);
      return skillIdBySlug(db, slug);
    }
    case 'rejected': {
      return null;
    }
  }
}

async function skillIdBySlug(db: pg.Client, slug: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(SKILL_ID_BY_SLUG_SQL, [slug]);
  const skill = rows[0];
  if (!skill) {
    throw new Error(`no skill with slug ${slug}`);
  }
  return skill.id;
}
