import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { StatusBanner } from '../index.ts';

test('a lagging-data warning is a polite status, with its meta line', () => {
  render(
    <StatusBanner tone="warning" title="Дані трохи відстають." meta="останній запуск: 13 лист.">
      У черзі 640.
    </StatusBanner>,
  );

  const banner = screen.getByRole('status');
  expect(banner).toHaveTextContent('Дані трохи відстають. У черзі 640.');
  expect(banner).toHaveTextContent('останній запуск: 13 лист.');
});

test('an error interrupts as an alert and carries its action', () => {
  render(
    <StatusBanner tone="error" title="Не вдалося" action={<button type="button">Ще раз</button>} />,
  );

  expect(screen.getByRole('alert')).toContainElement(
    screen.getByRole('button', { name: 'Ще раз' }),
  );
});
