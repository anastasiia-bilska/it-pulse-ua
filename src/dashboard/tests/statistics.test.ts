import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeFreshness, MIN_N, salaryRow, toShares } from '../index.ts';

// ---- constants ---------------------------------------------------------------------------------

const NOW = new Date('2026-11-14T00:00:00Z');
const HOUR_MS = 60 * 60 * 1000;

// ---- shares ------------------------------------------------------------------------------------

test('every share keeps its n and the shares add up', () => {
  const shares = toShares([
    { value: 'backend', n: 3 },
    { value: 'qa', n: 1 },
  ]);

  assert.deepEqual(shares, [
    { value: 'backend', n: 3, share: 0.75 },
    { value: 'qa', n: 1, share: 0.25 },
  ]);
});

test('no data gives zero shares, not NaN', () => {
  assert.deepEqual(toShares([{ value: 'qa', n: 0 }]), [{ value: 'qa', n: 0, share: 0 }]);
});

// ---- salaries ----------------------------------------------------------------------------------

test('a group below the minimum n states no numbers', () => {
  const row = salaryRow(
    'qa',
    Array.from({ length: MIN_N - 1 }, () => 3000),
  );

  assert.deepEqual(row, { group: 'qa', n: MIN_N - 1, median: null, p25: null, p75: null });
});

test('quartiles of a large enough group', () => {
  const row = salaryRow('backend', [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10_000]);

  assert.deepEqual([row.p25, row.median, row.p75], [3250, 5500, 7750]);
});

// ---- freshness ---------------------------------------------------------------------------------

test('a recent run with a short queue is fresh', () => {
  const freshness = judgeFreshness(
    { lastStatus: 'ok', lastOkAt: new Date(NOW.getTime() - HOUR_MS), backlog: 20 },
    NOW,
  );

  assert.equal(freshness.isStale, false);
  assert.equal(freshness.reason, null);
});

test('a long queue after a quota stop explains the quota', () => {
  const freshness = judgeFreshness(
    { lastStatus: 'quota_exhausted', lastOkAt: new Date(NOW.getTime() - HOUR_MS), backlog: 900 },
    NOW,
  );

  assert.equal(freshness.isStale, true);
  assert.equal(freshness.reason, 'quota');
});

test('no successful run for over 6 hours is stale', () => {
  const freshness = judgeFreshness(
    { lastStatus: 'ok', lastOkAt: new Date(NOW.getTime() - 7 * HOUR_MS), backlog: 0 },
    NOW,
  );

  assert.equal(freshness.isStale, true);
  assert.equal(freshness.reason, 'failing');
});

test('a long queue after a normal run blames the queue', () => {
  const freshness = judgeFreshness(
    { lastStatus: 'ok', lastOkAt: new Date(NOW.getTime() - HOUR_MS), backlog: 900 },
    NOW,
  );

  assert.equal(freshness.reason, 'backlog');
});

test('before the first run the page says so', () => {
  const freshness = judgeFreshness({ lastStatus: null, lastOkAt: null, backlog: 0 }, NOW);

  assert.equal(freshness.isStale, true);
  assert.equal(freshness.reason, 'never');
});
