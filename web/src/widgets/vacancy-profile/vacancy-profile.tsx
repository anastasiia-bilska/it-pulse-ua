// Level, work format, English and company type as 100% stacks. All four on desktop; on phones a
// row of chips picks one.
import { useState, type ReactElement } from 'react';
import {
  PROFILE_DIMENSIONS,
  profileSegments,
  valueLabel,
  type Aggregates,
  type ProfileDimension,
} from '../../entities/aggregates/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import { formatNumber, formatShare } from '../../shared/lib/index.ts';
import { Card, CardHeader, StackedBar, tabId, tabPanelId, Tabs } from '../../shared/ui/index.ts';
import styles from './vacancy-profile.module.scss';

// ---- constants ---------------------------------------------------------------------------------

const TABS_NAME = 'profile';

// ---- functions ---------------------------------------------------------------------------------

export function VacancyProfile({ aggregates }: { aggregates: Aggregates }): ReactElement {
  const { messages } = useLanguage();
  const [selected, setSelected] = useState<ProfileDimension>('seniority');
  const titles = messages.profile.stacks;
  return (
    <section aria-labelledby="profile-title" className={styles.section}>
      <h2 id="profile-title" className="text-section">
        {messages.profile.title}
      </h2>
      <div className={styles.tabs}>
        <Tabs
          look="chips"
          label={messages.profile.title}
          name={TABS_NAME}
          tabs={PROFILE_DIMENSIONS.map((id) => ({ id, label: titles[id] }))}
          selectedId={selected}
          onSelect={(id) => {
            setSelected(PROFILE_DIMENSIONS.find((dimension) => dimension === id) ?? 'seniority');
          }}
        />
      </div>
      <div className={styles.grid}>
        {PROFILE_DIMENSIONS.map((dimension) => (
          <ProfilePanel
            key={dimension}
            dimension={dimension}
            aggregates={aggregates}
            isSelected={dimension === selected}
          />
        ))}
      </div>
    </section>
  );
}

function ProfilePanel({
  dimension,
  aggregates,
  isSelected,
}: {
  dimension: ProfileDimension;
  aggregates: Aggregates;
  isSelected: boolean;
}): ReactElement {
  const { language, messages } = useLanguage();
  const title = messages.profile.stacks[dimension];
  const segments = profileSegments(dimension, aggregates.distributions[dimension]).map(
    (segment) => ({
      key: segment.value,
      label: valueLabel(dimension, segment.value, language),
      value: `${formatShare(segment.share, language)} · ${formatNumber(segment.n, language)}`,
      share: segment.share,
      isMissing: segment.isMissing,
    }),
  );
  return (
    <div
      id={tabPanelId(TABS_NAME, dimension)}
      role="tabpanel"
      aria-labelledby={tabId(TABS_NAME, dimension)}
      className={isSelected ? styles.panel : `${styles.panel} ${styles.hiddenOnPhone}`}
    >
      <Card aria-label={title}>
        <CardHeader
          title={title}
          aside={`n = ${formatNumber(aggregates.totals.extracted, language)}`}
          level="h3"
        />
        <StackedBar segments={segments} />
      </Card>
    </div>
  );
}
