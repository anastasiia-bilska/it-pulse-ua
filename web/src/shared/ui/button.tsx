// Buttons from the UI-kit: primary (the one accent CTA), secondary (outlined), ghost (text-like),
// and a square icon button that must be given an aria-label.
import type { ComponentProps, ReactElement } from 'react';
import styles from './button.module.scss';

// ---- types -------------------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';

type ButtonProperties = ComponentProps<'button'> & { variant?: ButtonVariant };

// ---- functions ---------------------------------------------------------------------------------

export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ...rest
}: ButtonProperties): ReactElement {
  return (
    <button
      type={type}
      className={[styles.button, styles[variant], className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
