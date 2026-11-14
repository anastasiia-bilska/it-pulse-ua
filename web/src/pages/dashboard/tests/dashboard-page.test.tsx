import { screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { SAMPLE_AGGREGATES } from '../../../entities/aggregates/testing.ts';
import { renderWithLanguage } from '../../../shared/testing/index.ts';
import { DashboardPage } from '../index.ts';

const { loadAggregates } = vi.hoisted(() => ({ loadAggregates: vi.fn() }));

vi.mock(import('../../../entities/aggregates/index.ts'), async (importOriginal) => ({
  ...(await importOriginal()),
  loadAggregates,
}));

beforeEach(() => {
  loadAggregates.mockReset();
  vi.spyOn(console, 'error').mockImplementation(vi.fn());
});

test('the page shows the numbers once aggregates arrive', async () => {
  loadAggregates.mockResolvedValue(SAMPLE_AGGREGATES);

  renderWithLanguage(<DashboardPage />);

  expect(await screen.findByText('Вакансій за 30 днів')).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  expect(screen.getByRole('status')).toHaveTextContent('Дані трохи відстають.');
});

test('a failed load offers a retry that loads again', async () => {
  loadAggregates.mockRejectedValueOnce(new Error('HTTP 503')).mockResolvedValue(SAMPLE_AGGREGATES);
  const { user } = renderWithLanguage(<DashboardPage />);

  await user.click(await screen.findByRole('button', { name: 'Спробувати ще раз' }));

  expect(await screen.findByText('Вакансій за 30 днів')).toBeInTheDocument();
  expect(loadAggregates).toHaveBeenCalledTimes(2);
});

test('with nothing analysed yet the page says so instead of drawing empty charts', async () => {
  loadAggregates.mockResolvedValue({
    ...SAMPLE_AGGREGATES,
    totals: { vacancies: 120, extracted: 0 },
  });

  renderWithLanguage(<DashboardPage />);

  expect(await screen.findByText('Поки немає даних')).toBeInTheDocument();
  expect(screen.queryByText('Топ-30 навичок')).not.toBeInTheDocument();
});
