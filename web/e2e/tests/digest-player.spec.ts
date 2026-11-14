// The digest audio must really play in a real engine. jsdom has no media, so a server that sent
// the mp3 as application/octet-stream (which iOS Safari refuses) passed every unit test.
import { expect, test } from '@playwright/test';

// ---- tests -------------------------------------------------------------------------------------

test('the digest audio is served as audio/mpeg', async ({ request }) => {
  const response = await request.get('digest/digest-en.mp3');

  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toBe('audio/mpeg');
});

test('play starts the audio and turns the button into pause', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'EN', exact: true }).click();

  await page.getByRole('button', { name: 'Play' }).click();

  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  const audio = page.locator('audio');
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused))
    .toBe(false);
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(0);
});
