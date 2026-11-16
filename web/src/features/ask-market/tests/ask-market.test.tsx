import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { LanguageProvider } from '../../../shared/i18n/index.ts';
import { renderWithLanguage } from '../../../shared/testing/index.ts';
import { AskMarket } from '../index.ts';

// ---- functions ---------------------------------------------------------------------------------

/** The endpoint answers with this {kind, text} and HTTP status. */
function stubEndpoint(kind: string, text: string, status = 200): ReturnType<typeof vi.fn> {
  const endpoint = vi.fn(() => Promise.resolve(Response.json({ kind, text }, { status })));
  vi.stubGlobal('fetch', endpoint);
  return endpoint;
}

async function openDialog(): Promise<ReturnType<typeof renderWithLanguage>['user']> {
  const { user } = renderWithLanguage(<AskMarket look="block" />);
  await user.click(screen.getByRole('button', { name: /Запитай ринок/ }));
  return user;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---- scenarios ---------------------------------------------------------------------------------

test('a typed question is sent with the page language and the answer is shown', async () => {
  const endpoint = stubEndpoint('answered', 'Медіана 3000 USD на місяць за 40 вакансіями.');
  const user = await openDialog();

  await user.type(screen.getByLabelText('Твоє питання'), 'Скільки платять senior QA?');
  await user.click(screen.getByRole('button', { name: 'Запитати' }));

  expect(await screen.findByText('Медіана 3000 USD на місяць за 40 вакансіями.')).toBeVisible();
  expect(endpoint).toHaveBeenCalledWith('/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'Скільки платять senior QA?', language: 'uk' }),
  });
});

test('an example question is asked in one click and fills the field', async () => {
  const endpoint = stubEndpoint('answered', 'Відповідь.');
  const user = await openDialog();

  await user.click(screen.getByRole('button', { name: 'Які навички найпотрібніші?' }));

  expect(await screen.findByText('Відповідь.')).toBeVisible();
  expect(screen.getByLabelText('Твоє питання')).toHaveValue('Які навички найпотрібніші?');
  expect(endpoint).toHaveBeenCalledOnce();
});

test('a refusal from the server (the daily limit) is shown in its own words', async () => {
  stubEndpoint('limit', 'На сьогодні ліміт питань до агента вичерпано. Спробуй завтра.', 429);
  const user = await openDialog();

  await user.click(screen.getByRole('button', { name: 'Які навички найпотрібніші?' }));

  expect(await screen.findByText(/ліміт питань до агента вичерпано/)).toBeVisible();
});

test('no connection at all gets the page’s own message', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
  );
  const user = await openDialog();

  await user.click(screen.getByRole('button', { name: 'Які навички найпотрібніші?' }));

  expect(await screen.findByText(/Не вдалося з’єднатися з агентом/)).toBeVisible();
});

test('the popup closes with its close button', async () => {
  const user = await openDialog();
  const dialog = screen.getByRole('dialog', { name: 'Запитай ринок' });

  await user.click(screen.getByRole('button', { name: 'Закрити' }));

  expect(dialog).not.toHaveAttribute('open');
});

test('the page starts in English', async () => {
  const user = userEvent.setup();
  render(
    <LanguageProvider>
      <AskMarket look="pill" />
    </LanguageProvider>,
  );

  await user.click(screen.getByRole('button', { name: /Ask the market/ }));

  expect(screen.getByRole('dialog', { name: 'Ask the market' })).toHaveAttribute('open');
  expect(screen.getByLabelText('Your question')).toBeVisible();
});
