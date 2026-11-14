import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { renderWithLanguage } from '../../../shared/testing/index.ts';
import { SiteHeader } from '../index.ts';

test('the burger opens the menu as a modal dialog', async () => {
  const { user } = renderWithLanguage(<SiteHeader />);

  await user.click(screen.getByRole('button', { name: 'Відкрити меню' }));

  expect(screen.getByRole('dialog', { name: 'Розділи' })).toHaveAttribute('open');
});

test('choosing a section closes the menu', async () => {
  const { user } = renderWithLanguage(<SiteHeader />);
  await user.click(screen.getByRole('button', { name: 'Відкрити меню' }));
  const dialog = screen.getByRole('dialog', { name: 'Розділи' });

  await user.click(screen.getByRole('link', { name: /Зарплати медіана/ }));

  expect(dialog).not.toHaveAttribute('open');
});

test('the agent is a labelled teaser, not a link to a page that does not exist', () => {
  renderWithLanguage(<SiteHeader />);

  expect(screen.queryByRole('link', { name: /Запитай ринок/ })).not.toBeInTheDocument();
  expect(screen.getAllByText('Запитай ринок').length).toBeGreaterThan(0);
});
