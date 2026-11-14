// The page as a reader opens it: it loads cleanly, offline, and switches language.
import { expect, test } from '@playwright/test';

// ---- tests -------------------------------------------------------------------------------------

test('loads the hero and the digest player with no errors and no outside requests', async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  const outsideRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('request', (request) => {
    if (!request.url().startsWith(String(baseURL))) {
      outsideRequests.push(request.url());
    }
  });

  await page.goto('/');

  await expect(page.locator('#hero-title')).toBeVisible();
  await expect(page.locator('#digest-title')).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Play|Відтворити)$/ })).toBeEnabled();
  expect(errors).toEqual([]);
  expect(outsideRequests).toEqual([]);
});

test('the language switch changes the hero and the player titles', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'EN', exact: true }).click();

  await expect(page.locator('#hero-title')).toHaveText('The pulse of Ukraine’s IT job market');
  await expect(page.locator('#digest-title')).toHaveText('Weekly voice digest');
  await expect(page.getByText(/^Week of /)).toBeVisible();

  await page.getByRole('button', { name: 'UA', exact: true }).click();

  await expect(page.locator('#hero-title')).toHaveText('Пульс IT-ринку України в цифрах');
  await expect(page.locator('#digest-title')).toHaveText('Голосовий дайджест тижня');
  await expect(page.getByText(/^Тиждень /)).toBeVisible();
});

test('the page opens in English', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#hero-title')).toHaveText('The pulse of Ukraine’s IT job market');
});

// One page per language (ADR 0019): crawlers and shared links get the language in the address.
test('/uk opens in Ukrainian and switching back to English moves to /', async ({ page }) => {
  await page.goto('/uk');

  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await expect(page.locator('#hero-title')).toHaveText('Пульс IT-ринку України в цифрах');
  await expect(page.locator('link[hreflang="en"]')).toHaveAttribute(
    'href',
    'https://it-pulse-ua.pages.dev/',
  );

  await page.getByRole('button', { name: 'EN', exact: true }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle(/Ukraine’s IT job market/);
});

// The header pill on wide screens, the block at the end of the page on phones: one is visible.
test('"Ask the market" opens its dialog, and the dialog closes', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /Ask the market/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Ask the market' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('not enough data');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
});
