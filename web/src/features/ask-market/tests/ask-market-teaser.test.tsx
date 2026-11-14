import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { LanguageProvider } from '../../../shared/i18n/index.ts';
import { renderWithLanguage } from '../../../shared/testing/index.ts';
import { AskMarketTeaser } from '../index.ts';

test('the teaser opens a popup that says what the agent will do', async () => {
  const { user } = renderWithLanguage(<AskMarketTeaser look="block" />);

  await user.click(screen.getByRole('button', { name: /Запитай ринок/ }));

  const dialog = screen.getByRole('dialog', { name: 'Запитай ринок' });
  expect(dialog).toHaveAttribute('open');
  expect(dialog).toHaveTextContent('даних замало');
});

test('the popup closes with its close button', async () => {
  const { user } = renderWithLanguage(<AskMarketTeaser look="pill" />);
  await user.click(screen.getByRole('button', { name: /Запитай ринок/ }));
  const dialog = screen.getByRole('dialog', { name: 'Запитай ринок' });

  await user.click(screen.getByRole('button', { name: 'Закрити' }));

  expect(dialog).not.toHaveAttribute('open');
});

test('the page starts in English', async () => {
  const user = userEvent.setup();
  render(
    <LanguageProvider>
      <AskMarketTeaser look="pill" />
    </LanguageProvider>,
  );

  await user.click(screen.getByRole('button', { name: /Ask the market/ }));

  expect(screen.getByRole('dialog', { name: 'Ask the market' })).toHaveAttribute('open');
});
