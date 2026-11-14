// Sources, the aggregates-only promise, when the data was built, and where the code lives.
import type { ReactElement } from 'react';
import { ADR_URL, REPOSITORY_URL } from '../../shared/config/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import { formatDateTime } from '../../shared/lib/index.ts';
import styles from './site-footer.module.scss';

// ---- functions ---------------------------------------------------------------------------------

export function SiteFooter({ generatedAt }: { generatedAt?: string }): ReactElement {
  const { language, messages } = useLanguage();
  const copy = messages.footer;
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.text}>
          <p>{copy.text}</p>
          {generatedAt && (
            <p className="text-data">{copy.updated(formatDateTime(generatedAt, language))}</p>
          )}
        </div>
        <div className={styles.links}>
          <a href={REPOSITORY_URL}>{copy.code}</a>
          <a href={ADR_URL}>ADR</a>
        </div>
      </div>
    </footer>
  );
}
