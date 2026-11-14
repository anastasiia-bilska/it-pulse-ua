// The four headline numbers. Every share carries its n (ADR 0011).
import type { ReactElement } from 'react';
import { kpis, type Aggregates } from '../../entities/aggregates/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import { formatNumber, formatShare, fractionOf } from '../../shared/lib/index.ts';
import { KpiCard, KpiSkeleton } from '../../shared/ui/index.ts';
import styles from './kpi-grid.module.scss';

// ---- constants ---------------------------------------------------------------------------------

const KPI_COUNT = 4;

// ---- functions ---------------------------------------------------------------------------------

export function KpiGrid({ aggregates }: { aggregates: Aggregates }): ReactElement {
  const { language, messages } = useLanguage();
  const copy = messages.kpi;
  const numbers = kpis(aggregates);
  function number(value: number): string {
    return formatNumber(value, language);
  }
  function ofExtracted(n: number): string {
    return `n = ${number(n)} / ${number(numbers.extracted)}`;
  }
  return (
    <section aria-label={copy.label} className={styles.grid}>
      <KpiCard
        label={copy.vacancies(aggregates.windowDays)}
        value={number(numbers.vacancies)}
        note={copy.vacanciesNote}
      />
      <KpiCard
        label={copy.extracted}
        value={number(numbers.extracted)}
        note={copy.extractedNote(
          formatShare(fractionOf(numbers.extracted, numbers.vacancies), language),
        )}
        isAccent
      />
      <KpiCard
        label={copy.remote}
        value={numbers.remote ? formatShare(numbers.remote.share, language) : '—'}
        note={ofExtracted(numbers.remote?.n ?? 0)}
      />
      <KpiCard
        label={copy.salaries}
        value={number(numbers.usdSalaries)}
        note={ofExtracted(numbers.usdSalaries)}
      />
    </section>
  );
}

export function KpiGridSkeleton(): ReactElement {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: KPI_COUNT }, (unused, index) => (
        <KpiSkeleton key={index} />
      ))}
    </div>
  );
}
