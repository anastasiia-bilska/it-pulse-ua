// One episode: facts → scripts → speech → files in dist/digest, which the workflow publishes as a
// GitHub Release (ADR 0013). Returns the problems for healthchecks; logs carry counts only.
import { mkdir, writeFile } from 'node:fs/promises';
import type pg from 'pg';
import { QuotaExhaustedError, type GeminiConfig } from '../extractor/index.ts';
import type { Tracer } from '../observability/index.ts';
import { readUsage, synthesize, type ElevenLabsConfig } from './elevenlabs.ts';
import type { IsoWeek } from './iso-week.ts';
import { writeScripts, type Scripts } from './script.ts';
import { loadWeeklyFacts, type WeeklyFacts } from './weekly-facts.ts';

// ---- types -------------------------------------------------------------------------------------

export interface DigestOptions {
  week: IsoWeek;
  gemini: GeminiConfig;
  elevenLabs: ElevenLabsConfig;
  tracer: Tracer;
  outputDirectory: URL;
}

// ---- constants ---------------------------------------------------------------------------------

/** ADR 0005: warn while there is still a month's margin to react. */
const QUOTA_WARNING_SHARE = 0.8;
const PERCENT = 100;

// ---- functions ---------------------------------------------------------------------------------

export async function produceDigest(db: pg.Client, options: DigestOptions): Promise<string[]> {
  const facts = await loadWeeklyFacts(db, options.week);
  console.log(
    `week=${facts.week} vacancies=${facts.newVacancies.thisWeek} analysed=${facts.analysedPercent}%`,
  );
  if (facts.newVacancies.thisWeek === 0) {
    return [`digest ${facts.week}: no vacancies this week, nothing to say`];
  }
  const scripts = await scriptsOrProblem(options, facts);
  if (typeof scripts === 'string') {
    return [scripts];
  }
  const usage = await readUsage(options.elevenLabs);
  const needed = scripts.uk.length + scripts.en.length;
  if (usage && usage.used + needed > usage.limit) {
    return [`digest ${facts.week}: ElevenLabs quota left ${usage.limit - usage.used} < ${needed}`];
  }
  await writeEpisode(options, facts, scripts);
  return usage ? quotaProblems(usage.used + needed, usage.limit) : [];
}

/** The scripts, or the reason there are none: a quota stop or a rejection is not a crash. */
async function scriptsOrProblem(
  options: DigestOptions,
  facts: WeeklyFacts,
): Promise<Scripts | string> {
  try {
    const result = await writeScripts(options.gemini, facts, options.tracer);
    return result.kind === 'accepted'
      ? result.scripts
      : `digest ${facts.week}: script rejected (${result.reason})`;
  } catch (error) {
    if (error instanceof QuotaExhaustedError) {
      return `digest ${facts.week}: Gemini quota exhausted, no episode`;
    }
    throw error;
  }
}

/** digest.json is written last: the workflow publishes only when it exists. */
async function writeEpisode(
  options: DigestOptions,
  facts: WeeklyFacts,
  scripts: Scripts,
): Promise<void> {
  const directory = options.outputDirectory;
  await mkdir(directory, { recursive: true });
  for (const language of ['uk', 'en'] as const) {
    const audio = await synthesize(options.elevenLabs, scripts[language]);
    await writeFile(new URL(`digest-${language}.mp3`, directory), audio);
  }
  await writeFile(new URL('notes.md', directory), releaseNotes(scripts));
  await writeFile(new URL('digest.json', directory), JSON.stringify({ facts, scripts }, null, 2));
  console.log(`episode=${facts.week} chars_uk=${scripts.uk.length} chars_en=${scripts.en.length}`);
}

function releaseNotes(scripts: Scripts): string {
  return `## Українською\n\n${scripts.uk}\n\n## In English\n\n${scripts.en}\n\nVoice: ElevenLabs.\n`;
}

function quotaProblems(used: number, limit: number): string[] {
  const share = used / limit;
  return share >= QUOTA_WARNING_SHARE
    ? [`ElevenLabs quota at ${Math.round(share * PERCENT)}% (${used} of ${limit} characters)`]
    : [];
}
