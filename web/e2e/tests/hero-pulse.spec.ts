// The hero pulse line must move in a real engine. jsdom runs no animations, so a version that
// stood still in Chrome (an SMIL gradient inside an SVG <mask>) passed every unit test.
import { expect, test, type Locator } from '@playwright/test';

// ---- constants ---------------------------------------------------------------------------------

const PULSE_LINE = 'svg[viewBox="0 0 1200 80"]';
/**
 * Under one 2.8 s sweep: a moving mask is somewhere else by then. A poll, not a fixed wait, because
 * the first frames after load can lag on a busy CI machine.
 */
const SWEEP_TIMEOUT_MS = 2000;

// ---- functions ---------------------------------------------------------------------------------

function runningAnimations(line: Locator): Promise<number> {
  return line.evaluate(
    (element) =>
      element.getAnimations().filter((animation) => animation.playState === 'running').length,
  );
}

function maskPosition(line: Locator): Promise<string> {
  return line.evaluate((element) => getComputedStyle(element).maskPosition);
}

// ---- tests -------------------------------------------------------------------------------------

test.describe('with motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('the pulse line sweeps', async ({ page }) => {
    await page.goto('/');
    const line = page.locator(PULSE_LINE);

    const start = await maskPosition(line);

    expect(await runningAnimations(line)).toBeGreaterThan(0);
    await expect.poll(() => maskPosition(line), { timeout: SWEEP_TIMEOUT_MS }).not.toBe(start);
  });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the pulse line stands still', async ({ page }) => {
    await page.goto('/');

    expect(await runningAnimations(page.locator(PULSE_LINE))).toBe(0);
  });
});
