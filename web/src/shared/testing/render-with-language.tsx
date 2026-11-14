// Renders a component the way the app does: inside the language provider, Ukrainian first.
import { render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { LanguageProvider } from '../i18n/index.ts';

// ---- functions ---------------------------------------------------------------------------------

export function renderWithLanguage(ui: ReactElement): RenderResult & { user: UserEvent } {
  return { user: userEvent.setup(), ...render(<LanguageProvider>{ui}</LanguageProvider>) };
}
