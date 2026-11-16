import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replyBars } from '../reply-bars.ts';

// ---- scenarios ---------------------------------------------------------------------------------

test('a distribution shows shares, and "not stated" is hatched, never the leader', () => {
  const chart = {
    dimension: 'work_format' as const,
    bars: [
      { value: 'not_stated', n: 80, percent: 40 },
      { value: 'remote', n: 60, percent: 30 },
      { value: 'office', n: 40, percent: 20 },
    ],
  };

  const bars = replyBars(chart, 'en');

  assert.deepEqual(
    bars.map((bar) => [bar.label, bar.value, bar.fill, bar.fraction]),
    [
      ['Not stated', '40%', 'missing', 1],
      ['Remote', '30%', 'leader', 0.75],
      ['Office', '20%', 'neutral', 0.5],
    ],
  );
});

test('top skills show counts and keep their names', () => {
  const chart = { dimension: null, bars: [{ value: 'Python', n: 313, percent: 17 }] };

  const [bar] = replyBars(chart, 'uk');

  assert.deepEqual(
    [bar?.label, bar?.value, bar?.fill, bar?.fraction],
    ['Python', '313', 'leader', 1],
  );
});
