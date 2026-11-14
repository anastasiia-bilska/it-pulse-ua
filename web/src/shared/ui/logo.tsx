// The brand mark: the pulse line in an accent tile, with the name next to it.
import type { ReactElement } from 'react';
import { Icon } from './icon.tsx';
import styles from './logo.module.scss';

// ---- functions ---------------------------------------------------------------------------------

export function Logo(): ReactElement {
  return (
    <span className={styles.logo}>
      <span className={styles.tile}>
        <Icon name="pulse" size={22} />
      </span>
      <span className={styles.name}>IT Pulse UA</span>
    </span>
  );
}
