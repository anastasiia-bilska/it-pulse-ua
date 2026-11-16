// Turns an RSS payload into the plain text the model reads and the evidence check searches.
import type { Payload } from '../collector/index.ts';

// ---- constants ---------------------------------------------------------------------------------

/** Bounds tokens per call; real vacancies are far shorter, this only stops pathological ones. */
const MAX_TEXT_LENGTH = 12_000;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  laquo: '«',
  raquo: '»',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

const BLOCK_TAG = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|table|section)\b[^>]*>/gi;
const ANY_TAG = /<[^>]*>/g;
const ENTITY = /&(#x[\da-f]+|#\d+|[a-z]+);/gi;
const MAX_CODE_POINT = 0x10_ff_ff;

// ---- functions ---------------------------------------------------------------------------------

export function vacancyText(payload: Payload): string {
  const text = `${payload.title}\n\n${htmlToText(payload.description)}`;
  return text.slice(0, MAX_TEXT_LENGTH);
}

/**
 * Good enough for RSS descriptions: block tags become line breaks, other tags vanish, entities
 * are decoded. ponytail: regex, not an HTML parser; swap in one if descriptions get exotic.
 */
export function htmlToText(html: string): string {
  return html
    .replaceAll(BLOCK_TAG, '\n')
    .replaceAll(ANY_TAG, '')
    .replaceAll(ENTITY, (entity, code: string) => decodeEntity(code) ?? entity)
    .replaceAll(/[ \t]+/g, ' ')
    .replaceAll(/\s*\n\s*/g, '\n')
    .trim();
}

function decodeEntity(code: string): string | undefined {
  if (code.startsWith('#x') || code.startsWith('#X')) {
    return codePointToText(Number.parseInt(code.slice(2), 16));
  }
  if (code.startsWith('#')) {
    return codePointToText(Number(code.slice(1)));
  }
  return NAMED_ENTITIES[code.toLowerCase()];
}

/** `&#99999999;` is no character: keep it as text instead of failing the whole vacancy. */
function codePointToText(codePoint: number): string | undefined {
  return codePoint <= MAX_CODE_POINT ? String.fromCodePoint(codePoint) : undefined;
}
