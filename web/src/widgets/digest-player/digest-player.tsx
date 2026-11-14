// The weekly voice digest (ADR 0013): the latest episode in the page language, with its transcript.
// States follow the UI-kit: paused, playing (the wave fills as it plays) and unavailable.
import { useRef, useState, type ComponentProps, type ReactElement, type RefObject } from 'react';
import type { DigestEpisode } from '../../entities/aggregates/index.ts';
import { digestAudioUrl } from '../../shared/config/index.ts';
import { useLanguage, type Messages } from '../../shared/i18n/index.ts';
import { formatDayRange } from '../../shared/lib/index.ts';
import { Badge, Icon } from '../../shared/ui/index.ts';
import styles from './digest-player.module.scss';

// ---- types -------------------------------------------------------------------------------------

interface PlayerProperties {
  source: string | undefined;
  title: string;
}

interface Playback {
  isPlaying: boolean;
  isBroken: boolean;
  /** 0–1, how much of the episode has played. */
  progress: number;
}

// ---- constants ---------------------------------------------------------------------------------

/** A decorative waveform; heights in % of the bar area. */
const WAVE = [
  30, 55, 40, 75, 60, 90, 45, 70, 100, 65, 35, 80, 50, 95, 60, 40, 85, 55, 70, 30, 65, 90, 45, 75,
  100, 50, 35, 80, 60, 40, 55, 30,
];

const STOPPED: Playback = { isPlaying: false, isBroken: false, progress: 0 };

// ---- functions ---------------------------------------------------------------------------------

/** `episode` is null before the first release, and undefined while the data loads. */
export function DigestPlayer({
  episode,
}: {
  episode: DigestEpisode | null | undefined;
}): ReactElement {
  const { language, messages } = useLanguage();
  const copy = messages.digest;
  const source = episode ? digestAudioUrl(language) : undefined;
  return (
    <section aria-labelledby="digest-title" className={styles.teaser}>
      <div className={styles.text}>
        {!episode && <Badge tone="soonOnAccent">{messages.soon}</Badge>}
        <h2 id="digest-title" className={styles.title}>
          {copy.title}
        </h2>
        <p className={styles.body}>{copy.body}</p>
        {episode && (
          <details className={styles.transcript}>
            <summary>{copy.transcript}</summary>
            <p>{episode.scripts[language]}</p>
            <p className={styles.voice}>{copy.voice}</p>
          </details>
        )}
      </div>
      {/* A new source is a new player: playback state never leaks across languages. */}
      <Player key={source ?? 'none'} source={source} title={playerTitle(episode)} />
    </section>
  );

  function playerTitle(current: DigestEpisode | null | undefined): string {
    if (!current) {
      return copy.comingTitle;
    }
    const { week } = current;
    return week
      ? copy.weekTitle(formatDayRange(week.firstDay, week.lastDay, language))
      : copy.trailerTitle;
  }
}

function Player({ source, title }: PlayerProperties): ReactElement {
  const { messages } = useLanguage();
  const audioElement = useRef<HTMLAudioElement>(null);
  const { playback, audioEvents, toggle } = usePlayback(audioElement);
  const isAvailable = source !== undefined && !playback.isBroken;
  return (
    <div className={isAvailable ? `${styles.player} ${styles.available}` : styles.player}>
      {source && <audio ref={audioElement} src={source} preload="none" {...audioEvents} />}
      <button
        type="button"
        className={styles.play}
        disabled={!isAvailable}
        aria-label={playLabel(messages.digest, isAvailable, playback.isPlaying)}
        onClick={() => void toggle()}
      >
        <Icon name={playback.isPlaying ? 'pause' : 'play'} size={22} />
      </button>
      <Track title={title} progress={playback.progress} />
    </div>
  );
}

function Track({ title, progress }: { title: string; progress: number }): ReactElement {
  const playedBars = Math.round(progress * WAVE.length);
  return (
    <div className={styles.track}>
      <span className={styles.trackTitle}>{title}</span>
      <span className={styles.wave} aria-hidden="true">
        {WAVE.map((height, index) => (
          <span
            key={index}
            className={index < playedBars ? styles.played : undefined}
            style={{ height: `${height}%` }}
          />
        ))}
      </span>
    </div>
  );
}

function playLabel(copy: Messages['digest'], isAvailable: boolean, isPlaying: boolean): string {
  if (!isAvailable) {
    return copy.playUnavailable;
  }
  return isPlaying ? copy.pause : copy.play;
}

/** Play state mirrors the element's own events, so the button never disagrees with the audio. */
function usePlayback(audioElement: RefObject<HTMLAudioElement | null>): {
  playback: Playback;
  audioEvents: ComponentProps<'audio'>;
  toggle: () => Promise<void>;
} {
  const [playback, setPlayback] = useState(STOPPED);
  const audioEvents: ComponentProps<'audio'> = {
    onPlay: () => {
      setPlayback((state) => ({ ...state, isPlaying: true }));
    },
    onPause: () => {
      setPlayback((state) => ({ ...state, isPlaying: false }));
    },
    onError: markBroken,
    onTimeUpdate: (event) => {
      const progress = progressOf(event.currentTarget);
      setPlayback((state) => ({ ...state, progress }));
    },
  };
  return { playback, audioEvents, toggle };

  function markBroken(): void {
    setPlayback({ ...STOPPED, isBroken: true });
  }

  async function toggle(): Promise<void> {
    const element = audioElement.current;
    if (!element?.paused) {
      element?.pause();
      return;
    }
    try {
      await element.play();
    } catch {
      markBroken();
    }
  }
}

function progressOf(element: HTMLAudioElement): number {
  return element.duration > 0 ? element.currentTime / element.duration : 0;
}
