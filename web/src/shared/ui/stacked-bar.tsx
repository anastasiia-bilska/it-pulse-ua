// A 100% stacked bar with its legend: categories in an accent ramp, "not stated" hatched.
import type { ReactElement } from 'react';
import styles from './stacked-bar.module.scss';

// ---- types -------------------------------------------------------------------------------------

export interface StackSegment {
  key: string;
  label: string;
  value: string;
  share: number;
  isMissing: boolean;
}

// ---- constants ---------------------------------------------------------------------------------

/** UI-kit "Pulse 1–4" ramp, then a light neutral for a fifth category. */
const RAMP_SIZE = 5;

// ---- functions ---------------------------------------------------------------------------------

export function StackedBar({ segments }: { segments: StackSegment[] }): ReactElement {
  return (
    <>
      <div className={styles.bar} aria-hidden="true">
        {segments.map((segment, index) => (
          <span
            key={segment.key}
            className={fillClass(segment, index)}
            style={{ flexGrow: segment.share }}
          />
        ))}
      </div>
      <ul className={styles.legend}>
        {segments.map((segment, index) => (
          <li key={segment.key} className={styles.item}>
            <span className={`${styles.swatch} ${fillClass(segment, index)}`} aria-hidden="true" />
            <span className={styles.label}>{segment.label}</span>
            <span className={styles.value}>{segment.value}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function fillClass(segment: StackSegment, index: number): string | undefined {
  return segment.isMissing ? styles.missing : styles[`ramp${index % RAMP_SIZE}`];
}
