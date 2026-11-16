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
import { formatDayRange, type Language } from '../../shared/lib/index.ts';
import { Badge, Icon } from '../../shared/ui/index.ts';
import styles from './digest-player.module.scss';

// ---- types -------------------------------------------------------------------------------------

interface PlayerProperties {
  source: string | undefined;
  title: string;
}

/** What paintProgress repaints: the lit part of the wave and the seek slider over it. */
interface ProgressView {
  wave: RefObject<HTMLSpanElement | null>;
  seek: RefObject<HTMLInputElement | null>;
}

interface Playback {
  isPlaying: boolean;
  isBroken: boolean;
}

interface PlaybackControls {
  playback: Playback;
  audioEvents: ComponentProps<'audio'>;
  toggle: () => Promise<void>;
}

// ---- constants ---------------------------------------------------------------------------------

/** A decorative waveform; heights in % of the bar area. */
const WAVE = [
  30, 55, 40, 75, 60, 90, 45, 70, 100, 65, 35, 80, 50, 95, 60, 40, 85, 55, 70, 30, 65, 90, 45, 75,
  100, 50, 35, 80, 60, 40, 55, 30,
];

const STOPPED: Playback = { isPlaying: false, isBroken: false };

/** The speed button cycles through these, back to normal after the slowest. */
const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

const SECONDS_PER_MINUTE = 60;

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
  const seek = useRef<HTMLInputElement>(null);
  const view: ProgressView = { wave, seek };
  const { playback, audioEvents, toggle } = usePlayback(audioElement, view);
  useSmoothProgress(audioElement, view, playback.isPlaying);
  const isAvailable = source !== undefined && !playback.isBroken;
  return (
    <div className={isAvailable ? `${styles.player} ${styles.available}` : styles.player}>
      {/* Metadata up front: the seek slider needs the duration before the first play. */}
      {source && <audio ref={audioElement} src={source} preload="metadata" {...audioEvents} />}
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
        <span className={styles.trackHeader}>
          <span className={styles.trackTitle}>{title}</span>
          <SpeedButton audioElement={audioElement} isDisabled={!isAvailable} />
        </span>
        <Scrubber
          wave={wave}
          seek={seek}
          isDisabled={!isAvailable}
          onSeek={(seconds) => {
            seekTo(audioElement.current, view, seconds);
          }}
        />
      </div>
    </div>
  );
}

/**
 * The wave is the seek bar: a transparent native range on top of it gives click, drag, touch and
 * the arrow keys for free. paintProgress keeps its max, value and spoken text in step.
 */
function Scrubber({
  wave,
  seek,
  isDisabled,
  onSeek,
}: ProgressView & { isDisabled: boolean; onSeek: (seconds: number) => void }): ReactElement {
  const { messages } = useLanguage();
  return (
    <span ref={wave} className={styles.wave}>
      {/* The bright copy of the wave is revealed by --progress: no per-bar jumps. */}
      <Bars />
      <span className={styles.playedLayer}>
        <Bars />
      </span>
      {/* max starts at 0 and paintProgress sets it from the audio; React never rewrites it. */}
      <input
        ref={seek}
        type="range"
        className={styles.seek}
        min={0}
        max={0}
        step="any"
        defaultValue={0}
        disabled={isDisabled}
        aria-label={messages.digest.seek}
        onChange={(event) => {
          onSeek(event.currentTarget.valueAsNumber);
        }}
      />
    </span>
  );
}

function SpeedButton({
  audioElement,
  isDisabled,
}: {
  audioElement: RefObject<HTMLAudioElement | null>;
  isDisabled: boolean;
}): ReactElement {
  const { language, messages } = useLanguage();
  const [speed, setSpeed] = useState(SPEEDS[0] ?? 1);
  const shown = formatSpeed(speed, language);
  return (
    <button
      type="button"
      className={styles.speed}
      disabled={isDisabled}
      aria-label={messages.digest.speed(shown)}
      onClick={changeSpeed}
    >
      {shown}
    </button>
  );

  function changeSpeed(): void {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1;
    setSpeed(next);
    const element = audioElement.current;
    if (!element) {
      return;
    }
    // The default rate survives a reload of the source; the current rate alone would not.
    element.defaultPlaybackRate = next;
    element.playbackRate = next;
  }
}

function Bars(): ReactElement {
  return (
    <span className={styles.bars} aria-hidden="true">
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
  view: ProgressView,
): PlaybackControls {
  const [playback, setPlayback] = useState(STOPPED);
  const audioEvents: ComponentProps<'audio'> = {
    onPlay: () => {
      setPlayback((state) => ({ ...state, isPlaying: true }));
    },
    onPause: () => {
      setPlayback((state) => ({ ...state, isPlaying: false }));
    },
    onError: markBroken,
    onTimeUpdate: repaint,
    onDurationChange: repaint,
    onEnded: rewind,
  };
  return { playback, audioEvents, toggle };

  function repaint(event: SyntheticEvent<HTMLAudioElement>): void {
    paintProgress(view, event.currentTarget);
  }

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
  view: ProgressView,
  isPlaying: boolean,
): void {
  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    let frame = requestAnimationFrame(paint);
    function paint(): void {
      if (audioElement.current) {
        paintProgress(view, audioElement.current);
      }
      frame = requestAnimationFrame(paint);
    }
    return () => {
      cancelAnimationFrame(frame);
    };
    // view is a fresh object each render, but its refs are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioElement, isPlaying]);
}

function seekTo(element: HTMLAudioElement | null, view: ProgressView, seconds: number): void {
  if (!element) {
    return;
  }
  element.currentTime = seconds;
  paintProgress(view, element);
}

/** A finished episode rewinds, so the wave doesn't stay fully lit (timeupdate repaints it). */
function rewind(event: SyntheticEvent<HTMLAudioElement>): void {
  event.currentTarget.currentTime = 0;
}

/**
 * Writes to the DOM directly: a React render per frame would be wasted work. Called every frame
 * while playing, and on timeupdate, durationchange and seeks while paused.
 */
function paintProgress(view: ProgressView, element: HTMLAudioElement): void {
  const duration = Number.isFinite(element.duration) ? element.duration : 0;
  const fraction = duration > 0 ? element.currentTime / duration : 0;
  view.wave.current?.style.setProperty('--progress', String(fraction));
  const seek = view.seek.current;
  if (!seek) {
    return;
  }
  seek.max = String(duration);
  seek.value = String(element.currentTime);
  seek.setAttribute(
    'aria-valuetext',
    `${formatClock(element.currentTime)} / ${formatClock(duration)}`,
  );
}

/** 83 → "1:23". */
function formatClock(totalSeconds: number): string {
  const seconds = Math.floor(totalSeconds);
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const rest = String(seconds % SECONDS_PER_MINUTE).padStart(2, '0');
  return `${String(minutes)}:${rest}`;
}

/** 1.25 → "1,25×" in Ukrainian, "1.25×" in English. */
function formatSpeed(speed: number, language: Language): string {
  return `${speed.toLocaleString(language)}×`;
}
