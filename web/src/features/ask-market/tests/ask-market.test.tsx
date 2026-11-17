import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { LanguageProvider } from '../../../shared/i18n/index.ts';
import { renderWithLanguage } from '../../../shared/testing/index.ts';
import { AskMarket } from '../index.ts';

// ---- functions ---------------------------------------------------------------------------------

/** The endpoint answers with this {kind, text, …numbers} and HTTP status. */
function stubEndpoint(
  kind: string,
  text: string,
  { status = 200, ...numbers }: Record<string, unknown> = {},
): ReturnType<typeof vi.fn> {
  const endpoint = vi.fn(() =>
    Promise.resolve(Response.json({ kind, text, ...numbers }, { status: Number(status) })),
  );
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

test('an answer shows its numbers as bars, with n and the window', async () => {
  stubEndpoint('answered', 'Віддалено — 42,9% з 259 вакансій.', {
    n: 259,
    windowDays: 30,
    chart: {
      dimension: 'work_format',
      bars: [
        { value: 'remote', n: 111, percent: 42.9 },
        { value: 'not_stated', n: 76, percent: 29.3 },
      ],
    },
  });
  const user = await openDialog();

  await user.click(
    screen.getByRole('button', { name: 'Яка частка вакансій з віддаленою роботою?' }),
  );

  expect(await screen.findByText('Віддалено')).toBeVisible();
  expect(screen.getByText('42,9%')).toBeVisible();
  expect(screen.getByText('Не вказано')).toBeVisible();
  expect(screen.getByText('n = 259')).toBeVisible();
  expect(screen.getByText('за 30 днів')).toBeVisible();
});

test('a thin sample is told in the agent’s words, with no numbers drawn', async () => {
  stubEndpoint('insufficient', 'Даних замало: вакансій — 4, а потрібно щонайменше 10.', {
    n: 4,
    minN: 10,
  });
  const user = await openDialog();

  await user.click(screen.getByRole('button', { name: 'Яка медіанна зарплата Middle?' }));

  expect(await screen.findByText(/^Даних замало/)).toBeVisible();
  expect(screen.queryByText(/^n = /)).not.toBeInTheDocument();
});

test('while the agent counts, the reply says so', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>(() => {
          // Never settles: the agent is still counting.
        }),
    ),
  );
  const user = await openDialog();

  await user.click(screen.getByRole('button', { name: 'Які навички найпотрібніші?' }));

  expect(screen.getByText('Рахую')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Запитати' })).toBeDisabled();
});

test('a refusal from the server (the daily limit) is shown in its own words', async () => {
  stubEndpoint('limit', 'На сьогодні ліміт питань до агента вичерпано. Спробуй завтра.', {
    status: 429,
  });
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
