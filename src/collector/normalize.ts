import { createHash } from 'node:crypto';

export type Source = 'dou' | 'djinni';

export interface Payload {
  title: string;
  description: string;
  link: string;
  categories: string[];
}

// DOU guid:    https://jobs.dou.ua/companies/acme/vacancies/379802/?1794495304  (?ts = bump time)
// Djinni guid: https://djinni.co/jobs/837440-some-title-slug/                  (slug changes on edit)
const VACANCY_ID_PATTERN: Record<Source, RegExp> = {
  dou: /\/vacancies\/(\d+)\//,
  djinni: /\/jobs\/(\d+)(?:-|\/|$)/,
};

export function externalId(source: Source, guid: string): string {
  const vacancyId = VACANCY_ID_PATTERN[source].exec(guid)?.[1];
  if (vacancyId === undefined) {
    throw new Error(`no vacancy id in ${source} guid: ${guid}`);
  }
  return vacancyId;
}

export function cleanLink(link: string): string {
  const url = new URL(link);
  url.search = '';
  url.hash = '';
  return url.href;
}

function normalizeText(text: string): string {
  return text.normalize('NFC').replaceAll(/\s+/g, ' ').trim();
}

/**
 * Identifies a content version of a vacancy. Leaves out pubDate, guid and the feed on purpose:
 * bumps and multi-category listings must not look like edits (ADR 0001).
 */
export function contentHash(payload: Payload): string {
  // Default sort = UTF-16 code-unit order. Changing it would re-version every stored vacancy.
  const categories = payload.categories.toSorted();
  const parts = [payload.title, payload.description, cleanLink(payload.link), ...categories];
  const canonical = parts.map((part) => normalizeText(part)).join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}
