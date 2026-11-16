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
  lastRun: { at: '2026-11-14T18:15:00Z', processed: 150, status: 'quota_exhausted' },
  backlog: 1247,
};

test('fresh data shows no banner at all', () => {
  renderWithLanguage(<FreshnessBanner freshness={{ ...STALE, isStale: false, reason: null }} />);

  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('stale data says why, how many wait, and how the last run ended', () => {
  renderWithLanguage(<FreshnessBanner freshness={STALE} />);

  const banner = screen.getByRole('status');
  expect(banner).toHaveTextContent('Вичерпано денний ліміт AI-моделі.');
  expect(banner).toHaveTextContent('У черзі на аналіз: 1 247.');
  expect(banner).toHaveTextContent('останній запуск: 14 лист., 20:15, оброблено 150, далі ліміт');
});

test('without run details the banner falls back to the last good run', () => {
  renderWithLanguage(<FreshnessBanner freshness={{ ...STALE, lastRun: null }} />);

  expect(screen.getByRole('status')).toHaveTextContent('останній успішний запуск: 13 лист., 23:42');
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
  expect(screen.getByRole('status')).toHaveTextContent('150 processed, then the daily limit');
});

test('before the first run there is no last-run date to show', () => {
  renderWithLanguage(
    <FreshnessBanner
      freshness={{ isStale: true, reason: 'never', lastOkAt: null, lastRun: null, backlog: 0 }}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent('Аналіз вакансій ще не запускався.');
  expect(screen.getByRole('status')).not.toHaveTextContent('останній');
});
