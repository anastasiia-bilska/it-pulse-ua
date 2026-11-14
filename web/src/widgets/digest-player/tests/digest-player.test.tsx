import { screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { DigestEpisode } from '../../../entities/aggregates/index.ts';
import { LanguageSwitch } from '../../../features/switch-language/index.ts';
import { renderWithLanguage } from '../../../shared/testing/index.ts';
import { DigestPlayer } from '../index.ts';

// ---- constants ---------------------------------------------------------------------------------

const EPISODE: DigestEpisode = {
  week: { label: '2026-W46', firstDay: '2026-11-09', lastDay: '2026-11-15' },
  scripts: { uk: 'Цього тижня 412 вакансій.', en: 'This week brought 412 vacancies.' },
};

// ---- setup -------------------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
});

/** jsdom has no media playback: play() just fires the element's own "play" event. */
function fakePlayback(): void {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
}

function audioSource(): string | null {
  return document.querySelector('audio')?.getAttribute('src') ?? null;
}

// ---- scenarios ---------------------------------------------------------------------------------

test('before the first episode the player says the digest is coming and cannot play', () => {
  renderWithLanguage(<DigestPlayer episode={null} />);

  expect(screen.getByRole('button', { name: 'Відтворення недоступне' })).toBeDisabled();
  expect(screen.getByText('Дайджест скоро')).toBeInTheDocument();
  expect(document.querySelector('audio')).toBeNull();
});

test('an episode plays the latest Ukrainian audio and names its week', () => {
  renderWithLanguage(<DigestPlayer episode={EPISODE} />);

  expect(screen.getByText('Тиждень 9–15 листопада')).toBeInTheDocument();
  expect(audioSource()).toMatch(/releases\/latest\/download\/digest-uk\.mp3$/);
  expect(screen.getByText('Цього тижня 412 вакансій.')).toBeInTheDocument();
});

test('play turns the button into pause', async () => {
  fakePlayback();
  const { user } = renderWithLanguage(<DigestPlayer episode={EPISODE} />);

  await user.click(screen.getByRole('button', { name: 'Відтворити' }));

  expect(screen.getByRole('button', { name: 'Пауза' })).toBeEnabled();
});

test('switching to English switches the audio and the transcript, and stops playback', async () => {
  fakePlayback();
  const { user } = renderWithLanguage(
    <>
      <LanguageSwitch />
      <DigestPlayer episode={EPISODE} />
    </>,
  );
  await user.click(screen.getByRole('button', { name: 'Відтворити' }));

  await user.click(screen.getByRole('button', { name: 'EN' }));

  expect(audioSource()).toMatch(/digest-en\.mp3$/);
  expect(screen.getByText('This week brought 412 vacancies.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
});

test('the trailer, which has no week, is named as the trailer', () => {
  renderWithLanguage(<DigestPlayer episode={{ ...EPISODE, week: null }} />);

  expect(screen.getByText('Трейлер · перший випуск у понеділок')).toBeInTheDocument();
});
