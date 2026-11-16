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
    <section
      id="market"
      data-block="market"
      aria-label={messages.nav.market}
      className={styles.section}
    >
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
        <MarketPanel
          key={id}
          dimension={id}
          title={title}
          isSelected={id === selected}
          aggregates={aggregates}
        />
      ))}
    </section>
  );
}

function MarketPanel({
  dimension,
  title,
  isSelected,
  aggregates,
}: {
  dimension: 'role' | 'domain';
  title: string;
  isSelected: boolean;
  aggregates: Aggregates;
}): ReactElement {
  return (
    <div
      id={tabPanelId(TABS_NAME, dimension)}
      role="tabpanel"
      aria-labelledby={tabId(TABS_NAME, dimension)}
      className={isSelected ? styles.panel : `${styles.panel} ${styles.hiddenOnPhone}`}
    >
      <DistributionCard
        title={title}
        dimension={dimension}
        shares={aggregates.distributions[dimension]}
        total={aggregates.totals.extracted}
      />
    </div>
  );
}
