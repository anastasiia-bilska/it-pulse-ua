// Roles and domains side by side; on phones a segmented tab shows one at a time.
import { useState, type ReactElement } from 'react';
import type { Aggregates } from '../../entities/aggregates/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import { tabId, tabPanelId, Tabs } from '../../shared/ui/index.ts';
import { DistributionCard } from './distribution-card.tsx';
import styles from './market-overview.module.scss';

// ---- constants ---------------------------------------------------------------------------------

const TABS_NAME = 'market';

// ---- functions ---------------------------------------------------------------------------------

export function MarketOverview({ aggregates }: { aggregates: Aggregates }): ReactElement {
  const { messages } = useLanguage();
  const [selected, setSelected] = useState<'role' | 'domain'>('role');
  const copy = messages.market;
  const cards = [
    { id: 'role' as const, title: copy.rolesTitle },
    { id: 'domain' as const, title: copy.domainsTitle },
  ];
  return (
    <section id="market" aria-label={messages.nav.market} className={styles.section}>
      <div className={styles.tabs}>
        <Tabs
          label={messages.nav.market}
          name={TABS_NAME}
          tabs={cards.map(({ id, title }) => ({ id, label: title }))}
          selectedId={selected}
          onSelect={(id) => {
            setSelected(id === 'domain' ? 'domain' : 'role');
          }}
        />
      </div>
      {cards.map(({ id, title }) => (
        <div
          key={id}
          id={tabPanelId(TABS_NAME, id)}
          role="tabpanel"
          aria-labelledby={tabId(TABS_NAME, id)}
          className={id === selected ? styles.panel : `${styles.panel} ${styles.hiddenOnPhone}`}
        >
          <DistributionCard
            title={title}
            dimension={id}
            shares={aggregates.distributions[id]}
            total={aggregates.totals.extracted}
          />
        </div>
      ))}
    </section>
  );
}
