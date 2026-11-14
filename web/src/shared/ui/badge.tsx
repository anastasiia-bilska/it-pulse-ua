// Small pills: "soon" (filled accent), a neutral data chip ("n = 259") and a warning chip ("n < 10").
import type { ReactElement, ReactNode } from 'react';
import styles from './badge.module.scss';

// ---- types -------------------------------------------------------------------------------------

type BadgeTone = 'soon' | 'soonOnAccent' | 'data' | 'warning';

// ---- functions ---------------------------------------------------------------------------------

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }): ReactElement {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
