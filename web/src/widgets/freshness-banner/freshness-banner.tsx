// The ADR 0007 promise: when extraction lags, the page says so and why, above the numbers.
import type { ReactElement } from 'react';
import type { Freshness } from '../../entities/aggregates/index.ts';
import { useLanguage, type Messages } from '../../shared/i18n/index.ts';
import { formatDateTime, formatNumber, type Language } from '../../shared/lib/index.ts';
import { StatusBanner } from '../../shared/ui/index.ts';

// ---- functions ---------------------------------------------------------------------------------

export function FreshnessBanner({ freshness }: { freshness: Freshness }): ReactElement | null {
  const { language, messages } = useLanguage();
  if (!freshness.isStale) {
    return null;
  }
  const copy = messages.freshness;
  const reason = freshness.reason ? copy.reasons[freshness.reason] : '';
  const queued =
    freshness.backlog > 0 ? copy.queued(formatNumber(freshness.backlog, language)) : '';
  const lastRun = lastRunLine(freshness, language, copy);
  return (
    <StatusBanner tone="warning" title={copy.title} {...(lastRun && { meta: lastRun })}>
      {[reason, queued].filter(Boolean).join(' ')}
    </StatusBanner>
  );
}

/** The newest run as it ended (a quota stop still processed vacancies); else the last good one. */
function lastRunLine(
  freshness: Freshness,
  language: Language,
  copy: Messages['freshness'],
): string | undefined {
  const { lastRun, lastOkAt } = freshness;
  if (!lastRun) {
    return lastOkAt ? copy.lastOk(formatDateTime(lastOkAt, language)) : undefined;
  }
  const date = formatDateTime(lastRun.at, language);
  if (lastRun.status === 'quota_exhausted') {
    return copy.lastRunStopped(date, formatNumber(lastRun.processed, language));
  }
  return lastRun.status === 'error' ? copy.lastRunFailed(date) : copy.lastRun(date);
}
