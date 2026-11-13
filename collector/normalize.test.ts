import { test } from 'node:test';
import assert from 'node:assert/strict';
import { externalId, contentHash, cleanLink } from './normalize.ts';

// Synthetic fixtures only: never commit real vacancy text.
const base = {
  title: 'Middle Test Engineer в Acme',
  description: '<p>Synthetic   text</p>',
  link: 'https://jobs.dou.ua/companies/acme/vacancies/111/?utm_source=jobsrss',
  categories: [],
};

test('dou id ignores bump timestamp', () => {
  assert.equal(externalId('dou', 'https://jobs.dou.ua/companies/acme/vacancies/111/?1794495304'), '111');
  assert.equal(externalId('dou', 'https://jobs.dou.ua/companies/acme/vacancies/111/?1794499999'), '111');
});

test('djinni id ignores slug', () => {
  assert.equal(externalId('djinni', 'https://djinni.co/jobs/222-old-title/'), '222');
  assert.equal(externalId('djinni', 'https://djinni.co/jobs/222-new-title-slug/'), '222');
  assert.throws(() => externalId('djinni', 'https://djinni.co/jobs/'));
});

test('hash ignores utm, whitespace and category order', () => {
  const h = contentHash(base);
  assert.equal(contentHash({ ...base, link: 'https://jobs.dou.ua/companies/acme/vacancies/111/' }), h);
  assert.equal(contentHash({ ...base, description: '<p>Synthetic text</p>\n' }), h);
  const c = { ...base, categories: ['Python', 'AI/ML'] };
  assert.equal(contentHash({ ...c, categories: ['AI/ML', 'Python'] }), contentHash(c));
});

test('hash changes when content changes', () => {
  assert.notEqual(contentHash({ ...base, title: 'Senior Test Engineer в Acme' }), contentHash(base));
  assert.notEqual(contentHash({ ...base, categories: ['Python'] }), contentHash(base));
});

test('cleanLink strips query', () => {
  assert.equal(cleanLink(base.link), 'https://jobs.dou.ua/companies/acme/vacancies/111/');
});
