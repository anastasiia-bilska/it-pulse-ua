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

// "Ask the market" is still a non-clickable teaser on main; PR #26 turns it into a dialog.
test.skip('"Ask the market" opens its dialog', () => {
  // Write once the popup lands (PR #26).
});
