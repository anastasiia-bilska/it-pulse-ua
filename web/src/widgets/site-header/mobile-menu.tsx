// The burger menu, a modal <dialog>: the browser traps focus, closes it on Esc and makes the page
// behind it inert, so no focus-trap code is needed.
import { useRef, type ReactElement } from 'react';
import { AskMarketTeaser } from '../../features/ask-market/index.ts';
import { LanguageSwitch } from '../../features/switch-language/index.ts';
import { useLanguage } from '../../shared/i18n/index.ts';
import { Badge, Button, Icon, Logo } from '../../shared/ui/index.ts';
import { SECTIONS } from './sections.ts';
import styles from './mobile-menu.module.scss';

// ---- functions ---------------------------------------------------------------------------------

export function MobileMenu(): ReactElement {
  const { messages } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  function close(): void {
    dialog.current?.close();
  }
  return (
    <>
      <Button
        variant="icon"
        aria-label={messages.nav.openMenu}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <Icon name="menu" size={22} />
      </Button>
      <dialog ref={dialog} className={styles.dialog} aria-label={messages.nav.label}>
        <div className={styles.top}>
          <Logo />
          <Button variant="icon" aria-label={messages.nav.closeMenu} onClick={close}>
            <Icon name="close" size={22} />
          </Button>
        </div>
        <MenuLinks onNavigate={close} />
        <div className={styles.bottom}>
          <span className="text-caption">{messages.nav.language}</span>
          <LanguageSwitch isWide />
        </div>
      </dialog>
    </>
  );
}

function MenuLinks({ onNavigate }: { onNavigate: () => void }): ReactElement {
  const { messages } = useLanguage();
  return (
    <nav aria-label={messages.nav.label} className={styles.nav}>
      {SECTIONS.map((section, index) => (
        <a key={section} href={`#${section}`} className={styles.link} onClick={onNavigate}>
          <span className={styles.number}>{String(index + 1).padStart(2, '0')}</span>
          <span className={styles.linkText}>
            <span className={styles.linkTitle}>{messages.nav[section]}</span>
            <span className="text-caption">{messages.menuHints[section]}</span>
          </span>
          <Icon name="chevronRight" size={20} />
        </a>
      ))}
      <div className={styles.teasers}>
        <AskMarketTeaser look="card" />
        <p className={styles.digest}>
          <Icon name="headphones" size={18} />
          <span className={styles.linkText}>{messages.digest.title}</span>
          <Badge tone="data">{messages.soon}</Badge>
        </p>
      </div>
    </nav>
  );
}
