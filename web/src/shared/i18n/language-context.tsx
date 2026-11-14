// The page language: English by default (the readers we most want are international), switched
// in place without a reload.
import {
  createContext,
  use,
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

// ---- functions ---------------------------------------------------------------------------------

export function LanguageProvider({
  children,
  initialLanguage = 'en',
}: {
  children: ReactNode;
  /** Tests start in Ukrainian, the language their assertions are written in. */
  initialLanguage?: Language;
}): ReactElement {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  // Screen readers and hyphenation follow <html lang>, so it tracks the switch.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const value = useMemo(
    () => ({ language, messages: MESSAGES[language], setLanguage }),
    [language],
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
