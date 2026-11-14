// The weekly voice digest is not built yet: an accent teaser with the player in the UI-kit's
// "unavailable" state. No fake duration or progress.
import type { ReactElement } from 'react';
import { useLanguage } from '../../shared/i18n/index.ts';
import { Badge, Icon } from '../../shared/ui/index.ts';
import styles from './digest-teaser.module.scss';

// ---- constants ---------------------------------------------------------------------------------

/** A decorative waveform; heights in % of the bar area. */
const WAVE = [
  30, 55, 40, 75, 60, 90, 45, 70, 100, 65, 35, 80, 50, 95, 60, 40, 85, 55, 70, 30, 65, 90, 45, 75,
  100, 50, 35, 80, 60, 40, 55, 30,
];

// ---- functions ---------------------------------------------------------------------------------

export function DigestTeaser(): ReactElement {
  const { messages } = useLanguage();
  const copy = messages.digest;
  return (
    <section aria-labelledby="digest-title" className={styles.teaser}>
      <div className={styles.text}>
        <Badge tone="soonOnAccent">{messages.soon}</Badge>
        <h2 id="digest-title" className={styles.title}>
          {copy.title}
        </h2>
        <p className={styles.body}>{copy.body}</p>
      </div>
      <div className={styles.player}>
        <button type="button" className={styles.play} disabled aria-label={copy.playUnavailable}>
          <Icon name="play" size={22} />
        </button>
        <div className={styles.track}>
          <span className={styles.trackTitle}>{copy.playerTitle}</span>
          <span className={styles.wave} aria-hidden="true">
            {WAVE.map((height, index) => (
              <span key={index} style={{ height: `${height}%` }} />
            ))}
          </span>
        </div>
      </div>
    </section>
  );
}
