// CLI entry point of the weekly audio digest (GitHub Actions, Mondays; ADR 0013).
import type pg from 'pg';
import { GEMINI_BASE_URL, MODEL } from '../extractor/index.ts';
import { tracerFromEnvironment } from '../observability/index.ts';
import { runScheduledJob } from '../shared/index.ts';
import { ELEVENLABS_BASE_URL } from './elevenlabs.ts';
import { parseIsoWeek, previousIsoWeek, type IsoWeek } from './iso-week.ts';
import { produceDigest } from './produce-digest.ts';

// ---- constants ---------------------------------------------------------------------------------

/**
 * The library voice for both languages, chosen by the owner from samples. Empty until chosen: the
 * job then fails loudly instead of speaking with a random voice.
 */
const VOICE_ID = '';
const OUTPUT_DIRECTORY = new URL('../../dist/digest/', import.meta.url);

// ---- functions ---------------------------------------------------------------------------------

async function digest(db: pg.Client): Promise<string[]> {
  const tracer = tracerFromEnvironment();
  try {
    return await produceDigest(db, {
      week: weekToReport(),
      gemini: {
        apiKey: requiredEnvironment('GEMINI_API_KEY'),
        model: MODEL,
        baseUrl: process.env.GEMINI_BASE_URL ?? GEMINI_BASE_URL,
      },
      elevenLabs: {
        apiKey: requiredEnvironment('ELEVENLABS_API_KEY'),
        voiceId: process.env.ELEVENLABS_VOICE_ID ?? requiredVoice(),
        baseUrl: process.env.ELEVENLABS_BASE_URL ?? ELEVENLABS_BASE_URL,
      },
      tracer,
      outputDirectory: OUTPUT_DIRECTORY,
    });
  } finally {
    await tracer.flush();
  }
}

/** DIGEST_WEEK ("2026-W46") comes from a manual run; by default, the week that just ended. */
function weekToReport(): IsoWeek {
  const label = process.env.DIGEST_WEEK;
  return label ? parseIsoWeek(label) : previousIsoWeek(new Date());
}

function requiredVoice(): string {
  const voiceId: string = VOICE_ID;
  if (!voiceId) {
    throw new Error('VOICE_ID is not chosen yet (ADR 0013)');
  }
  return voiceId;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

// ---- entry point -------------------------------------------------------------------------------

await runScheduledJob('digest', digest);
