import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import type { Freshness } from '../../../entities/aggregates/index.ts';
import { LanguageSwitch } from '../../../features/switch-language/index.ts';
import { renderWithLanguage } from '../../../shared/testing/index.ts';
import { FreshnessBanner } from '../index.ts';

const STALE: Freshness = {
  isStale: true,
  reason: 'quota',
  lastOkAt: '2026-11-13T21:42:00Z',
  backlog: 1247,
};

test('fresh data shows no banner at all', () => {
  renderWithLanguage(<FreshnessBanner freshness={{ ...STALE, isStale: false, reason: null }} />);

  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('stale data says why, how many wait, and when the last good run was', () => {
  renderWithLanguage(<FreshnessBanner freshness={STALE} />);

  const banner = screen.getByRole('status');
  expect(banner).toHaveTextContent('Вичерпано денний ліміт AI-моделі.');
  expect(banner).toHaveTextContent('У черзі на аналіз: 1 247.');
  expect(banner).toHaveTextContent('13 лист., 23:42');
});

test('the reason code is translated when the page switches to English', async () => {
  const { user } = renderWithLanguage(
    <>
      <LanguageSwitch />
      <FreshnessBanner freshness={STALE} />
    </>,
  );

  await user.click(screen.getByRole('button', { name: 'EN' }));

  expect(screen.getByRole('status')).toHaveTextContent('The AI model’s daily limit is used up.');
  expect(screen.getByRole('status')).toHaveTextContent('Queued for analysis: 1,247.');
});

test('before the first run there is no last-run date to show', () => {
  renderWithLanguage(
    <FreshnessBanner freshness={{ isStale: true, reason: 'never', lastOkAt: null, backlog: 0 }} />,
  );

  expect(screen.getByRole('status')).toHaveTextContent('Аналіз вакансій ще не запускався.');
  expect(screen.getByRole('status')).not.toHaveTextContent('останній успішний запуск');
});
