import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchUsdRates, toUsdRates } from '../usd-rates.ts';

// ---- constants ---------------------------------------------------------------------------------

/** The shape of the NBU answer, with round synthetic rates. */
const NBU_ANSWER = [
  { r030: 840, txt: 'Долар США', rate: 40, cc: 'USD', exchangedate: '16.11.2026' },
  { r030: 978, txt: 'Євро', rate: 50, cc: 'EUR', exchangedate: '16.11.2026' },
];

// ---- functions ---------------------------------------------------------------------------------

function failingFetch(): Promise<Response> {
  return Promise.resolve(new Response('', { status: 503 }));
}

// ---- scenarios ---------------------------------------------------------------------------------

test('NBU hryvnia rates become USD per euro and per hryvnia', () => {
  assert.deepEqual(toUsdRates(NBU_ANSWER), { date: '16.11.2026', eur: 1.25, uah: 0.025 });
});

test('a rate table without EUR converts nothing', () => {
  assert.throws(() => toUsdRates(NBU_ANSWER.slice(0, 1)), /USD or EUR/);
});

test('an unreachable NBU falls back to USD only instead of failing the build', async () => {
  assert.equal(await fetchUsdRates(failingFetch), null);
});
