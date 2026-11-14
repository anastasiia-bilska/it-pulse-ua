import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseIsoWeek, previousIsoWeek } from '../iso-week.ts';
import { allowedNumbers, findUnknownNumbers } from '../number-guard.ts';
import { judgeScripts, MAX_SCRIPT_CHARS } from '../script.ts';
import { toFacts, type WeekRows, type WeeklyFacts } from '../weekly-facts.ts';

// ---- constants ---------------------------------------------------------------------------------

const WEEK = parseIsoWeek('2026-W46');

const ROWS: WeekRows = {
  totals: { this_week: 412, previous_week: 380, analysed: 350 },
  roles: [
    { value: 'backend', this_week: 90, previous_week: 100 },
    { value: 'qa', this_week: 40, previous_week: 5 },
    { value: 'design', this_week: 9, previous_week: 30 },
  ],
  skills: [{ value: 'Python', this_week: 1500, previous_week: 1400 }],
  salaries: [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10_000],
};

const FACTS: WeeklyFacts = toFacts(WEEK, ROWS);

// ---- ISO weeks ---------------------------------------------------------------------------------

test('an ISO week runs Monday to Sunday', () => {
  assert.equal(WEEK.start.toISOString(), '2026-11-09T00:00:00.000Z');
  assert.equal(WEEK.lastDay, '2026-11-15');
});

test('a Monday run reports on the week that just ended, across a year boundary too', () => {
  assert.equal(previousIsoWeek(new Date('2026-11-16T08:05:00Z')).label, '2026-W46');
  assert.equal(previousIsoWeek(new Date('2027-01-04T08:05:00Z')).label, '2026-W53');
});

test('a malformed week from a manual run is refused', () => {
  assert.throws(() => parseIsoWeek('2026-46'), /2026-W46/);
  assert.throws(() => parseIsoWeek('2026-W54'), /2026-W46/);
});

// ---- facts -------------------------------------------------------------------------------------

test('changes are whole percents, and small samples are never passed on', () => {
  assert.deepEqual(FACTS.newVacancies, { thisWeek: 412, previousWeek: 380, changePercent: 8 });
  assert.deepEqual(
    FACTS.topRoles.map((role) => [role.name, role.changePercent]),
    [
      ['backend', -10],
      ['qa', null],
    ],
  );
  assert.deepEqual(FACTS.medianSalaryUsdMonth, { value: 5500, n: 10 });
});

test('a week mostly not analysed yet is preliminary', () => {
  assert.equal(FACTS.analysedPercent, 85);
  assert.equal(FACTS.isPreliminary, true);
});

// ---- number guard ------------------------------------------------------------------------------

test('numbers from the facts pass in any locale format', () => {
  const script =
    'З 9 по 15 листопада 2026: 412 вакансій, на 8% більше. Python: 1 500. Backend −10%.';

  assert.deepEqual(findUnknownNumbers(script, FACTS), []);
  assert.deepEqual(findUnknownNumbers('Python appeared in 1,500 jobs.', FACTS), []);
  assert.deepEqual(findUnknownNumbers('Python: 1\u{A0}500.', FACTS), []);
});

test('a made-up number is caught', () => {
  assert.deepEqual(findUnknownNumbers('Вакансій стало на 12% більше, медіана 5 600.', FACTS), [
    '12',
    '5 600',
  ]);
});

test('the dates of the week are allowed, other dates are not', () => {
  assert.ok(allowedNumbers(FACTS).has('2026'));
  assert.deepEqual(findUnknownNumbers('Наступний випуск 23 листопада.', FACTS), ['23']);
});

// ---- scripts -----------------------------------------------------------------------------------

test('clean scripts in both languages are accepted', () => {
  const answer = JSON.stringify({ uk: 'Вакансій 412.', en: 'There were 412 vacancies.' });

  assert.equal(judgeScripts(answer, FACTS).kind, 'accepted');
});

test('one bad language rejects the whole episode and says why', () => {
  const answer = JSON.stringify({ uk: 'Вакансій 412.', en: 'x'.repeat(MAX_SCRIPT_CHARS + 1) });

  const result = judgeScripts(answer, FACTS);

  assert.deepEqual(result, { kind: 'rejected', reason: 'en: 1101 chars over 1100' });
});
