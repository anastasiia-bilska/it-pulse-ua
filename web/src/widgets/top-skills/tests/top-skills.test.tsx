import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { SAMPLE_AGGREGATES } from '../../../entities/aggregates/testing.ts';
import { renderWithLanguage } from '../../../shared/testing/index.ts';
import { TopSkills } from '../index.ts';

test('skills are ranked with their mention counts', () => {
  renderWithLanguage(<TopSkills aggregates={SAMPLE_AGGREGATES} />);

  const first = screen.getAllByRole('listitem')[0];
  expect(first).toHaveTextContent('01');
  expect(first).toHaveTextContent('Python');
  expect(first).toHaveTextContent('40');
});

test('no skills yet shows the empty state instead of an empty list', () => {
  renderWithLanguage(<TopSkills aggregates={{ ...SAMPLE_AGGREGATES, topSkills: [] }} />);

  expect(screen.getByText('Поки немає даних')).toBeInTheDocument();
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
});
