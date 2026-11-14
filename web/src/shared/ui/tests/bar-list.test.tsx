import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { BarList } from '../index.ts';

test('every row shows its label and value, and bars stay decorative', () => {
  render(
    <BarList
      items={[
        { key: 'qa', label: 'QA', value: '40% · 40', fraction: 1, fill: 'leader' },
        { key: 'na', label: 'Не вказано', value: '10% · 10', fraction: 0.25, fill: 'missing' },
      ]}
    />,
  );

  const rows = screen.getAllByRole('listitem');
  expect(rows).toHaveLength(2);
  expect(rows[1]).toHaveTextContent('Не вказано');
  expect(rows[1]).toHaveTextContent('10% · 10');
});

test('a bar width can never overflow its track', () => {
  const { container } = render(
    <BarList items={[{ key: 'x', label: 'X', value: '1', fraction: 3, fill: 'neutral' }]} />,
  );

  const fill = container.querySelector(':scope [aria-hidden="true"] > span');
  expect(fill).toHaveStyle({ width: '100%' });
});
