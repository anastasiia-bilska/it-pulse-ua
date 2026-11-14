// Entry point: global styles, providers, the one page.
import './styles/fonts.scss';
import './styles/tokens.scss';
import './styles/global.scss';
import './styles/typography.scss';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardPage } from '../pages/dashboard/index.ts';
import { LanguageProvider } from '../shared/i18n/index.ts';

// ---- entry point -------------------------------------------------------------------------------

const root = document.querySelector('#root');
if (!root) {
  throw new Error('index.html has no #root element');
}

createRoot(root).render(
  <StrictMode>
    <LanguageProvider>
      <DashboardPage />
    </LanguageProvider>
  </StrictMode>,
);
