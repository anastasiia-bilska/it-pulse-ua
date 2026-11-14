import { screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { SAMPLE_AGGREGATES } from '../../../entities/aggregates/testing.ts';
import { renderWithLanguage } from '../../../shared/testing/index.ts';
import { MarketOverview } from '../index.ts';

function rolesCard(): HTMLElement {
  return screen.getByRole('region', { name: 'Ролі' });
}

test('roles show the first nine rows until "show all" is pressed', async () => {
  const { user } = renderWithLanguage(<MarketOverview aggregates={SAMPLE_AGGREGATES} />);
  const toggle = within(rolesCard()).getByRole('button', { name: 'Показати всі (14)' });

  expect(within(rolesCard()).getAllByRole('listitem')).toHaveLength(9);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await user.click(toggle);

  expect(within(rolesCard()).getAllByRole('listitem')).toHaveLength(14);
  expect(within(rolesCard()).getByRole('button', { name: 'Згорнути' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

test('"not stated" is listed as a value of its own, never hidden', async () => {
  const { user } = renderWithLanguage(<MarketOverview aggregates={SAMPLE_AGGREGATES} />);

  await user.click(within(rolesCard()).getByRole('button', { name: 'Показати всі (14)' }));

  expect(within(rolesCard()).getByText('Не вказано')).toBeInTheDocument();
});

test('every row carries its share and n', () => {
  renderWithLanguage(<MarketOverview aggregates={SAMPLE_AGGREGATES} />);

  const backend = within(rolesCard()).getByText('Backend').closest('li');
  expect(backend).toHaveTextContent('15% · 30');
});

test('a domains list short enough to fit has no "show all" button', () => {
  renderWithLanguage(<MarketOverview aggregates={SAMPLE_AGGREGATES} />);

  const domains = screen.getByRole('region', { name: 'Домени' });
  expect(within(domains).queryByRole('button')).not.toBeInTheDocument();
});
