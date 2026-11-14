// "n of 10" as ten dots: how close a thin group is to the threshold where its median shows.
import type { ReactElement } from 'react';
import styles from './dot-meter.module.scss';

// ---- functions ---------------------------------------------------------------------------------

export function DotMeter({ filled, total }: { filled: number; total: number }): ReactElement {
  return (
    <span className={styles.meter} aria-hidden="true">
      {Array.from({ length: total }, (unused, index) => (
        <span key={index} className={index < filled ? styles.filled : styles.empty} />
      ))}
    </span>
  );
}
