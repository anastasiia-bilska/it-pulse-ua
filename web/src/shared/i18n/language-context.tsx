// The page language: English by default (the readers we most want are international), Ukrainian
// on /uk. Switched in place without a reload; the address follows, so a shared link opens in the
// language the reader saw (ADR 0019).
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { Language } from '../lib/index.ts';
import { MESSAGES, type Messages } from './messages.ts';

// ---- types -------------------------------------------------------------------------------------

interface LanguageState {
  language: Language;
  messages: Messages;
  setLanguage: (language: Language) => void;
}

// ---- constants ---------------------------------------------------------------------------------

const LanguageContext = createContext<LanguageState | null>(null);

/** Each language's page, relative to the site root: both pages sit in the same folder. */
const PAGE_PATHS: Record<Language, string> = { en: './', uk: 'uk' };

// ---- functions ---------------------------------------------------------------------------------

export function LanguageProvider({
  children,
  initialLanguage = 'en',
}: {
  children: ReactNode;
  /** Tests start in Ukrainian, the language their assertions are written in. */
  initialLanguage?: Language;
}): ReactElement {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  // Screen readers and hyphenation follow <html lang>, so it tracks the switch, and so does the tab.
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = MESSAGES[language].pageTitle;
  }, [language]);
  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    history.replaceState(history.state, '', PAGE_PATHS[next]);
  }, []);
  const value = useMemo(
    () => ({ language, messages: MESSAGES[language], setLanguage }),
    [language, setLanguage],
  );
  return <LanguageContext value={value}>{children}</LanguageContext>;
}

export function useLanguage(): LanguageState {
  const state = use(LanguageContext);
  if (!state) {
    throw new Error('useLanguage() needs a <LanguageProvider> above it');
  }
  return state;
}
