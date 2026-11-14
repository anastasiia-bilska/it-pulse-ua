// Sticky header: brand, section links, the agent teaser, language and GitHub. On phones the links
// collapse into the burger menu.
import type { ReactElement } from 'react';
import { AskMarketTeaser } from '../../features/ask-market/index.ts';
import { LanguageSwitch } from '../../features/switch-language/index.ts';
import { REPOSITORY_URL } from '../../shared/config/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import { Icon, Logo } from '../../shared/ui/index.ts';
import { MobileMenu } from './mobile-menu.tsx';
import { SECTIONS } from './sections.ts';
import styles from './site-header.module.scss';

// ---- functions ---------------------------------------------------------------------------------

export function SiteHeader(): ReactElement {
  const { messages } = useLanguage();
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <a href="#top" className={styles.brand}>
          <Logo />
        </a>
        <nav aria-label={messages.nav.label} className={styles.nav}>
          {SECTIONS.map((section) => (
            <a key={section} href={`#${section}`} className={styles.link}>
              {messages.nav[section]}
            </a>
          ))}
          <AskMarketTeaser look="pill" />
          <LanguageSwitch />
          <a href={REPOSITORY_URL} aria-label="GitHub" className={styles.github}>
            <Icon name="github" size={22} />
          </a>
        </nav>
        <div className={styles.compact}>
          <LanguageSwitch />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
