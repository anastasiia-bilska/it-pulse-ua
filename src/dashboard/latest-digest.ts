// The latest audio digest episode for the page (ADR 0013). The dashboard workflow downloads
// digest.json from the latest GitHub Release; locally, or before the first episode, there is none.
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { DigestEpisode } from './aggregates.ts';

// ---- constants ---------------------------------------------------------------------------------

const LATEST_DIGEST = new URL('../../dist/digest-latest/digest.json', import.meta.url);

/** The parts of digest.json the page needs; the facts of a trailer are null. */
const episodeSchema = z.object({
  facts: z.object({ week: z.string(), firstDay: z.string(), lastDay: z.string() }).nullable(),
  scripts: z.object({ uk: z.string().min(1), en: z.string().min(1) }),
});

// ---- functions ---------------------------------------------------------------------------------

export async function readLatestDigest(): Promise<DigestEpisode | null> {
  let text: string;
  try {
    text = await readFile(LATEST_DIGEST, 'utf8');
  } catch {
    return null; // no episode downloaded: the page shows the player as "coming soon"
  }
  return parseDigestEpisode(text);
}

/** A broken file must not stop the dashboard: the player then shows "coming soon". */
export function parseDigestEpisode(text: string): DigestEpisode | null {
  const parsed = episodeSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    console.log('PROBLEM\tdigest.json of the latest release has an unexpected shape');
    return null;
  }
  const { facts, scripts } = parsed.data;
  return {
    week: facts && { label: facts.week, firstDay: facts.firstDay, lastDay: facts.lastDay },
    scripts,
  };
}
