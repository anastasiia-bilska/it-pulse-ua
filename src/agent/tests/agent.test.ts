// Unit: the pure rules of «Запитай ринок»: plan parsing, the answer guard and the planner score.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeAnswer, MAX_ANSWER_CHARS } from '../answer.ts';
import { isValidQuestion } from '../ask-market.ts';
import { parsePlan } from '../plan.ts';
import { scorePlans } from '../planner-cases.ts';
import type { Facts } from '../tools.ts';

// ---- constants ---------------------------------------------------------------------------------

const ANY = { role: null, seniority: null, skill: null, dimension: null };
const SALARY_FACTS: Facts = {
  filters: { role: 'backend', seniority: 'senior' },
  windowDays: 30,
  tool: 'salary',
  currency: 'USD',
  period: 'month',
  n: 120,
  p25: 4000,
  median: 5000,
  p75: 6200,
};

// ---- scenarios ---------------------------------------------------------------------------------

test('a plan names its tool and filters', () => {
  const answer = JSON.stringify({ ...ANY, language: 'en', tool: 'salary', role: 'qa' });

  const plan = parsePlan(answer);

  assert.deepEqual(plan, {
    language: 'en',
    tool: 'salary',
    filters: { role: 'qa', seniority: null },
  });
});

test('a plan missing what its tool needs is unsupported, not guessed', () => {
  const noSkill = JSON.stringify({ ...ANY, language: 'uk', tool: 'skill_demand', skill: '  ' });
  const noDimension = JSON.stringify({ ...ANY, language: 'uk', tool: 'distribution' });

  assert.deepEqual(parsePlan(noSkill), { language: 'uk', tool: 'unsupported' });
  assert.deepEqual(parsePlan(noDimension), { language: 'uk', tool: 'unsupported' });
});

test('a plan outside the enums is unsupported', () => {
  const answer = JSON.stringify({ ...ANY, language: 'uk', tool: 'salary', role: 'astronaut' });

  assert.deepEqual(parsePlan(answer), { language: 'uk', tool: 'unsupported' });
});

test("an answer with only the facts' numbers is accepted", () => {
  const answer = JSON.stringify({
    answer: 'Median 5,000 USD a month, the middle half 4 000–6200, n = 120.',
  });

  assert.deepEqual(judgeAnswer(answer, SALARY_FACTS), {
    kind: 'accepted',
    text: 'Median 5,000 USD a month, the middle half 4 000–6200, n = 120.',
  });
});

test('an answer with a number of its own is rejected and says which', () => {
  const answer = JSON.stringify({ answer: 'Median 5000, about 10% above middle.' });

  assert.deepEqual(judgeAnswer(answer, SALARY_FACTS), {
    kind: 'rejected',
    reason: 'numbers not in the facts: 10',
  });
});

test('an answer over the length limit is rejected', () => {
  const answer = JSON.stringify({ answer: 'a'.repeat(MAX_ANSWER_CHARS + 1) });

  assert.equal(judgeAnswer(answer, SALARY_FACTS).kind, 'rejected');
});

test('a question must be 3 to 300 characters', () => {
  assert.equal(isValidQuestion('  hi '), false);
  assert.equal(isValidQuestion('Скільки платять QA?'), true);
  assert.equal(isValidQuestion('?'.repeat(301)), false);
});

test('the planner score is exact, but skills ignore case', () => {
  const filters = { role: null, seniority: null };
  const results = [
    {
      question: 'a',
      expected: { language: 'en' as const, tool: 'skill_demand' as const, filters, skill: 'Go' },
      actual: { language: 'en' as const, tool: 'skill_demand' as const, filters, skill: 'go' },
    },
    {
      question: 'b',
      expected: { language: 'en' as const, tool: 'salary' as const, filters },
      actual: {
        language: 'en' as const,
        tool: 'salary' as const,
        filters: { role: 'qa' as const, seniority: null },
      },
    },
  ];

  const score = scorePlans(results);

  assert.equal(score.correct, 1);
  assert.equal(score.accuracy, 0.5);
  assert.deepEqual(
    score.misses.map((miss) => miss.question),
    ['b'],
  );
});
