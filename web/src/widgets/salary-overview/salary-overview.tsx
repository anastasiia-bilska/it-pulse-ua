// Salaries in USD per month: quartile boxes by level, and progress to the n threshold by role.
// Below the threshold no number is shown, only how far the group is from it (ADR 0011).
import type { ReactElement } from 'react';
import { salaryScale, seniorityRows, type Aggregates } from '../../entities/aggregates/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import { formatUsd } from '../../shared/lib/index.ts';
import { Card } from '../../shared/ui/index.ts';
import { RoleSalaryList } from './role-salary-list.tsx';
import { SalaryRowView } from './salary-row-view.tsx';
import styles from './salary-overview.module.scss';

// ---- constants ---------------------------------------------------------------------------------

const AXIS_TICKS = 4;

// ---- functions ---------------------------------------------------------------------------------

export function SalaryOverview({ aggregates }: { aggregates: Aggregates }): ReactElement {
  const { messages } = useLanguage();
  const copy = messages.salary;
  return (
    <section id="salary" aria-label={messages.nav.salary} className={styles.section}>
      <Card aria-labelledby="salary-level-title">
        <SalaryHeading id="salary-level-title" title={copy.title} note={copy.note} />
        <SeniorityPlot aggregates={aggregates} />
      </Card>
      <Card aria-labelledby="salary-role-title">
        <SalaryHeading
          id="salary-role-title"
          title={copy.roleTitle}
          note={copy.roleNote(aggregates.minN)}
        />
        <RoleSalaryList rows={aggregates.salaryUsdMonthByRole} minN={aggregates.minN} />
      </Card>
    </section>
  );
}

function SalaryHeading({
  id,
  title,
  note,
}: {
  id: string;
  title: string;
  note: string;
}): ReactElement {
  return (
    <div className={styles.heading}>
      <h2 id={id} className="text-card-title">
        {title}
      </h2>
      <span className="text-caption">{note}</span>
    </div>
  );
}

function SeniorityPlot({ aggregates }: { aggregates: Aggregates }): ReactElement {
  const { language } = useLanguage();
  const rows = seniorityRows(aggregates.salaryUsdMonthBySeniority);
  const scale = salaryScale(rows);
  const ticks = Array.from(
    { length: AXIS_TICKS },
    (unused, index) => (scale * index) / (AXIS_TICKS - 1),
  );
  return (
    <>
      <div className={styles.axis} aria-hidden="true">
        <div className={styles.ticks}>
          {ticks.map((tick) => (
            <span key={tick}>{formatUsd(tick, language)}</span>
          ))}
        </div>
      </div>
      <ul className={styles.rows}>
        {rows.map((row) => (
          <SalaryRowView key={row.group} row={row} scale={scale} minN={aggregates.minN} />
        ))}
      </ul>
    </>
  );
}
