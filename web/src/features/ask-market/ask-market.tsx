// «Запитай ринок» (ADR 0021): the button opens a modal <dialog> laid out as the design's agent page:
// on wide screens the intro and examples sit left of the chat, on phones it fills the screen with the
// examples as a strip above the field.
import { useId, useRef, type ReactElement, type RefObject } from 'react';
import { useLanguage } from '../../shared/i18n/index.ts';
import { Button, Icon } from '../../shared/ui/index.ts';
import { AgentConversation } from './agent-conversation.tsx';
import styles from './ask-market.module.scss';

// ---- functions ---------------------------------------------------------------------------------

/** pill: header nav; block: hero on phones; card: the mobile menu. */
export function AskMarket({ look }: { look: 'pill' | 'block' | 'card' }): ReactElement {
  const { messages } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        className={`${styles.trigger} ${styles[look]}`}
        aria-haspopup="dialog"
        data-umami-event="ask-market-open"
        data-umami-event-placement={look}
        onClick={() => dialog.current?.showModal()}
      >
        <Icon name="chat" size={look === 'card' ? 24 : 18} />
        <span className={styles.text}>
          <span className={styles.title}>{messages.ask.title}</span>
          {look === 'card' && <span className={styles.hint}>{messages.ask.hint}</span>}
        </span>
      </button>
      <AskMarketDialog dialog={dialog} />
    </>
  );
}

function AskMarketDialog({
  dialog,
}: {
  dialog: RefObject<HTMLDialogElement | null>;
}): ReactElement {
  const copy = useLanguage().messages.ask;
  const titleId = useId();
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      // A click on the backdrop lands on the <dialog> itself, outside its content box.
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          event.currentTarget.close();
        }
      }}
    >
      <div className={styles.layout}>
        <DialogIntro titleId={titleId} onClose={() => dialog.current?.close()} />
        <AgentConversation />
        <p className={styles.thin}>
          <Icon name="warning" size={20} />
          <span>{copy.thin}</span>
        </p>
      </div>
    </dialog>
  );
}

/** Wide: the title and the lead. Phones: a slim bar with the title, "AI agent" and close. */
function DialogIntro({ titleId, onClose }: { titleId: string; onClose: () => void }): ReactElement {
  const copy = useLanguage().messages.ask;
  return (
    <div className={styles.intro}>
      <div className={styles.introText}>
        <h2 id={titleId} className={styles.dialogTitle}>
          {copy.title}
        </h2>
        <p className={styles.subtitle}>{copy.hint}</p>
        <p className={styles.lead}>{copy.lead}</p>
      </div>
      <Button variant="icon" aria-label={copy.close} onClick={onClose}>
        <Icon name="close" size={22} />
      </Button>
    </div>
  );
}
