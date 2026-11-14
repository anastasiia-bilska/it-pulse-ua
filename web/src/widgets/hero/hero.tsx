// The opening: what the page is, where the data comes from, and the pulse line.
import type { ReactElement } from 'react';
import { AskMarketTeaser } from '../../features/ask-market/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import styles from './hero.module.scss';

// ---- functions ---------------------------------------------------------------------------------

export function Hero(): ReactElement {
  const { messages } = useLanguage();
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <p className={`text-eyebrow ${styles.eyebrow}`}>
        <span className={styles.dot} aria-hidden="true" />
        {messages.hero.eyebrow}
      </p>
      <h1 id="hero-title" className={`text-display ${styles.title}`}>
        {messages.hero.title}
      </h1>
      <p className={styles.lead}>{messages.hero.lead}</p>
      <svg
        className={styles.pulse}
        viewBox="0 0 1200 80"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline points="0,48 300,48 320,20 345,70 370,8 395,62 415,40 440,48 790,48 805,30 822,60 840,48 1200,48" />
      </svg>
      <div className={styles.ask}>
        <AskMarketTeaser look="block" />
      </div>
    </section>
  );
}
