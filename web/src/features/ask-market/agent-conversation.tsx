// The conversation inside «Запитай ринок»: one exchange at a time (the question and the agent's
// reply), the example questions and the form. Numbers, refusals and limits are decided server-side;
// the page only draws them.
import { useId, useState, type ReactElement, type SyntheticEvent } from 'react';
import { useLanguage } from '../../shared/i18n/index.ts';
import { formatNumber } from '../../shared/lib/index.ts';
import { BarList, Button, DotMeter, Icon } from '../../shared/ui/index.ts';
import styles from './ask-market.module.scss';
import { requestAnswer, type AgentReply } from './ask-request.ts';
import { replyBars } from './reply-bars.ts';

// ---- types -------------------------------------------------------------------------------------

type AskState =
  | { status: 'idle' }
  | { status: 'asking'; question: string }
  | { status: 'answered'; question: string; reply: AgentReply }
  | { status: 'offline'; question: string };

type AskedState = Exclude<AskState, { status: 'idle' }>;

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
const ANSWER_KINDS = new Set(['answered', 'unsupported', 'unknown_skill', 'failed']);

// ---- functions ---------------------------------------------------------------------------------

/** Three grid areas of the dialog: the chat, the examples and the form. */
export function AgentConversation(): ReactElement {
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
      {/* A polite live region: a screen reader hears "counting…" and then the reply. */}
      <section className={styles.chat} aria-live="polite" aria-label={copy.title}>
        {state.status === 'idle' ? (
          <p className={styles.empty}>{copy.empty}</p>
        ) : (
          <Exchange state={state} />
        )}
      </section>
      <ExampleQuestions isAsking={isAsking} onAsk={askAbout} />
      <QuestionForm question={question} isAsking={isAsking} onChange={setQuestion} onAsk={ask} />
    </>
  );
}

function ExampleQuestions(properties: {
  isAsking: boolean;
  onAsk: (question: string) => void;
}): ReactElement {
  const copy = useLanguage().messages.ask;
  return (
    <div className={styles.examples}>
      <p className={styles.examplesTitle}>{copy.examplesTitle}</p>
      <ul className={styles.exampleList}>
        {copy.examples.map((example) => (
          <li key={example}>
            <button
              type="button"
              disabled={properties.isAsking}
              onClick={() => {
                properties.onAsk(example);
              }}
            >
              {example}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Exchange({ state }: { state: AskedState }): ReactElement {
  return (
    <>
      <p className={styles.question}>{state.question}</p>
      <div className={styles.agentRow}>
        <span
          className={`${styles.avatar} ${state.status === 'asking' ? styles.thinking : ''}`}
          aria-hidden="true"
        >
          <Icon name="pulse" size={20} />
        </span>
        <div className={styles.agentBody}>
          <AgentReplyView state={state} />
        </div>
      </div>
    </>
  );
}

function AgentReplyView({ state }: { state: AskedState }): ReactElement {
  const { messages } = useLanguage();
  if (state.status === 'asking') {
    // The dots move so a slow answer doesn't look frozen; a screen reader hears only the word.
    return (
      <p className={styles.asking}>
        {messages.ask.asking}
        <span className={styles.typing} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </p>
    );
  }
  if (state.status === 'offline') {
    return <p className={styles.notice}>{messages.ask.offline}</p>;
  }
  const { reply } = state;
  if (reply.kind === 'insufficient') {
    return <ThinReply reply={reply} />;
  }
  if (!ANSWER_KINDS.has(reply.kind)) {
    return <p className={styles.notice}>{reply.text}</p>;
  }
  return <AnswerReply reply={reply} />;
}

/** «Даних замало»: the dots show how far n is from the threshold, as on the salary table. */
function ThinReply({ reply }: { reply: AgentReply }): ReactElement {
  return (
    <div className={styles.thinReply}>
      <p>{reply.text}</p>
      {reply.n !== undefined && reply.minN !== undefined && (
        <DotMeter filled={reply.n} total={reply.minN} />
      )}
    </div>
  );
}

function AnswerReply({ reply }: { reply: AgentReply }): ReactElement {
  const { language } = useLanguage();
  return (
    <>
      <p className={styles.answer}>{reply.text}</p>
      {reply.chart && (
        <div className={styles.chart}>
          <BarList items={replyBars(reply.chart, language)} />
        </div>
      )}
      <ReplyChips reply={reply} />
    </>
  );
}

/** n is on every answer with numbers: the dashboard's promise, kept in the chat too. */
function ReplyChips({ reply }: { reply: AgentReply }): ReactElement | null {
  const { language, messages } = useLanguage();
  if (reply.n === undefined) {
    return null;
  }
  return (
    <ul className={styles.chips}>
      <li>{messages.ask.sample(formatNumber(reply.n, language))}</li>
      {reply.windowDays !== undefined && (
        <li>{messages.ask.window(formatNumber(reply.windowDays, language))}</li>
      )}
    </ul>
  );
}

function QuestionForm(properties: QuestionFormProperties): ReactElement {
  const copy = useLanguage().messages.ask;
  const inputId = useId();
  function submit(event: SyntheticEvent): void {
    event.preventDefault();
    properties.onAsk(properties.question);
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor={inputId} className={styles.visuallyHidden}>
        {copy.label}
      </label>
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
        className={styles.send}
        aria-label={copy.submit}
        disabled={properties.isAsking}
        data-umami-event="ask-market-submit"
      >
        <Icon name="arrowRight" size={20} />
      </Button>
    </form>
  );
}

function useAgent(): { state: AskState; ask: (question: string) => void } {
  const { language } = useLanguage();
  const [state, setState] = useState<AskState>({ status: 'idle' });
  function ask(question: string): void {
    const trimmed = question.trim();
    if (trimmed.length === 0) {
      return;
    }
    setState({ status: 'asking', question: trimmed });
    void fetchReply(trimmed);
  }
  async function fetchReply(question: string): Promise<void> {
    try {
      const reply = await requestAnswer(question, language);
      setState({ status: 'answered', question, reply });
    } catch {
      setState({ status: 'offline', question });
    }
  }
  return { state, ask };
}
