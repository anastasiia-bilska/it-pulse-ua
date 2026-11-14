import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { SAMPLE_AGGREGATES } from '../../../entities/aggregates/testing.ts';
import { renderWithLanguage } from '../../../shared/testing/index.ts';
import { SalaryOverview } from '../index.ts';

function levelRow(level: string): HTMLElement {
  const row = screen.getByText(level, { selector: 'span' }).closest('li');
  if (!row) {
    throw new Error(`no salary row for ${level}`);
  }
  return row;
}

test('a level with enough salaries shows its median and quartiles', () => {
  renderWithLanguage(<SalaryOverview aggregates={SAMPLE_AGGREGATES} />);

  expect(levelRow('Middle')).toHaveTextContent('медіана $2 500 · p25 $1 800 · p75 $3 200');
});

test('a thin level shows how far it is from the threshold, not a number', () => {
  renderWithLanguage(<SalaryOverview aggregates={SAMPLE_AGGREGATES} />);

  expect(levelRow('Senior')).toHaveTextContent('даних замало · 7/10');
  expect(levelRow('Senior')).not.toHaveTextContent('$');
});

test('a level with no USD salaries says so instead of vanishing', () => {
  renderWithLanguage(<SalaryOverview aggregates={SAMPLE_AGGREGATES} />);

  expect(levelRow('Lead')).toHaveTextContent('Поки немає вакансій із вилкою в USD');
});

test('roles below the threshold show progress; a role above it shows its median', () => {
  renderWithLanguage(<SalaryOverview aggregates={SAMPLE_AGGREGATES} />);

  expect(screen.getByText('QA').closest('li')).toHaveTextContent('8/10');
  expect(screen.getByText('Backend').closest('li')).toHaveTextContent('$3 200 · n = 14');
});
