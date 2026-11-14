// Puts what the dashboard workflow adds to a production build into dist/site, from synthetic
// fixtures: aggregates.json and the digest audio. Runs after every `build:web` (it empties the dir).
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { SAMPLE_AGGREGATES } from '../src/entities/aggregates/testing.ts';

// ---- constants ---------------------------------------------------------------------------------

const SITE = new URL('../../dist/site/', import.meta.url);
/** About four seconds of silent MP3 frames: long enough to still be playing when a test looks. */
const SILENT_MP3 = new URL('fixtures/silence.mp3', import.meta.url);
const DIGEST_FILES = ['digest-uk.mp3', 'digest-en.mp3'];

// ---- entry point -------------------------------------------------------------------------------

await writeFile(new URL('aggregates.json', SITE), JSON.stringify(SAMPLE_AGGREGATES));
const digestDirectory = new URL('digest/', SITE);
await mkdir(digestDirectory, { recursive: true });
for (const file of DIGEST_FILES) {
  await copyFile(SILENT_MP3, new URL(file, digestDirectory));
}
