// ADR 0022: every length goes through rem(). A raw px in a stylesheet fails here, not in review.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

// ---- constants ---------------------------------------------------------------------------------

const WEB_SOURCE = path.join(import.meta.dirname, '../../..');

/** Files allowed to spell px: the helper that converts it. */
const UNIT_HELPER = '_units.scss';

/** rem(…) calls and comments may hold px; anything else may not. */
const ALLOWED_PX = /rem\([^)]*\)|\/\/.*$|\/\*[\s\S]*?\*\//gm;

const RAW_PX = /(?<![\w.])-?\d*\.?\d+px\b/;

// ---- tests -------------------------------------------------------------------------------------

test('no stylesheet has a raw px length outside rem()', () => {
  const offenders = stylesheets()
    .filter((file) => !file.endsWith(UNIT_HELPER))
    .flatMap((file) => rawPxLines(file));

  assert.deepEqual(offenders, []);
});

// ---- functions ---------------------------------------------------------------------------------

function stylesheets(): string[] {
  return readdirSync(WEB_SOURCE, { recursive: true, encoding: 'utf8' })
    .filter((relative) => relative.endsWith('.scss'))
    .map((relative) => path.join(WEB_SOURCE, relative));
}

function rawPxLines(file: string): string[] {
  const code = readFileSync(file, 'utf8').replaceAll(ALLOWED_PX, '');
  return code
    .split('\n')
    .filter((line) => RAW_PX.test(line))
    .map((line) => `${file}: ${line.trim()}`);
}
