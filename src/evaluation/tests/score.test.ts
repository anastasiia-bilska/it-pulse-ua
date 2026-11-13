import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreEval, type ExpectedFields, type ScoredCase } from '../index.ts';

// ---- functions ---------------------------------------------------------------------------------

/** A synthetic label: a senior backend role with a stated salary. */
function fields(overrides: Partial<ExpectedFields> = {}): ExpectedFields {
  return {
    role: 'backend',
    seniority: 'senior',
    salary_min: 4000,
    salary_max: 5000,
    salary_currency: 'USD',
    salary_period: 'month',
    work_format: 'remote',
    locations: ['Kyiv', 'Lviv'],
    abroad_allowed: true,
    english: 'upper',
    experience_years_min: 5,
    company_type: 'product',
    domain: 'fintech',
    skills: [
      { name: 'TypeScript', required: true },
      { name: 'PostgreSQL', required: true },
    ],
    ...overrides,
  };
}

function blindCase(actual: ExpectedFields | null, expected = fields()): ScoredCase {
  return { labelling: 'blind', expected, actual };
}

// ---- scenarios ---------------------------------------------------------------------------------

test('an identical answer is right on every field', () => {
  const score = scoreEval([blindCase(fields())]);

  assert.equal(score.all.accuracy, 1);
  assert.equal(score.all.skills.f1, 1);
  assert.equal(score.skipped, 0);
});

test('a scalar mismatch costs exactly that field', () => {
  const score = scoreEval([blindCase(fields({ seniority: 'middle' }))]);

  assert.deepEqual(score.all.fields.seniority, { correct: 0, total: 1 });
  assert.deepEqual(score.all.fields.role, { correct: 1, total: 1 });
  assert.equal(score.all.accuracy, 9 / 10);
});

test('salary amounts within 1% match, a wrong period or a 2% gap does not', () => {
  const score = scoreEval([
    blindCase(fields({ salary_min: 4030, salary_max: 4960 })),
    blindCase(fields({ salary_period: 'year' })),
    blindCase(fields({ salary_min: 4080 })),
    blindCase(fields({ salary_min: null })),
  ]);

  assert.deepEqual(score.all.fields.salary, { correct: 1, total: 4 });
});

test('no salary on both sides is a correct salary', () => {
  const noSalary = fields({
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
  });

  const score = scoreEval([blindCase(noSalary, noSalary)]);

  assert.deepEqual(score.all.fields.salary, { correct: 1, total: 1 });
});

test('locations compare as sets, ignoring case, order and spaces', () => {
  const score = scoreEval([
    blindCase(fields({ locations: [' lviv', 'KYIV'] })),
    blindCase(fields({ locations: ['Kyiv'] })),
  ]);

  assert.deepEqual(score.all.fields.locations, { correct: 1, total: 2 });
});

test('skills score precision, recall and F1 on trimmed, case-insensitive names', () => {
  const answer = fields({
    skills: [
      { name: ' typescript ', required: false },
      { name: 'Docker', required: true },
    ],
  });

  const { skills } = scoreEval([blindCase(answer)]).all;

  assert.equal(skills.truePositives, 1);
  assert.equal(skills.precision, 0.5);
  assert.equal(skills.recall, 0.5);
  assert.equal(skills.f1, 0.5);
});

test('unlabelled items are skipped and counted, failed answers are wrong everywhere', () => {
  const score = scoreEval([
    blindCase(fields()),
    { labelling: 'blind', expected: null, actual: null },
    blindCase(null),
  ]);

  assert.equal(score.skipped, 1);
  assert.equal(score.failed, 1);
  assert.equal(score.all.items, 2);
  assert.equal(score.all.accuracy, 0.5);
  assert.equal(score.all.skills.recall, 0.5);
});

test('blind and prelabelled accuracy are reported apart, with their gap', () => {
  const score = scoreEval([
    blindCase(fields({ role: 'frontend', seniority: 'junior' })),
    { labelling: 'prelabelled', expected: fields(), actual: fields() },
  ]);

  assert.equal(score.blind.accuracy, 0.8);
  assert.equal(score.prelabelled.accuracy, 1);
  assert.ok(Math.abs((score.anchoringGap ?? 0) - 0.2) < 1e-9);
});

test('the anchoring gap is unknown until both groups have items', () => {
  const score = scoreEval([blindCase(fields())]);

  assert.equal(score.anchoringGap, null);
  assert.equal(score.prelabelled.items, 0);
});
