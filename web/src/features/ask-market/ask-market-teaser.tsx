// "Ask the market" is the coming AI agent. Until it ships, the button opens a modal <dialog> that
// says what the agent will do, never a link to a screen that doesn't exist yet. No sample answers:
// their numbers would be invented, and nothing on the page may be.
import { useId, useRef, type ReactElement, type RefObject } from 'react';
import { useLanguage } from '../../shared/i18n/index.ts';
import { Badge, Button, Icon } from '../../shared/ui/index.ts';
import styles from './ask-market-teaser.module.scss';

// ---- functions ---------------------------------------------------------------------------------

/** pill: header nav; block: hero on phones; card: the mobile menu. */
export function AskMarketTeaser({ look }: { look: 'pill' | 'block' | 'card' }): ReactElement {
  const { messages } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        className={`${styles.teaser} ${styles[look]}`}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <Icon name="chat" size={look === 'card' ? 24 : 18} />
        <span className={styles.text}>
          <span className={styles.title}>{messages.ask.title}</span>
          {look === 'card' && <span className={styles.hint}>{messages.ask.hint}</span>}
        </span>
        <Badge tone="soonOnAccent">{messages.soon}</Badge>
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
  const { messages } = useLanguage();
  const copy = messages.ask;
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
      <div className={styles.dialogBody}>
        <div className={styles.dialogTop}>
          <Badge tone="soon">{messages.soon}</Badge>
          <Button variant="icon" aria-label={copy.close} onClick={() => dialog.current?.close()}>
            <Icon name="close" size={22} />
          </Button>
        </div>
        <AgentPromise titleId={titleId} />
      </div>
    </dialog>
  );
}

/** What the agent will do, with example questions and the "not enough data" rule. */
function AgentPromise({ titleId }: { titleId: string }): ReactElement {
  const { messages } = useLanguage();
  const copy = messages.ask;
  return (
    <>
      <h2 id={titleId} className={styles.dialogTitle}>
        {copy.title}
      </h2>
      <p className={styles.lead}>{copy.lead}</p>
      <p className={styles.examplesTitle}>{copy.examplesTitle}</p>
      <ul className={styles.examples}>
        {copy.examples.map((example) => (
          <li key={example}>{example}</li>
        ))}
      </ul>
      <p className={styles.thin}>
        <Icon name="warning" size={20} />
        <span>{copy.thin}</span>
      </p>
    </>
  );
}
