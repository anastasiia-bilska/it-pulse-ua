import { screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { expect, test } from 'vitest';
import { useLanguage } from '../../../shared/i18n/index.ts';
import { renderWithLanguage } from '../../../shared/testing/index.ts';
import { LanguageSwitch } from '../index.ts';

function HeroTitle(): ReactElement {
  return <h1>{useLanguage().messages.hero.title}</h1>;
}

test('the page starts in Ukrainian', () => {
  renderWithLanguage(<LanguageSwitch />);

  expect(screen.getByRole('button', { name: 'UA' })).toHaveAttribute('aria-pressed', 'true');
  expect(document.documentElement).toHaveAttribute('lang', 'uk');
});

test('switching to English changes the copy and <html lang>', async () => {
  const { user } = renderWithLanguage(
    <>
      <LanguageSwitch />
      <HeroTitle />
    </>,
  );

  await user.click(screen.getByRole('button', { name: 'EN' }));

  expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('heading')).toHaveTextContent('The pulse of Ukraine’s IT job market');
  expect(document.documentElement).toHaveAttribute('lang', 'en');
});
