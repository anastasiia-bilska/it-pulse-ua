import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDateTime, formatShare, formatUsd, fractionOf, toPercent } from '../format.ts';

test('shares use the decimal comma in Ukrainian and the point in English', () => {
  const share = 0.429;

  assert.equal(formatShare(share, 'uk'), '42,9%');
  assert.equal(formatShare(share, 'en'), '42.9%');
});

test('dollars keep the sign in front with the local digit grouping', () => {
  assert.equal(formatUsd(1475, 'uk'), '$1\u{A0}475');
  assert.equal(formatUsd(1475, 'en'), '$1,475');
});

test('dates are shown in Kyiv time', () => {
  const lateEveningInKyiv = '2026-11-13T21:42:00Z';

  assert.equal(formatDateTime(lateEveningInKyiv, 'en'), '13 Nov, 23:42');
});

test('an empty whole gives a zero fraction instead of NaN', () => {
  assert.equal(fractionOf(5, 0), 0);
  assert.equal(fractionOf(1, 4), 0.25);
});

test('bar widths stay inside their track', () => {
  assert.equal(toPercent(1.4), '100%');
  assert.equal(toPercent(-0.2), '0%');
  assert.equal(toPercent(0.25), '25%');
});
