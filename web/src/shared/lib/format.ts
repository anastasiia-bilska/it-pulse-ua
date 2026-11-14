// Number and date formatting for the page, per language. Pure, so node --test covers it.

// ---- types -------------------------------------------------------------------------------------

export type Language = 'uk' | 'en';

// ---- constants ---------------------------------------------------------------------------------

export const LANGUAGES: readonly Language[] = ['uk', 'en'];

const LOCALES: Record<Language, string> = { uk: 'uk-UA', en: 'en-GB' };
/** Every date on the page is Kyiv time: that is when the pipeline runs and readers live. */
const TIME_ZONE = 'Europe/Kyiv';

// ---- functions ---------------------------------------------------------------------------------

export function formatNumber(value: number, language: Language): string {
  return new Intl.NumberFormat(LOCALES[language]).format(value);
}

/** A share of 0–1 as a percentage with one decimal: 0.429 → "42,9%". */
export function formatShare(share: number, language: Language): string {
  return new Intl.NumberFormat(LOCALES[language], {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(share);
}

/** "$1 475": the design keeps the dollar sign in front in both languages. */
export function formatUsd(value: number, language: Language): string {
  return `$${formatNumber(value, language)}`;
}

/** "13 лист., 23:42" in Kyiv time. */
export function formatDateTime(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

/** part / whole, or 0 for an empty whole, so a bar never gets NaN as its width. */
export function fractionOf(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

/** A fraction as a CSS percentage, clamped so bad data can't overflow its track. */
export function toPercent(fraction: number): string {
  return `${Math.min(1, Math.max(0, fraction)) * 100}%`;
}
