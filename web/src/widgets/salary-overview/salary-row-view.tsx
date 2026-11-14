// One level's salary: a p25–p75 box with the median, "not enough data" with dots, or nothing yet.
import type { ReactElement } from 'react';
import {
  salaryGeometry,
  valueLabel,
  type SalaryGeometry,
  type SalaryRow,
} from '../../entities/aggregates/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import { formatNumber, formatUsd, toPercent } from '../../shared/lib/index.ts';
import { DotMeter } from '../../shared/ui/index.ts';
import styles from './salary-overview.module.scss';

// ---- functions ---------------------------------------------------------------------------------

export function SalaryRowView({
  row,
  scale,
  minN,
}: {
  row: SalaryRow;
  scale: number;
  minN: number;
}): ReactElement {
  const { language } = useLanguage();
  return (
    <li className={styles.row}>
      <div className={styles.rowLabel}>
        <span className={styles.group}>{valueLabel('seniority', row.group, language)}</span>
        <span className="text-data">n = {formatNumber(row.n, language)}</span>
      </div>
      <SalaryValue row={row} scale={scale} minN={minN} />
    </li>
  );
}

function SalaryValue({
  row,
  scale,
  minN,
}: {
  row: SalaryRow;
  scale: number;
  minN: number;
}): ReactElement {
  const { messages } = useLanguage();
  const geometry = salaryGeometry(row, scale);
  if (geometry) {
    return <QuartileBox row={row} geometry={geometry} />;
  }
  if (row.n === 0) {
    return <span className="text-caption">{messages.salary.none}</span>;
  }
  return (
    <div className={styles.thin}>
      <DotMeter filled={row.n} total={minN} />
      <span className={styles.thinText}>
        {messages.salary.thin} · {row.n}/{minN}
      </span>
    </div>
  );
}

function QuartileBox({
  row,
  geometry,
}: {
  row: SalaryRow;
  geometry: SalaryGeometry;
}): ReactElement {
  const { language, messages } = useLanguage();
  function usd(value: number | null): string {
    return value === null ? '—' : formatUsd(value, language);
  }
  return (
    <div className={styles.value}>
      <div className={styles.plot} aria-hidden="true">
        <span
          className={styles.box}
          style={{ left: toPercent(geometry.boxStart), width: toPercent(geometry.boxWidth) }}
        />
        <span className={styles.median} style={{ left: toPercent(geometry.median) }} />
      </div>
      <span className={styles.summary}>
        {messages.salary.median} {usd(row.median)} · p25 {usd(row.p25)} · p75 {usd(row.p75)}
      </span>
    </div>
  );
}
