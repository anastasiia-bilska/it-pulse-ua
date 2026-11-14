// The opening: what the page is, where the data comes from, and the pulse line.
import type { ReactElement } from 'react';
import { AskMarketTeaser } from '../../features/ask-market/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import styles from './hero.module.scss';

// ---- constants ---------------------------------------------------------------------------------

/** The ECG line, in the 1200×80 viewBox: two beats on a flat baseline. */
/** One sweep; the eyebrow dot pings at the same rate (hero.module.scss). */
const SWEEP_DURATION = '2.8s';
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
 * A heart-monitor trace: a dim baseline with a bright head sweeping along it. A luminance mask
 * shows the bright copy only where its gradient is light; the gradient slides, the mask rect
 * stays put, so there are no moving edges to flicker. The line's geometry never changes.
 */
function PulseLine(): ReactElement {
  return (
    <svg
      className={styles.pulse}
      viewBox="0 0 1200 80"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* Starts left of the line (-300 to 0) and slides 1500 units, past the right end. Outside
            the gradient, `pad` repeats the black ends, so the rest of the line stays dim. */}
        <linearGradient id="pulse-head" gradientUnits="userSpaceOnUse" x1="-300" x2="0">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.85" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            from="0 0"
            to="1500 0"
            dur={SWEEP_DURATION}
            repeatCount="indefinite"
          />
        </linearGradient>
        <mask id="pulse-sweep" maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="80">
          <rect width="1200" height="80" fill="url(#pulse-head)" />
        </mask>
      </defs>
      <polyline className={styles.baseline} points={PULSE_POINTS} />
      <polyline className={styles.trace} points={PULSE_POINTS} mask="url(#pulse-sweep)" />
    </svg>
  );
}
