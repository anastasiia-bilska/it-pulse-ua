// Top 30 skills by mentions. Phones show ten first, with a button for the rest.
import { useState, type ReactElement } from 'react';
import { barRows, type Aggregates } from '../../entities/aggregates/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import { formatNumber } from '../../shared/lib/index.ts';
import { BarList, Button, Card, EmptyState } from '../../shared/ui/index.ts';
import styles from './top-skills.module.scss';

// ---- constants ---------------------------------------------------------------------------------

/** The accent marks the podium; the rest are neutral so the top stands out. */
const PODIUM = 3;
/** Phones show this many before "show all"; must match nth-child in top-skills.module.scss. */
const PHONE_ROWS = 10;
const LIST_ID = 'skills-list';

// ---- functions ---------------------------------------------------------------------------------

export function TopSkills({ aggregates }: { aggregates: Aggregates }): ReactElement {
  const { messages } = useLanguage();
  const [isExpanded, setExpanded] = useState(false);
  const skills = aggregates.topSkills;
  return (
    <Card id="skills" aria-labelledby="skills-title" className={styles.card}>
      <div className={styles.heading}>
        <h2 id="skills-title" className="text-section">
          {messages.skills.title}
        </h2>
        <span className="text-caption">{messages.skills.note}</span>
      </div>
      {skills.length === 0 ? (
        <EmptyState title={messages.states.emptyTitle} body={messages.states.emptyBody} />
      ) : (
        <SkillList aggregates={aggregates} isExpanded={isExpanded} />
      )}
      {skills.length > PHONE_ROWS && (
        <Button
          className={styles.toggle}
          aria-expanded={isExpanded}
          aria-controls={LIST_ID}
          onClick={() => {
            setExpanded(!isExpanded);
          }}
        >
          {isExpanded ? messages.skills.collapse : messages.skills.showAll}
        </Button>
      )}
    </Card>
  );
}

function SkillList({
  aggregates,
  isExpanded,
}: {
  aggregates: Aggregates;
  isExpanded: boolean;
}): ReactElement {
  const { language } = useLanguage();
  const rows = barRows(aggregates.topSkills.map((skill) => ({ ...skill, share: 0 })));
  return (
    <div id={LIST_ID} className={isExpanded ? styles.expanded : styles.collapsed}>
      <BarList
        size="slim"
        items={rows.map((row, index) => ({
          key: row.value,
          prefix: String(index + 1).padStart(2, '0'),
          label: row.value,
          value: formatNumber(row.n, language),
          fraction: row.fraction,
          fill: index < PODIUM ? 'leader' : 'neutral',
        }))}
      />
    </div>
  );
}
