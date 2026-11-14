// The method in four steps, then the counting rules the page keeps to.
import type { ReactElement } from 'react';
import { useLanguage } from '../../shared/i18n/index.ts';
import { Icon } from '../../shared/ui/index.ts';
import styles from './how-it-works.module.scss';

// ---- functions ---------------------------------------------------------------------------------

export function HowItWorks({
  minN,
  windowDays,
}: {
  minN: number;
  windowDays: number;
}): ReactElement {
  const { messages } = useLanguage();
  const copy = messages.method;
  return (
    <section id="method" aria-labelledby="method-title" className={styles.section}>
      <h2 id="method-title" className="text-section">
        {copy.title}
      </h2>
      <ol className={styles.steps}>
        {copy.steps.map((step, index) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.number}>{String(index + 1).padStart(2, '0')}</span>
            <div className={styles.stepText}>
              <span className="text-subtitle">{step.title}</span>
              <span className={styles.stepBody}>{step.body}</span>
            </div>
          </li>
        ))}
      </ol>
      <ul className={styles.rules}>
        {copy.rules(minN, windowDays).map((rule) => (
          <li key={rule} className={styles.rule}>
            <Icon name="check" size={16} />
            {rule}
          </li>
        ))}
      </ul>
    </section>
  );
}
