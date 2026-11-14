// A headline number with its label and a note (usually its n), plus the loading skeleton.
import type { ReactElement } from 'react';
import styles from './kpi-card.module.scss';

// ---- functions ---------------------------------------------------------------------------------

export function KpiCard({
  label,
  value,
  note,
  isAccent = false,
}: {
  label: string;
  value: string;
  note: string;
  isAccent?: boolean;
}): ReactElement {
  return (
    <div className={styles.card}>
      <span className={styles.label}>{label}</span>
      <span className={isAccent ? `${styles.value} ${styles.accent}` : styles.value}>{value}</span>
      <span className={styles.note}>{note}</span>
    </div>
  );
}

export function KpiSkeleton(): ReactElement {
  return (
    <div className={`${styles.card} ${styles.skeleton}`} aria-hidden="true">
      <span className={styles.lineLabel} />
      <span className={styles.lineValue} />
      <span className={styles.lineNote} />
    </div>
  );
}
