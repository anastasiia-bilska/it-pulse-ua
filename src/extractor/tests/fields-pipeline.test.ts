// Unit tests for everything between the model's answer and the database row.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkEvidence } from '../evidence.ts';
import type { ExtractedFields } from '../fields.ts';
import { toGeminiSchema } from '../gemini.ts';
import { RESPONSE_SCHEMA } from '../prompt.ts';
import { tidyFields } from '../tidy-fields.ts';
import { htmlToText } from '../vacancy-text.ts';

// ---- constants ---------------------------------------------------------------------------------

const NOTHING_STATED: ExtractedFields = {
  role: null,
  seniority: null,
  salary_min: null,
  salary_max: null,
  salary_currency: null,
  salary_period: null,
  salary_quote: null,
  work_format: null,
  locations: [],
  abroad_allowed: null,
  english: null,
  english_quote: null,
  experience_years_min: null,
  experience_quote: null,
  company_type: null,
  domain: null,
  domain_quote: null,
  skills: [],
};

const TEXT = 'Senior Backend Engineer\nЗарплата: $4000 – 5000\nEnglish: Upper-Intermediate';

// ---- vacancy text ------------------------------------------------------------------------------

test('htmlToText keeps paragraphs, drops tags and decodes entities', () => {
  const html = '<p>Stack:&nbsp;<b>Node.js</b> &amp; Postgres</p><ul><li>3+ роки</li></ul>';

  assert.equal(htmlToText(html), 'Stack: Node.js & Postgres\n3+ роки');
});

// ---- evidence ----------------------------------------------------------------------------------

test('a quote found in the text keeps the field and becomes evidence', () => {
  const fields = { ...NOTHING_STATED, english: 'upper' as const, english_quote: 'english: upper' };

  const checked = checkEvidence(fields, TEXT);

  assert.equal(checked.fields.english, 'upper');
  assert.deepEqual(checked.evidence, { english: 'english: upper' });
  assert.deepEqual(checked.dropped, []);
});

test('a salary whose quote is not in the text is dropped as a whole', () => {
  const fields: ExtractedFields = {
    ...NOTHING_STATED,
    salary_min: 7000,
    salary_max: 9000,
    salary_currency: 'USD',
    salary_period: 'month',
    salary_quote: '$7000 – 9000',
  };

  const checked = checkEvidence(fields, TEXT);

  assert.equal(checked.fields.salary_min, null);
  assert.equal(checked.fields.salary_currency, null);
  assert.equal(checked.fields.salary_period, null);
  assert.deepEqual(checked.dropped, ['salary']);
});

test('a stated field without any quote is dropped', () => {
  const fields: ExtractedFields = { ...NOTHING_STATED, domain: 'fintech', domain_quote: null };

  assert.deepEqual(checkEvidence(fields, TEXT).dropped, ['domain']);
});

// ---- tidying -----------------------------------------------------------------------------------

test('tidy swaps a reversed range and assumes a monthly period', () => {
  const fields: ExtractedFields = {
    ...NOTHING_STATED,
    salary_min: 5000,
    salary_max: 4000,
    salary_currency: 'USD',
  };

  const tidy = tidyFields(fields);

  assert.deepEqual([tidy.salary_min, tidy.salary_max, tidy.salary_period], [4000, 5000, 'month']);
});

test('tidy drops an amount without a currency', () => {
  const tidy = tidyFields({ ...NOTHING_STATED, salary_min: 3000, salary_quote: '3000' });

  assert.deepEqual([tidy.salary_min, tidy.salary_quote], [null, null]);
});

test('tidy merges duplicate skills; required wins', () => {
  const tidy = tidyFields({
    ...NOTHING_STATED,
    skills: [
      { name: 'Python', required: false },
      { name: 'python ', required: true },
      { name: 'Docker', required: false },
    ],
  });

  assert.deepEqual(tidy.skills, [
    { name: 'Python', required: true },
    { name: 'Docker', required: false },
  ]);
});

// ---- response schema ---------------------------------------------------------------------------

test('nullable enums become type arrays with null among the values', () => {
  const converted = toGeminiSchema({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { level: { anyOf: [{ type: 'string', enum: ['a', 'b'] }, { type: 'null' }] } },
  });

  assert.deepEqual(converted, {
    type: 'object',
    properties: { level: { type: ['string', 'null'], enum: ['a', 'b', null] } },
  });
});

test('the schema sent to Gemini uses no anyOf and no $schema anywhere', () => {
  const serialized = JSON.stringify(RESPONSE_SCHEMA);

  assert.ok(!serialized.includes('anyOf'));
  assert.ok(!serialized.includes('$schema'));
});
