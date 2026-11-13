import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSkillName } from '../normalize.ts';

// ---- scenarios ---------------------------------------------------------------------------------

test('spellings that differ only in case, spacing or width share one key', () => {
  const spellings = ['React.js', '  react.js ', 'REACT.JS', 'ｒｅａｃｔ．ｊｓ'];

  const keys = new Set(spellings.map((spelling) => normalizeSkillName(spelling)));

  assert.deepEqual([...keys], ['react.js']);
});

test('inner whitespace of any kind collapses to one space', () => {
  assert.equal(normalizeSkillName('Spring\t\n Boot'), 'spring boot');
  assert.equal(normalizeSkillName('Spring\u{A0}Boot'), 'spring boot');
});

test('Cyrillic is lower-cased too', () => {
  assert.equal(normalizeSkillName('ПОСТГРЕС'), 'постгрес');
});

test('punctuation stays: c, c++ and c# are different skills', () => {
  const keys = ['C', 'C++', 'C#'].map((name) => normalizeSkillName(name));

  assert.deepEqual(keys, ['c', 'c++', 'c#']);
});
