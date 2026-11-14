// Status messages from the UI-kit: fresh (all good), warning (data lags) and error (with a retry).
// Warning and fresh are polite live regions; an error interrupts (role=alert).
import type { ReactElement, ReactNode } from 'react';
import { Icon, type IconName } from './icon.tsx';
import styles from './status-banner.module.scss';

// ---- types -------------------------------------------------------------------------------------

type BannerTone = 'fresh' | 'warning' | 'error';

// ---- constants ---------------------------------------------------------------------------------

const ICONS: Record<BannerTone, IconName> = { fresh: 'check', warning: 'warning', error: 'error' };

// ---- functions ---------------------------------------------------------------------------------

export function StatusBanner({
  tone,
  title,
  children,
  meta,
  action,
}: {
  tone: BannerTone;
  title: string;
  children?: ReactNode;
  meta?: string;
  action?: ReactNode;
}): ReactElement {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`${styles.banner} ${styles[tone]}`}
    >
      <span className={styles.icon}>
        <Icon name={ICONS[tone]} size={22} />
      </span>
      <div className={styles.body}>
        <p>
          <strong className={styles.title}>{title}</strong> {children}
        </p>
        {meta && <span className={styles.meta}>{meta}</span>}
        {action}
      </div>
    </div>
  );
}
