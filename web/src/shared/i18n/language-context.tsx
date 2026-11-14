// The page language: Ukrainian by default, switched in place without a reload.
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

export function LanguageProvider({ children }: { children: ReactNode }): ReactElement {
  const [language, setLanguage] = useState<Language>('uk');
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
