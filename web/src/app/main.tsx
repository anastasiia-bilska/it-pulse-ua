// Entry point: global styles, providers, the one page (in two languages, ADR 0019).
import './styles/fonts.scss';
import './styles/tokens.scss';
import './styles/global.scss';
import './styles/typography.scss';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardPage } from '../pages/dashboard/index.ts';
import { LanguageProvider } from '../shared/i18n/index.ts';
import { LANGUAGES } from '../shared/lib/index.ts';

// ---- entry point -------------------------------------------------------------------------------

const root = document.querySelector('#root');
if (!root) {
  throw new Error('index.html has no #root element');
}

// index.html is English, uk.html Ukrainian: the page the reader opened sets the language.
const pageLanguage = LANGUAGES.find((language) => language === document.documentElement.lang);

createRoot(root).render(
  <StrictMode>
    <LanguageProvider initialLanguage={pageLanguage ?? 'en'}>
      <DashboardPage />
    </LanguageProvider>
  </StrictMode>,
);
