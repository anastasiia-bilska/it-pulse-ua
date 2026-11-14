import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Aggregates, SalaryRow, Share } from '../types.ts';
import {
  barRows,
  insights,
  kpis,
  profileSegments,
  salaryGeometry,
  salaryScale,
  seniorityRows,
} from '../view-model.ts';

/** Shares in these scenarios are out of 100 vacancies. */
function share(value: string, n: number): Share {
  return { value, n, share: n / 100 };
}

function salary(group: string, n: number, quartiles?: [number, number, number]): SalaryRow {
  const [p25, median, p75] = quartiles ?? [null, null, null];
  return { group, n, p25, median, p75 };
}

function aggregates(overrides: Partial<Aggregates> = {}): Aggregates {
  return {
    generatedAt: '2026-11-14T00:00:00Z',
    windowDays: 30,
    minN: 10,
    freshness: { isStale: false, reason: null, lastOkAt: null, backlog: 0 },
    totals: { vacancies: 400, extracted: 100 },
    distributions: {
      source: [],
      role: [],
      seniority: [share('not_stated', 48), share('middle', 52)],
      work_format: [share('remote', 43), share('office', 57)],
      english: [],
      company_type: [],
      domain: [share('not_stated', 30), share('other', 25), share('defense', 20)],
    },
    topSkills: [{ value: 'Python', n: 34 }],
    salaryUsdMonthByRole: [],
    salaryUsdMonthBySeniority: [salary('middle', 12), salary('junior', 3)],
    digest: null,
    ...overrides,
  };
}

// ---- bars --------------------------------------------------------------------------------------

test('the largest stated value leads, and "not stated" stays visible but hatched', () => {
  const rows = barRows([share('not_stated', 30), share('other', 25), share('defense', 20)]);

  assert.deepEqual(
    rows.map((row) => row.tone),
    ['missing', 'neutral', 'leader'],
  );
  assert.equal(rows[0]?.fraction, 1);
});

test('bars are scaled to the largest row that is shown', () => {
  const rows = barRows([share('qa', 40), share('hr', 10), share('sales', 5)], 2);

  assert.deepEqual(
    rows.map((row) => row.fraction),
    [1, 0.25],
  );
});

// ---- profile -----------------------------------------------------------------------------------

test('a profile stack keeps its natural order, then unknown values, then "not stated"', () => {
  const shares = [
    share('not_stated', 40),
    share('senior', 20),
    share('principal', 5),
    share('junior', 35),
  ];

  const segments = profileSegments('seniority', shares);

  assert.deepEqual(
    segments.map((segment) => segment.value),
    ['junior', 'senior', 'principal', 'not_stated'],
  );
  assert.equal(segments.at(-1)?.isMissing, true);
});

// ---- kpis and insights -------------------------------------------------------------------------

test('KPIs count the remote share and every USD salary', () => {
  const numbers = kpis(aggregates());

  assert.equal(numbers.remote?.n, 43);
  assert.equal(numbers.usdSalaries, 15);
});

test('insights skip "not stated" and "other" when naming the top domain', () => {
  const found = insights(aggregates());

  assert.deepEqual(found[0], { kind: 'domain', value: 'defense', n: 20, share: 0.2 });
});

test('the top skill is a share of analysed vacancies', () => {
  const skill = insights(aggregates()).find((insight) => insight.kind === 'skill');

  assert.equal(skill?.share, 0.34);
});

test('no analysed data gives no insights rather than made-up ones', () => {
  const empty = aggregates({
    topSkills: [],
    distributions: { ...aggregates().distributions, domain: [], seniority: [] },
  });

  assert.deepEqual(insights(empty), []);
});

// ---- salary ------------------------------------------------------------------------------------

test('every level gets a salary row, with n = 0 when it has no USD salaries', () => {
  const rows = seniorityRows([salary('middle', 12), salary('trainee', 1)]);

  assert.deepEqual(
    rows.map((row) => `${row.group}:${row.n}`),
    ['intern:0', 'junior:0', 'middle:12', 'senior:0', 'lead:0', 'not_stated:0', 'trainee:1'],
  );
});

test('the salary axis rounds the largest p75 up to a whole step', () => {
  assert.equal(salaryScale([salary('middle', 12, [1800, 2500, 3200])]), 4500);
  assert.equal(salaryScale([salary('junior', 3)]), 1500);
});

test('a thin group has no box to draw', () => {
  assert.equal(salaryGeometry(salary('lead', 7), 3000), null);
});

test('the quartile box and median sit on the scale', () => {
  const geometry = salaryGeometry(salary('middle', 12, [750, 1500, 2250]), 3000);

  assert.deepEqual(geometry, { boxStart: 0.25, boxWidth: 0.5, median: 0.5 });
});
