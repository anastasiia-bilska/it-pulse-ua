import assert from 'node:assert/strict';
import { test } from 'node:test';
import { median } from '../checks.ts';

test('median of odd, even and empty lists', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7, 1, 2, 3, 4, 5, 6]), 4, 'a week of daily counts');
  assert.equal(median([]), 0);
});
