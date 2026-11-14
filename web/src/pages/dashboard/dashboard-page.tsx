// The public dashboard: one page, sections in reading order. Data states (loading, error, empty)
// replace only the data blocks; the header, hero and method stay readable either way.
import type { ReactElement } from 'react';
import type { Aggregates } from '../../entities/aggregates/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import { Button, EmptyState, StatusBanner } from '../../shared/ui/index.ts';
import { DigestPlayer } from '../../widgets/digest-player/index.ts';
import { FreshnessBanner } from '../../widgets/freshness-banner/index.ts';
import { Hero } from '../../widgets/hero/index.ts';
import { HowItWorks } from '../../widgets/how-it-works/index.ts';
import { Insights } from '../../widgets/insights/index.ts';
import { KpiGrid, KpiGridSkeleton } from '../../widgets/kpi-grid/index.ts';
import { MarketOverview } from '../../widgets/market-overview/index.ts';
import { SalaryOverview } from '../../widgets/salary-overview/index.ts';
import { SiteFooter } from '../../widgets/site-footer/index.ts';
import { SiteHeader } from '../../widgets/site-header/index.ts';
import { TopSkills } from '../../widgets/top-skills/index.ts';
import { VacancyProfile } from '../../widgets/vacancy-profile/index.ts';
import styles from './dashboard-page.module.scss';
import { useAggregates, type AggregatesState } from './use-aggregates.ts';

// ---- constants ---------------------------------------------------------------------------------

/** Shown in the method rules before the data arrives; the real values come from aggregates.json. */
const DEFAULT_MIN_N = 10;
const DEFAULT_WINDOW_DAYS = 30;

// ---- functions ---------------------------------------------------------------------------------

export function DashboardPage(): ReactElement {
  const { messages } = useLanguage();
  const { state, retry } = useAggregates();
  const aggregates = state.status === 'ready' ? state.aggregates : undefined;
  return (
    <>
      <a href="#top" className={styles.skip}>
        {messages.skipToContent}
      </a>
      <SiteHeader />
      <main id="top" className={styles.main} aria-busy={state.status === 'loading'}>
        <Hero />
        <DataSections state={state} retry={retry} />
        <DigestPlayer episode={aggregates?.digest} />
        <HowItWorks
          minN={aggregates?.minN ?? DEFAULT_MIN_N}
          windowDays={aggregates?.windowDays ?? DEFAULT_WINDOW_DAYS}
        />
      </main>
      <SiteFooter {...(aggregates && { generatedAt: aggregates.generatedAt })} />
    </>
  );
}

function DataSections({
  state,
  retry,
}: {
  state: AggregatesState;
  retry: () => void;
}): ReactElement {
  const { messages } = useLanguage();
  const copy = messages.states;
  switch (state.status) {
    case 'loading': {
      return (
        <>
          <p className="visually-hidden">{copy.loading}</p>
          <KpiGridSkeleton />
        </>
      );
    }
    case 'error': {
      return (
        <StatusBanner
          tone="error"
          title={copy.errorTitle}
          action={
            <Button variant="danger" onClick={retry}>
              {copy.retry}
            </Button>
          }
        >
          {copy.errorBody}
        </StatusBanner>
      );
    }
    case 'ready': {
      return <ReadySections aggregates={state.aggregates} />;
    }
  }
}

function ReadySections({ aggregates }: { aggregates: Aggregates }): ReactElement {
  const { messages } = useLanguage();
  if (aggregates.totals.extracted === 0) {
    return (
      <>
        <FreshnessBanner freshness={aggregates.freshness} />
        <EmptyState title={messages.states.emptyTitle} body={messages.states.emptyBody} />
      </>
    );
  }
  return (
    <>
      <div className={styles.stack}>
        <FreshnessBanner freshness={aggregates.freshness} />
        <KpiGrid aggregates={aggregates} />
      </div>
      <Insights aggregates={aggregates} />
      <MarketOverview aggregates={aggregates} />
      <VacancyProfile aggregates={aggregates} />
      <TopSkills aggregates={aggregates} />
      <SalaryOverview aggregates={aggregates} />
    </>
  );
}
