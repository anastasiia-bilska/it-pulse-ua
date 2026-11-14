import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDigestEpisode } from '../latest-digest.ts';

// ---- constants ---------------------------------------------------------------------------------

const SCRIPTS = { uk: 'Вакансій 412.', en: '412 vacancies.' };

// ---- scenarios ---------------------------------------------------------------------------------

test('a weekly episode keeps its week and scripts, and drops the rest of the facts', () => {
  const file = JSON.stringify({
    facts: { week: '2026-W46', firstDay: '2026-11-09', lastDay: '2026-11-15', analysedPercent: 85 },
    scripts: SCRIPTS,
  });

  assert.deepEqual(parseDigestEpisode(file), {
    week: { label: '2026-W46', firstDay: '2026-11-09', lastDay: '2026-11-15' },
    scripts: SCRIPTS,
  });
});

test('the trailer has no week', () => {
  assert.deepEqual(parseDigestEpisode(JSON.stringify({ facts: null, scripts: SCRIPTS })), {
    week: null,
    scripts: SCRIPTS,
  });
});

test('a file of another shape gives no episode instead of breaking the dashboard', () => {
  assert.equal(parseDigestEpisode(JSON.stringify({ scripts: { uk: '' } })), null);
});
