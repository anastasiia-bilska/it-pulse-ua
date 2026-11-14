// "Ask the market" is the coming AI agent. Until it ships this is a labelled teaser, not a link:
// nothing on the page may lead to a screen that doesn't exist yet.
import type { ReactElement } from 'react';
import { useLanguage } from '../../shared/i18n/index.ts';
import { Badge, Icon } from '../../shared/ui/index.ts';
import styles from './ask-market-teaser.module.scss';

// ---- functions ---------------------------------------------------------------------------------

/** pill: header nav; block: hero on phones; card: the mobile menu. */
export function AskMarketTeaser({ look }: { look: 'pill' | 'block' | 'card' }): ReactElement {
  const { messages } = useLanguage();
  return (
    <p className={`${styles.teaser} ${styles[look]}`}>
      <Icon name="chat" size={look === 'card' ? 24 : 18} />
      <span className={styles.text}>
        <span className={styles.title}>{messages.ask.title}</span>
        {look === 'card' && <span className={styles.hint}>{messages.ask.hint}</span>}
      </span>
      <Badge tone="soonOnAccent">{messages.soon}</Badge>
    </p>
  );
}
