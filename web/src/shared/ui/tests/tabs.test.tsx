import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { expect, test } from 'vitest';
import { Tabs } from '../index.ts';

function RolesAndDomains(): ReactElement {
  const [selected, setSelected] = useState('roles');
  return (
    <Tabs
      label="Ринок"
      name="market"
      tabs={[
        { id: 'roles', label: 'Ролі' },
        { id: 'domains', label: 'Домени' },
      ]}
      selectedId={selected}
      onSelect={setSelected}
    />
  );
}

test('only the selected tab is in the tab order', () => {
  render(<RolesAndDomains />);

  expect(screen.getByRole('tab', { name: 'Ролі' })).toHaveAttribute('tabindex', '0');
  expect(screen.getByRole('tab', { name: 'Домени' })).toHaveAttribute('tabindex', '-1');
});

test('clicking a tab selects it', async () => {
  const user = userEvent.setup();
  render(<RolesAndDomains />);

  await user.click(screen.getByRole('tab', { name: 'Домени' }));

  expect(screen.getByRole('tab', { name: 'Домени' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: 'Ролі' })).toHaveAttribute('aria-selected', 'false');
});

test('arrow keys move selection and focus, wrapping around the ends', async () => {
  const user = userEvent.setup();
  render(<RolesAndDomains />);
  await user.click(screen.getByRole('tab', { name: 'Ролі' }));

  await user.keyboard('{ArrowLeft}');

  const domains = screen.getByRole('tab', { name: 'Домени' });
  expect(domains).toHaveAttribute('aria-selected', 'true');
  expect(domains).toHaveFocus();
});

test('each tab points at the panel it controls', () => {
  render(<RolesAndDomains />);

  expect(screen.getByRole('tab', { name: 'Ролі' })).toHaveAttribute(
    'aria-controls',
    'market-panel-roles',
  );
});
