import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Aggregates } from '../aggregates.ts';
import { socialCardFacts, socialCardHtml } from '../social-card.ts';

// ---- functions ---------------------------------------------------------------------------------

function aggregatesWith(overrides: Partial<Aggregates>): Aggregates {
  return {
    generatedAt: '2026-11-14T00:00:00.000Z',
    windowDays: 30,
    minN: 10,
    freshness: { isStale: false, reason: null, lastOkAt: null, lastRun: null, backlog: 0 },
    totals: { vacancies: 1259, extracted: 1200 },
    distributions: {
      source: [],
      role: [],
      seniority: [],
      work_format: [
        { value: 'office', n: 600, share: 0.5 },
        { value: 'remote', n: 516, share: 0.43 },
      ],
      english: [],
      company_type: [],
      domain: [],
    },
    topSkills: [
      { value: 'Python', n: 300 },
      { value: 'SQL', n: 200 },
    ],
    salaryUsdMonthByRole: [],
    salaryUsdMonthBySeniority: [],
    digest: null,
    ...overrides,
  };
}

// ---- tests -------------------------------------------------------------------------------------

test('each card shows vacancies, the remote share and the top skill in its language', () => {
  const facts = socialCardFacts(aggregatesWith({}));

  const english = socialCardHtml(facts, 'en', '');
  const ukrainian = socialCardHtml(facts, 'uk', '');

  assert.match(english, /<html lang="en">/);
  assert.match(english, />1,259<.*vacancies in 30 days/);
  assert.match(english, />43%<.*remote/);
  // uk-UA groups thousands with a no-break space.
  assert.match(ukrainian, />1\u{A0}259<.*вакансій за 30 днів/u);
  assert.match(ukrainian, /Пульс IT-ринку України/);
  assert.match(ukrainian, />Python<.*навичка №1/);
});

test('a market with no remote vacancies reads 0%, not a missing number', () => {
  const aggregates = aggregatesWith({});
  aggregates.distributions.work_format = [{ value: 'office', n: 10, share: 1 }];

  const facts = socialCardFacts(aggregates);

  assert.equal(facts?.remoteShare, 0);
});

test('before the first extraction the card goes out without numbers', () => {
  const aggregates = aggregatesWith({ totals: { vacancies: 5, extracted: 0 }, topSkills: [] });

  const html = socialCardHtml(socialCardFacts(aggregates), 'en', '');

  assert.doesNotMatch(html, /class="stats"/);
  assert.match(html, /The pulse of Ukraine’s IT job market/);
});

test('a skill name is escaped into the HTML', () => {
  const facts = { vacancies: 1, windowDays: 30, remoteShare: 0.01, topSkill: 'C<b>&' };

  const html = socialCardHtml(facts, 'en', '');

  assert.match(html, /C&lt;b&gt;&amp;/);
});
