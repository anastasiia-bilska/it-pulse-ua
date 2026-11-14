// "No data yet": a dashed panel with the pulse mark, for a page or a block with nothing to show.
import type { ReactElement } from 'react';
import { Icon } from './icon.tsx';
import styles from './empty-state.module.scss';

// ---- functions ---------------------------------------------------------------------------------

export function EmptyState({ title, body }: { title: string; body: string }): ReactElement {
  return (
    <div className={styles.empty}>
      <span className={styles.icon}>
        <Icon name="pulse" size={32} />
      </span>
      <strong>{title}</strong>
      <span className="text-caption">{body}</span>
    </div>
  );
}
