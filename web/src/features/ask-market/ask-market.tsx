// «Запитай ринок» (ADR 0021): the button opens a modal <dialog> where a reader asks the agent. The
// page only shows the agent's text: numbers, refusals and limits are all decided server-side.
import {
  useId,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { useLanguage } from '../../shared/i18n/index.ts';
import { Button, Icon } from '../../shared/ui/index.ts';
import styles from './ask-market.module.scss';
import { requestAnswer, type AgentReply } from './ask-request.ts';

// ---- types -------------------------------------------------------------------------------------

type AskState =
  | { status: 'idle' }
  | { status: 'asking' }
  | { status: 'answered'; reply: AgentReply }
  | { status: 'offline' };

interface QuestionFormProperties {
  question: string;
  isAsking: boolean;
  onChange: (question: string) => void;
  onAsk: (question: string) => void;
}

// ---- constants ---------------------------------------------------------------------------------

/** The endpoint's own limit; the field stops the reader before the server has to. */
const MAX_QUESTION_CHARS = 300;
/** Replies that are an answer about the market; the rest (limits, errors) look like a notice. */
const ANSWER_KINDS = new Set(['answered', 'insufficient', 'unsupported', 'unknown_skill']);

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
          <h2 id={titleId} className={styles.dialogTitle}>
            {copy.title}
          </h2>
          <Button variant="icon" aria-label={copy.close} onClick={() => dialog.current?.close()}>
            <Icon name="close" size={22} />
          </Button>
        </div>
        <p className={styles.lead}>{copy.lead}</p>
        <AgentConversation />
        <p className={styles.thin}>
          <Icon name="warning" size={20} />
          <span>{copy.thin}</span>
        </p>
      </div>
    </dialog>
  );
}

/** The question form, example questions and the latest reply. */
function AgentConversation(): ReactElement {
  const { messages } = useLanguage();
  const copy = messages.ask;
  const [question, setQuestion] = useState('');
  const { state, ask } = useAgent();
  const isAsking = state.status === 'asking';
  function askAbout(text: string): void {
    setQuestion(text);
    ask(text);
  }
  return (
    <>
      <QuestionForm question={question} isAsking={isAsking} onChange={setQuestion} onAsk={ask} />
      <p className={styles.examplesTitle}>{copy.examplesTitle}</p>
      <ul className={styles.examples}>
        {copy.examples.map((example) => (
          <li key={example}>
            <button
              type="button"
              disabled={isAsking}
              onClick={() => {
                askAbout(example);
              }}
            >
              {example}
            </button>
          </li>
        ))}
      </ul>
      <AgentReplyView state={state} />
    </>
  );
}

function QuestionForm(properties: QuestionFormProperties): ReactElement {
  const { messages } = useLanguage();
  const copy = messages.ask;
  const inputId = useId();
  function submit(event: SyntheticEvent): void {
    event.preventDefault();
    properties.onAsk(properties.question);
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor={inputId} className={styles.label}>
        {copy.label}
      </label>
      <div className={styles.row}>
        <input
          id={inputId}
          className={styles.input}
          value={properties.question}
          placeholder={copy.placeholder}
          maxLength={MAX_QUESTION_CHARS}
          required
          onChange={(event) => {
            properties.onChange(event.target.value);
          }}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={properties.isAsking}
          data-umami-event="ask-market-submit"
        >
          {copy.submit}
        </Button>
      </div>
    </form>
  );
}

/** A polite live region: a screen reader hears "counting…" and then the reply. */
function AgentReplyView({ state }: { state: AskState }): ReactElement {
  const { messages } = useLanguage();
  const copy = messages.ask;
  return (
    <div className={styles.reply} aria-live="polite">
      {state.status === 'asking' && <p className={styles.asking}>{copy.asking}</p>}
      {state.status === 'offline' && <p className={styles.notice}>{copy.offline}</p>}
      {state.status === 'answered' && (
        <p className={ANSWER_KINDS.has(state.reply.kind) ? styles.answer : styles.notice}>
          {state.reply.text}
        </p>
      )}
    </div>
  );
}

function useAgent(): { state: AskState; ask: (question: string) => void } {
  const { language } = useLanguage();
  const [state, setState] = useState<AskState>({ status: 'idle' });
  function ask(question: string): void {
    if (question.trim().length === 0) {
      return;
    }
    setState({ status: 'asking' });
    void fetchReply(question.trim());
  }
  async function fetchReply(question: string): Promise<void> {
    try {
      setState({ status: 'answered', reply: await requestAnswer(question, language) });
    } catch {
      setState({ status: 'offline' });
    }
  }
  return { state, ask };
}
