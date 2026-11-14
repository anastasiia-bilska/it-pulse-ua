import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { WithSourceLinks } from '../index.ts';

test('each data source named in the copy becomes a link to its job board', () => {
  render(<WithSourceLinks text="Public DOU and Djinni vacancies." />);

  expect(screen.getByRole('link', { name: 'DOU' })).toHaveAttribute('href', 'https://jobs.dou.ua/');
  expect(screen.getByRole('link', { name: 'Djinni' })).toHaveAttribute(
    'href',
    'https://djinni.co/jobs/',
  );
  expect(screen.getByText(/Public/)).toHaveTextContent('Public DOU and Djinni vacancies.');
});
