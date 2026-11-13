// Integration: the skill taxonomy (migration 004) on real Postgres. The extractor role resolves
// skills and records triage decisions exactly as the pipeline will.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { connectAs, resetDatabase, testDatabaseUrl } from '../../db/testing.ts';
import { normalizeSkillName } from '../normalize.ts';
import { recordDecision, resolveSkills, type TriageDecision } from '../resolve.ts';
import { SEED_SKILLS, seedSkills, spellingsOf } from '../seed.ts';

// ---- types -------------------------------------------------------------------------------------

interface ResolvedName {
  raw_name: string;
  skill_slug: string | null;
}

interface Candidate {
  alias: string;
  vacancy_count: number;
  status: string;
}

// ---- constants ---------------------------------------------------------------------------------

const ADMIN_URL = testDatabaseUrl();

const UNKNOWN_SKILL = 'Synthetic Tool X';
const UNKNOWN_ALIAS = 'synthetic tool x';

const LLM_MAPS_TO_PYTHON: TriageDecision = {
  alias: UNKNOWN_SKILL,
  decision: 'mapped',
  skillSlug: 'python',
  decidedBy: 'llm',
  confidence: 0.9,
  reason: 'synthetic test decision',
};

// ---- shared state (set up in before()) ---------------------------------------------------------

let admin: pg.Client;
let extractor: pg.Client;

// ---- fixtures (synthetic) ----------------------------------------------------------------------

/** Stores a content version of a vacancy with one extraction listing `skillNames`. */
async function seedExtraction(externalId: string, skillNames: string[]): Promise<void> {
  const { rows } = await admin.query<{ id: string }>(
    `with raw as (
       insert into raw_item (source, external_id, content_hash, payload)
       values ('dou', $1, md5(random()::text), '{}') returning id)
     insert into extraction (raw_item_id, extractor_version, model, prompt_hash)
     select id, 'v1', 'gemini-test', 'hash' from raw returning id`,
    [externalId],
  );
  await admin.query(
    `insert into extraction_skill (extraction_id, raw_name, required)
     select $1, unnest($2::text[]), true`,
    [rows[0]!.id, skillNames],
  );
}

async function resolvedNames(): Promise<Map<string, string | null>> {
  const { rows } = await admin.query<ResolvedName>(
    'select raw_name, skill_slug from extraction_skill_resolved',
  );
  return new Map(rows.map((row) => [row.raw_name, row.skill_slug]));
}

async function unknownCandidate(): Promise<Candidate | undefined> {
  const { rows } = await admin.query<Candidate>(
    'select alias, vacancy_count, status from skill_candidate where alias = $1',
    [UNKNOWN_ALIAS],
  );
  return rows[0];
}

async function unknownEffectiveDecidedBy(): Promise<string | undefined> {
  const { rows } = await admin.query<{ decided_by: string }>(
    'select decided_by from skill_decision_effective where alias = $1',
    [UNKNOWN_ALIAS],
  );
  return rows[0]?.decided_by;
}

async function count(table: string): Promise<number> {
  const { rows } = await admin.query<{ total: number }>(
    `select count(*)::int as total from ${table}`,
  );
  return rows[0]!.total;
}

before(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await resetDatabase(admin, ADMIN_URL);
  extractor = await connectAs('extractor', ADMIN_URL);

  await seedExtraction('1', ['JS', ' K8s ', 'React.js', 'Постгрес', UNKNOWN_SKILL]);
  await seedExtraction('1', ['javascript', UNKNOWN_SKILL]); // vacancy 1, edited
  await seedExtraction('2', ['Python', 'synthetic  tool X']);
});

after(async () => {
  await extractor.end();
  await admin.end();
});

// ---- scenarios ---------------------------------------------------------------------------------

test('the seed loads every skill and alias, and a second run changes nothing', async () => {
  const expectedAliases = SEED_SKILLS.flatMap((skill) => spellingsOf(skill)).length;

  const first = await seedSkills(admin);
  const second = await seedSkills(admin);

  assert.deepEqual(first, second);
  assert.equal(await count('skill'), SEED_SKILLS.length);
  assert.equal(await count('skill_alias'), expectedAliases);
});

test('the seed refuses to move an alias that already maps to another skill', async () => {
  await admin.query(`update skill_alias set skill_id = (select id from skill where slug = 'java')
                     where alias = 'js'`);

  await assert.rejects(seedSkills(admin), /already map to another skill: js/);

  await admin.query(`update skill_alias set skill_id = (select id from skill where slug =
                     'javascript') where alias = 'js'`);
});

test('the SQL normalization matches the TypeScript one', async () => {
  const names = [
    '  React.JS ',
    'Spring\t\nBoot',
    'Spring\u{A0}Boot',
    'ＪａｖａＳｃｒｉｐｔ',
    'ПОСТГРЕС',
    'C#',
  ];

  const { rows } = await admin.query<{ key: string }>(
    'select normalize_skill_name(name) as key from unnest($1::text[]) as name',
    [names],
  );

  assert.deepEqual(
    rows.map((row) => row.key),
    names.map((name) => normalizeSkillName(name)),
  );
});

test('extraction_skill_resolved maps known spellings and leaves unknown ones null', async () => {
  const resolved = await resolvedNames();

  assert.equal(resolved.get('JS'), 'javascript');
  assert.equal(resolved.get(' K8s '), 'kubernetes');
  assert.equal(resolved.get('React.js'), 'react');
  assert.equal(resolved.get('Постгрес'), 'postgresql');
  assert.equal(resolved.get(UNKNOWN_SKILL), null);
});

test('the resolver queues unknown names once per vacancy, and a re-run changes nothing', async () => {
  const unknownNames = await resolveSkills(extractor);
  await resolveSkills(extractor);

  assert.equal(unknownNames, 1);
  assert.deepEqual(await unknownCandidate(), {
    alias: UNKNOWN_ALIAS,
    vacancy_count: 2,
    status: 'pending',
  });
});

test('an LLM decision maps the candidate', async () => {
  await recordDecision(extractor, LLM_MAPS_TO_PYTHON);

  assert.equal((await resolvedNames()).get(UNKNOWN_SKILL), 'python');
  assert.equal((await unknownCandidate())?.status, 'mapped');
});

test('a human decision overrides the LLM one, and a later LLM decision does not undo it', async () => {
  await recordDecision(extractor, {
    alias: UNKNOWN_SKILL,
    decision: 'rejected',
    decidedBy: 'human',
    confidence: null,
    reason: 'synthetic: not a skill',
  });
  await recordDecision(extractor, LLM_MAPS_TO_PYTHON);

  assert.equal(await unknownEffectiveDecidedBy(), 'human');
  assert.equal((await resolvedNames()).get(UNKNOWN_SKILL), null);
  assert.equal((await unknownCandidate())?.status, 'rejected');
  assert.equal(await count('skill_decision'), 3, 'every decision stays in the audit log');
});

test('a new_skill decision creates the skill and resolves the name', async () => {
  await seedExtraction('3', ['Synthetic Framework Y']);

  await recordDecision(extractor, {
    alias: 'Synthetic Framework Y',
    decision: 'new_skill',
    skill: { slug: 'synthetic-framework-y', name: 'Synthetic Framework Y', category: 'framework' },
    decidedBy: 'llm',
    confidence: 0.8,
    reason: 'synthetic test decision',
  });

  assert.equal((await resolvedNames()).get('Synthetic Framework Y'), 'synthetic-framework-y');
});

test('automated triage never merges look-alike siblings', async () => {
  const decisionsBefore = await count('skill_decision');

  await assert.rejects(
    recordDecision(extractor, { ...LLM_MAPS_TO_PYTHON, alias: 'NoSQL', skillSlug: 'sql' }),
    /never merge "nosql" into sql/,
  );

  assert.equal(await count('skill_decision'), decisionsBefore);
});

test('extractor cannot delete or rewrite taxonomy rows', async () => {
  const forbidden = [
    `update skill_decision set decided_by = 'human'`,
    'delete from skill_decision',
    'truncate skill_decision',
    `update skill_alias set source = 'human'`,
    'delete from skill_alias',
    `update skill set name = 'x'`,
    'delete from skill',
    `update skill_candidate set alias = 'x'`,
    'update skill_candidate set first_seen = now()',
    'delete from skill_candidate',
  ];
  for (const sql of forbidden) {
    await assert.rejects(extractor.query(sql), /permission denied/, sql);
  }
});
