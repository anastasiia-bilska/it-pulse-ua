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

test('the wave seeks and the speed button changes the playback rate', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  const audio = page.locator('audio');
  const seek = page.getByRole('slider', { name: 'Seek the episode' });
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.duration))
    .toBeGreaterThan(0);

  await seek.focus();
  await page.keyboard.press('End');
  await page.getByRole('button', { name: 'Speed 1×' }).click();

  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Speed 1.25×' })).toBeVisible();
  expect(await audio.evaluate((element: HTMLAudioElement) => element.playbackRate)).toBe(1.25);
});

test('a click on the wave seeks to that spot, not to the nearest whole second', async ({
  page,
}) => {
  await page.goto('/');
  const audio = page.locator('audio');
  const seek = page.getByRole('slider');
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.duration))
    .toBeGreaterThan(0);
  const box = await seek.boundingBox();
  const duration = await audio.evaluate((element: HTMLAudioElement) => element.duration);

  await seek.click({ position: { x: (box?.width ?? 0) * 0.9, y: (box?.height ?? 0) / 2 } });

  const time = await audio.evaluate((element: HTMLAudioElement) => element.currentTime);
  // The thumb's width insets the track a little, so allow a margin. A whole-second step would land on 4.
  expect(time).toBeGreaterThan(duration * 0.8);
  expect(time).toBeLessThan(duration * 0.95);
});
