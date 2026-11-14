// UA / EN toggle. Two pressed-state buttons rather than a select: one tap, both options visible.
import type { ReactElement } from 'react';
import { useLanguage } from '../../shared/i18n/index.ts';
import { LANGUAGES, type Language } from '../../shared/lib/index.ts';
import styles from './language-switch.module.scss';

// ---- constants ---------------------------------------------------------------------------------

const SHORT_NAMES: Record<Language, string> = { uk: 'UA', en: 'EN' };
const FULL_NAMES: Record<Language, string> = { uk: 'Українська', en: 'English' };

// ---- functions ---------------------------------------------------------------------------------

export function LanguageSwitch({ isWide = false }: { isWide?: boolean }): ReactElement {
  const { language, messages, setLanguage } = useLanguage();
  const names = isWide ? FULL_NAMES : SHORT_NAMES;
  return (
    <div role="group" aria-label={messages.nav.language} className={styles.group}>
      {LANGUAGES.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={option === language}
          className={styles.option}
          onClick={() => {
            setLanguage(option);
          }}
        >
          {names[option]}
        </button>
      ))}
    </div>
  );
}
