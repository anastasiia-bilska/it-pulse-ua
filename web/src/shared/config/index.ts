// Public API of shared/config: fixed links the page points to.
import type { Language } from '../lib/index.ts';

// ---- constants ---------------------------------------------------------------------------------

export const REPOSITORY_URL = 'https://github.com/anastasiia-bilska/it-pulse-ua';
export const ADR_URL = `${REPOSITORY_URL}/tree/main/docs/adr`;

// ---- functions ---------------------------------------------------------------------------------

/** The newest digest episode: GitHub serves the latest release's files at a stable address. */
export function digestAudioUrl(language: Language): string {
  return `${REPOSITORY_URL}/releases/latest/download/digest-${language}.mp3`;
}
