// "What stands out": three facts computed from the data, each with its n. Cards scroll sideways on
// phones.
import type { ReactElement } from 'react';
import {
  insights,
  valueLabel,
  type Aggregates,
  type Insight,
} from '../../entities/aggregates/index.ts';
import { useLanguage, type Messages } from '../../shared/i18n/index.ts';
import { formatNumber, formatShare, toPercent, type Language } from '../../shared/lib/index.ts';
import styles from './insights.module.scss';

// ---- types -------------------------------------------------------------------------------------

interface InsightCopy {
  tag: string;
  text: string;
}

// ---- functions ---------------------------------------------------------------------------------

export function Insights({ aggregates }: { aggregates: Aggregates }): ReactElement | null {
  const { language, messages } = useLanguage();
  const found = insights(aggregates);
  if (found.length === 0) {
    return null;
  }
  const total = formatNumber(aggregates.totals.extracted, language);
  return (
    <section aria-labelledby="insights-title" className={styles.section}>
      <div className={styles.heading}>
        <h2 id="insights-title" className="text-section">
          {messages.insights.title}
        </h2>
        <span className={`text-caption ${styles.swipe}`}>{messages.insights.swipe}</span>
      </div>
      <div className={styles.cards}>
        {found.map((insight) => {
          const copy = insightCopy(insight, messages, language);
          return (
            <article key={insight.kind} className={styles.card}>
              <span className={styles.tag}>{copy.tag}</span>
              <p className={styles.text}>{copy.text}</p>
              <span className={styles.track} aria-hidden="true">
                <span className={styles.fill} style={{ width: toPercent(insight.share) }} />
              </span>
              <span className="text-data">
                {formatShare(insight.share, language)} · n = {formatNumber(insight.n, language)} /{' '}
                {total}
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function insightCopy(insight: Insight, messages: Messages, language: Language): InsightCopy {
  const copy = messages.insights;
  switch (insight.kind) {
    case 'domain': {
      return {
        tag: copy.domainTag,
        text: copy.domain(valueLabel('domain', insight.value, language)),
      };
    }
    case 'skill': {
      return { tag: copy.skillTag, text: copy.skill(insight.value) };
    }
    case 'missingSeniority': {
      return {
        tag: copy.gapTag,
        text: copy.missingSeniority(formatShare(insight.share, language)),
      };
    }
  }
}
