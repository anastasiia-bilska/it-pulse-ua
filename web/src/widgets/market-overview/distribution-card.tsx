// One distribution as bars: the first rows, with "show all" for the long tail.
import { useState, type ReactElement } from 'react';
import { barRows, valueLabel, type BarRow, type Share } from '../../entities/aggregates/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import { formatNumber, formatShare, type Language } from '../../shared/lib/index.ts';
import { BarList, Button, Card, CardHeader, type BarItem } from '../../shared/ui/index.ts';
import styles from './distribution-card.module.scss';

// ---- constants ---------------------------------------------------------------------------------

const COLLAPSED_ROWS = 9;

// ---- functions ---------------------------------------------------------------------------------

export function DistributionCard({
  title,
  dimension,
  shares,
  total,
}: {
  title: string;
  dimension: 'role' | 'domain';
  shares: Share[];
  total: number;
}): ReactElement {
  const { language } = useLanguage();
  const [isExpanded, setExpanded] = useState(false);
  const rows = barRows(shares, isExpanded ? shares.length : COLLAPSED_ROWS);
  const listId = `${dimension}-bars`;
  return (
    <Card aria-label={title}>
      <CardHeader title={title} aside={`n = ${formatNumber(total, language)}`} />
      <div id={listId}>
        <BarList items={barItems(rows, dimension, language)} />
      </div>
      {shares.length > COLLAPSED_ROWS && (
        <ExpandToggle
          listId={listId}
          isExpanded={isExpanded}
          count={shares.length}
          onToggle={() => {
            setExpanded(!isExpanded);
          }}
        />
      )}
      <NotStatedNote />
    </Card>
  );
}

function barItems(rows: BarRow[], dimension: 'role' | 'domain', language: Language): BarItem[] {
  return rows.map((row) => ({
    key: row.value,
    label: valueLabel(dimension, row.value, language),
    value: `${formatShare(row.share, language)} · ${formatNumber(row.n, language)}`,
    fraction: row.fraction,
    fill: row.tone,
  }));
}

function ExpandToggle({
  listId,
  isExpanded,
  count,
  onToggle,
}: {
  listId: string;
  isExpanded: boolean;
  count: number;
  onToggle: () => void;
}): ReactElement {
  const { messages } = useLanguage();
  return (
    <Button
      aria-expanded={isExpanded}
      aria-controls={listId}
      className={styles.toggle}
      onClick={onToggle}
    >
      {isExpanded ? messages.market.collapse : messages.market.showAll(count)}
    </Button>
  );
}

function NotStatedNote(): ReactElement {
  const { messages } = useLanguage();
  return (
    <p className={`text-caption ${styles.note}`}>
      <span aria-hidden="true" className={styles.hatch} />
      {messages.market.notStatedNote}
    </p>
  );
}
