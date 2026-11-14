// Horizontal bar rows (roles, domains, skills). The leader is the accent, the rest neutral, and a
// "not stated" row is hatched so missing data reads as missing, not as a category.
import type { ReactElement } from 'react';
import { toPercent } from '../lib/index.ts';
import styles from './bar-list.module.scss';

// ---- types -------------------------------------------------------------------------------------

export type BarFill = 'leader' | 'neutral' | 'missing';

export interface BarItem {
  key: string;
  label: string;
  value: string;
  /** Bar length relative to the longest bar, 0–1. */
  fraction: number;
  fill: BarFill;
  /** Shown before the label, e.g. a rank. */
  prefix?: string;
}

// ---- functions ---------------------------------------------------------------------------------

export function BarList({
  items,
  size = 'regular',
}: {
  items: BarItem[];
  size?: 'regular' | 'slim';
}): ReactElement {
  const ListTag = size === 'slim' ? 'ol' : 'ul';
  return (
    <ListTag className={`${styles.list} ${styles[size]}`}>
      {items.map((item) => (
        <li key={item.key} className={styles.row}>
          {item.prefix !== undefined && <span className={styles.prefix}>{item.prefix}</span>}
          <span className={styles.label}>{item.label}</span>
          <span className={styles.track} aria-hidden="true">
            <span
              className={`${styles.fill} ${styles[item.fill]}`}
              style={{ width: toPercent(item.fraction) }}
            />
          </span>
          <span className={styles.value}>{item.value}</span>
        </li>
      ))}
    </ListTag>
  );
}
