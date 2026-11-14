// The ADR 0007 promise: when extraction lags, the page says so and why, above the numbers.
import type { ReactElement } from 'react';
import type { Freshness } from '../../entities/aggregates/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import { formatDateTime, formatNumber } from '../../shared/lib/index.ts';
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
  const lastRun = freshness.lastOkAt
    ? copy.lastRun(formatDateTime(freshness.lastOkAt, language))
    : undefined;
  return (
    <StatusBanner tone="warning" title={copy.title} {...(lastRun && { meta: lastRun })}>
      {[reason, queued].filter(Boolean).join(' ')}
    </StatusBanner>
  );
}
