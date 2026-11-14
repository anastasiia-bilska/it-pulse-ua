// Public API of shared/config: fixed links the page points to.
import type { Language } from '../lib/index.ts';

// ---- constants ---------------------------------------------------------------------------------

export const REPOSITORY_URL = 'https://github.com/anastasiia-bilska/it-pulse-ua';
export const ADR_URL = `${REPOSITORY_URL}/tree/main/docs/adr`;
/** The job boards the data comes from, linked wherever the copy names them. */
export const SOURCE_URLS = {
  DOU: 'https://jobs.dou.ua/',
  Djinni: 'https://djinni.co/jobs/',
} as const;
/** Umami Cloud site ID (ADR 0019). Public by design: it is in the page source anyway. */
export const UMAMI_WEBSITE_ID = 'TODO-umami-website-id';

// ---- functions ---------------------------------------------------------------------------------

/**
 * The newest digest episode. The dashboard build copies it next to the page: GitHub serves release
 * files as octet-stream downloads, which iOS Safari will not play. Dev has no build, so it plays
 * the release directly (fine in desktop browsers).
 */
export function digestAudioUrl(language: Language): string {
  const file = `digest-${language}.mp3`;
  return import.meta.env.DEV
    ? `${REPOSITORY_URL}/releases/latest/download/${file}`
    : `digest/${file}`;
}
