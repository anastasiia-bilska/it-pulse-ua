// The surface every block sits on: one border, one radius, padding that shrinks on phones.
import type { ComponentProps, ReactElement } from 'react';
import styles from './card.module.scss';

// ---- functions ---------------------------------------------------------------------------------

export function Card({ className, ...rest }: ComponentProps<'section'>): ReactElement {
  return <section className={[styles.card, className].filter(Boolean).join(' ')} {...rest} />;
}

/** Card title row: the heading on the left, its n or a note on the right. */
export function CardHeader({
  title,
  aside,
  level = 'h2',
}: {
  title: string;
  aside?: string;
  /** h3 for a card that sits under a section heading. */
  level?: 'h2' | 'h3';
}): ReactElement {
  const Heading = level;
  return (
    <div className={styles.header}>
      <Heading className={level === 'h2' ? 'text-card-title' : 'text-subtitle'}>{title}</Heading>
      {aside && <span className="text-data">{aside}</span>}
    </div>
  );
}
