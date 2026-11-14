// The opening: what the page is, where the data comes from, and the pulse line.
import type { ReactElement } from 'react';
import { AskMarketTeaser } from '../../features/ask-market/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import styles from './hero.module.scss';

// ---- constants ---------------------------------------------------------------------------------

/** The ECG line, in the 1200×80 viewBox: two beats on a flat baseline. */
const PULSE_POINTS =
  '0,48 300,48 320,20 345,70 370,8 395,62 415,40 440,48 790,48 805,30 822,60 840,48 1200,48';

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
      <PulseLine />
      <div className={styles.ask}>
        <AskMarketTeaser look="block" />
      </div>
    </section>
  );
}

/**
 * A heart-monitor trace: the line is drawn left to right by a bright head, the trace behind it
 * fades, and a short erased gap runs just ahead of it, over the previous sweep. That is a CSS mask
 * sliding over the line (hero.module.scss), not an animated SVG gradient: Chrome does not repaint
 * an SVG <mask> whose gradient is animated with SMIL, so that version stood still.
 */
function PulseLine(): ReactElement {
  return (
    <div className={styles.pulse} aria-hidden="true">
      <svg className={styles.trace} viewBox="0 0 1200 80" preserveAspectRatio="none">
        <polyline points={PULSE_POINTS} />
      </svg>
    </div>
  );
}
