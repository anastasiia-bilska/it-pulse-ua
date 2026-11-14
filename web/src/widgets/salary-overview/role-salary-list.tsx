// Salary by role: the median once a role has enough USD salaries, otherwise its progress to n.
import type { ReactElement } from 'react';
import { valueLabel, type SalaryRow } from '../../entities/aggregates/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import { formatUsd, fractionOf, toPercent } from '../../shared/lib/index.ts';
import { EmptyState } from '../../shared/ui/index.ts';
import styles from './salary-overview.module.scss';

// ---- functions ---------------------------------------------------------------------------------

export function RoleSalaryList({ rows, minN }: { rows: SalaryRow[]; minN: number }): ReactElement {
  const { language, messages } = useLanguage();
  if (rows.length === 0) {
    return <EmptyState title={messages.states.emptyTitle} body={messages.salary.none} />;
  }
  return (
    <ul className={styles.roles}>
      {rows.map((row) => (
        <li key={row.group} className={styles.role}>
          <div className={styles.roleHeader}>
            <span>{valueLabel('role', row.group, language)}</span>
            <span className={styles.roleValue}>
              {row.median === null
                ? `${row.n}/${minN}`
                : `${formatUsd(row.median, language)} · n = ${row.n}`}
            </span>
          </div>
          <span className={styles.roleTrack} aria-hidden="true">
            <span
              className={row.median === null ? styles.roleProgress : styles.roleDone}
              style={{ width: toPercent(fractionOf(row.n, minN)) }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
