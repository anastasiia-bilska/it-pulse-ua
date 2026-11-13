import { createHash } from 'node:crypto';

export type Source = 'dou' | 'djinni';

export interface Payload {
  title: string;
  description: string;
  link: string;
  categories: string[];
}

// DOU guid: https://jobs.dou.ua/companies/acme/vacancies/379802/?1794495304  (?ts = bump time)
// Djinni guid: https://djinni.co/jobs/837440-some-title-slug/                 (slug changes on edit)
const ID_RE: Record<Source, RegExp> = {
  dou: /\/vacancies\/(\d+)\//,
  djinni: /\/jobs\/(\d+)(?:-|\/|$)/,
};

export function externalId(source: Source, guid: string): string {
  const m = guid.match(ID_RE[source]);
  if (!m) throw new Error(`no vacancy id in ${source} guid: ${guid}`);
  return m[1];
}

export function cleanLink(link: string): string {
  const u = new URL(link);
  u.search = '';
  u.hash = '';
  return u.toString();
}

const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

// Excludes pubDate, guid and source feed: bumps and multi-category listings must not create new versions.
export function contentHash(p: Payload): string {
  const parts = [p.title, p.description, cleanLink(p.link), ...[...p.categories].sort()].map(norm);
  return createHash('sha256').update(parts.join('\n')).digest('hex');
}
