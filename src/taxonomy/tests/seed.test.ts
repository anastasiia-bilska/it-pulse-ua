import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSkillName } from '../normalize.ts';
import { SEED_SKILLS, spellingsOf } from '../seed.ts';

// ---- constants ---------------------------------------------------------------------------------

const MIN_SEED_SKILLS = 250;
const MAX_SEED_SKILLS = 400;
const SLUG_PATTERN = /^[a-z\d]+(?:-[a-z\d]+)*$/;

// ---- scenarios ---------------------------------------------------------------------------------

test('the seed covers the common skills of the market', () => {
  assert.ok(SEED_SKILLS.length >= MIN_SEED_SKILLS, `${SEED_SKILLS.length} skills`);
  assert.ok(SEED_SKILLS.length <= MAX_SEED_SKILLS, `${SEED_SKILLS.length} skills`);
});

test('slugs are unique and URL-safe', () => {
  const slugs = SEED_SKILLS.map((skill) => skill.slug);

  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of slugs) {
    assert.match(slug, SLUG_PATTERN);
  }
});

test('aliases are written normalized, so the file reads like the database', () => {
  const aliases = SEED_SKILLS.flatMap((skill) => skill.aliases);

  for (const alias of aliases) {
    assert.equal(alias, normalizeSkillName(alias));
  }
});

test('no spelling belongs to two skills', () => {
  const ownerOf = new Map<string, string>();
  for (const skill of SEED_SKILLS) {
    for (const spelling of spellingsOf(skill)) {
      const owner = ownerOf.get(spelling);
      assert.ok(owner === undefined, `"${spelling}" is in ${owner ?? ''} and ${skill.slug}`);
      ownerOf.set(spelling, skill.slug);
    }
  }
});

test('the examples the taxonomy exists for resolve as expected', () => {
  const slugOf = new Map(
    SEED_SKILLS.flatMap((skill) => spellingsOf(skill).map((spelling) => [spelling, skill.slug])),
  );
  const expected: [string, string][] = [
    ['js', 'javascript'],
    ['java script', 'javascript'],
    ['k8s', 'kubernetes'],
    ['postgres', 'postgresql'],
    ['pg', 'postgresql'],
    ['reactjs', 'react'],
    ['react.js', 'react'],
    ['джава', 'java'],
    ['кубернетес', 'kubernetes'],
  ];
  for (const [spelling, slug] of expected) {
    assert.equal(slugOf.get(spelling), slug, spelling);
  }
});
