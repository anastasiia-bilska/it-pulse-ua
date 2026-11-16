// The weekly voice digest (ADR 0013): the latest episode in the page language, with its transcript.
// States follow the UI-kit: paused, playing (the wave fills as it plays) and unavailable.
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type RefObject,
  type SyntheticEvent,
} from 'react';
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
}

// ---- constants ---------------------------------------------------------------------------------

/** A decorative waveform; heights in % of the bar area. */
const WAVE = [
  30, 55, 40, 75, 60, 90, 45, 70, 100, 65, 35, 80, 50, 95, 60, 40, 85, 55, 70, 30, 65, 90, 45, 75,
  100, 50, 35, 80, 60, 40, 55, 30,
];

const STOPPED: Playback = { isPlaying: false, isBroken: false };

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
    <section data-block="digest" aria-labelledby="digest-title" className={styles.teaser}>
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
          </details>
        )}
        {episode && <p className={styles.voice}>{copy.voice}</p>}
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
  const wave = useRef<HTMLSpanElement>(null);
  const { playback, audioEvents, toggle } = usePlayback(audioElement, wave);
  useSmoothProgress(audioElement, wave, playback.isPlaying);
  const isAvailable = source !== undefined && !playback.isBroken;
  return (
    <div className={isAvailable ? `${styles.player} ${styles.available}` : styles.player}>
      {source && <audio ref={audioElement} src={source} preload="none" {...audioEvents} />}
      <button
        type="button"
        className={styles.play}
        disabled={!isAvailable}
        aria-label={playLabel(messages.digest, isAvailable, playback.isPlaying)}
        data-umami-event={playback.isPlaying ? 'digest-pause' : 'digest-play'}
        onClick={() => void toggle()}
      >
        <Icon name={isAvailable && playback.isPlaying ? 'pause' : 'play'} size={22} />
      </button>
      <div className={styles.track}>
        <span className={styles.trackTitle}>{title}</span>
        {/* The bright copy of the wave is revealed by --progress: no per-bar jumps. */}
        <span ref={wave} className={styles.wave} aria-hidden="true">
          <Bars />
          <span className={styles.playedLayer}>
            <Bars />
          </span>
        </span>
      </div>
    </div>
  );
}

function Bars(): ReactElement {
  return (
    <span className={styles.bars}>
      {WAVE.map((height, index) => (
        <span key={index} style={{ height: `${height}%` }} />
      ))}
    </span>
  );
}

function playLabel(copy: Messages['digest'], isAvailable: boolean, isPlaying: boolean): string {
  if (!isAvailable) {
    return copy.playUnavailable;
  }
  return isPlaying ? copy.pause : copy.play;
}

/** Play state mirrors the element's own events, so the button never disagrees with the audio. */
function usePlayback(
  audioElement: RefObject<HTMLAudioElement | null>,
  wave: RefObject<HTMLSpanElement | null>,
): {
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
      paintProgress(wave.current, event.currentTarget);
    },
    onEnded: rewind,
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

/** While playing, repaint the wave every frame: timeupdate fires only about 4 times a second. */
function useSmoothProgress(
  audioElement: RefObject<HTMLAudioElement | null>,
  wave: RefObject<HTMLSpanElement | null>,
  isPlaying: boolean,
): void {
  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    let frame = requestAnimationFrame(paint);
    function paint(): void {
      if (audioElement.current) {
        paintProgress(wave.current, audioElement.current);
      }
      frame = requestAnimationFrame(paint);
    }
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [audioElement, wave, isPlaying]);
}

/** A finished episode rewinds, so the wave doesn't stay fully lit (timeupdate repaints it). */
function rewind(event: SyntheticEvent<HTMLAudioElement>): void {
  event.currentTarget.currentTime = 0;
}

/**
 * Writes the CSS variable directly: a React render per frame would be wasted work. Called every
 * frame while playing, and on timeupdate for paused seeks and the rewind.
 */
function paintProgress(wave: HTMLSpanElement | null, element: HTMLAudioElement): void {
  const fraction = element.duration > 0 ? element.currentTime / element.duration : 0;
  wave?.style.setProperty('--progress', String(fraction));
}
