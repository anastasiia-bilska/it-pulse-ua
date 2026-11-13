import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canMerge, NEVER_MERGE } from '../guard.ts';
import { normalizeSkillName } from '../normalize.ts';
import { SEED_SKILLS, spellingsOf } from '../seed.ts';

// ---- scenarios ---------------------------------------------------------------------------------

test('look-alike siblings never merge, in either direction', () => {
  const forbidden: [string, string][] = [
    ['JavaScript', 'java'],
    ['Java', 'javascript'],
    ['C', 'cpp'],
    ['C#', 'cpp'],
    ['C++', 'c'],
    ['Google', 'go'],
    ['Go', 'gcp'],
    ['React Native', 'react'],
    ['React', 'react-native'],
    ['NoSQL', 'sql'],
    ['SQL', 'nosql'],
    ['.NET Framework', 'dotnet'],
    ['AngularJS', 'angular'],
    ['Angular', 'angularjs'],
    ['Spring Boot', 'spring'],
  ];
  for (const [alias, skillSlug] of forbidden) {
    assert.equal(canMerge(alias, skillSlug), false, `${alias} → ${skillSlug}`);
  }
});

test('spellings of the same skill and unrelated names may merge', () => {
  const allowed: [string, string][] = [
    ['JS', 'javascript'],
    ['  ReactJS ', 'react'],
    ['k8s', 'kubernetes'],
    ['c#', 'csharp'],
    ['golang', 'go'],
    ['Postgres 16', 'postgresql'],
    ['Synthetic Tool', 'a-skill-created-by-triage'],
  ];
  for (const [alias, skillSlug] of allowed) {
    assert.equal(canMerge(alias, skillSlug), true, `${alias} → ${skillSlug}`);
  }
});

test('guard spellings are already normalized, or they would never match', () => {
  for (const spelling of NEVER_MERGE.flat()) {
    assert.equal(normalizeSkillName(spelling), spelling);
  }
});

test('the seed never puts two guarded siblings under one skill', () => {
  const ownerOf = new Map(
    SEED_SKILLS.flatMap((skill) => spellingsOf(skill).map((spelling) => [spelling, skill.slug])),
  );
  for (const siblings of NEVER_MERGE) {
    const owners = siblings.flatMap((sibling) => ownerOf.get(sibling) ?? []);
    assert.equal(new Set(owners).size, owners.length, siblings.join(' / '));
  }
});
