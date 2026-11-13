import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BLIND_SIZE, SAMPLE_SIZE, sampleEvalSet, type Candidate } from '../index.ts';

// ---- constants ---------------------------------------------------------------------------------

const ROLES = ['backend', 'frontend', 'qa', 'devops', 'design', 'hr', null];
const SENIORITIES = ['junior', 'middle', 'senior', null];
const POPULATION_SIZE = 600;

/** Synthetic: every 7th mentions a salary, every 11th is in English. */
const POPULATION: Candidate[] = Array.from({ length: POPULATION_SIZE }, (empty, index) => ({
  rawItemId: String(index + 1),
  source: index % 5 === 0 ? 'djinni' : 'dou',
  role: ROLES[index % ROLES.length] ?? null,
  seniority: SENIORITIES[index % SENIORITIES.length] ?? null,
  text: syntheticText(index),
}));

// ---- functions ---------------------------------------------------------------------------------

function syntheticText(index: number): string {
  const salary = index % 7 === 0 ? ' Зарплата $3000.' : '';
  return index % 11 === 0
    ? `Synthetic engineer vacancy number ${index}.${salary}`
    : `Синтетична вакансія номер ${index}.${salary}`;
}

function ids(sample: ReturnType<typeof sampleEvalSet>): string[] {
  return sample.map((sampled) => sampled.candidate.rawItemId).toSorted();
}

// ---- scenarios ---------------------------------------------------------------------------------

test('picks 150 vacancies, 30 of them for blind labelling', () => {
  const sample = sampleEvalSet(POPULATION);

  assert.equal(sample.length, SAMPLE_SIZE);
  assert.equal(sample.filter((sampled) => sampled.labelling === 'blind').length, BLIND_SIZE);
  assert.equal(new Set(ids(sample)).size, SAMPLE_SIZE, 'no duplicates');
});

test('hard cases are oversampled: 40 with a salary', () => {
  const sample = sampleEvalSet(POPULATION);

  assert.equal(sample.filter((sampled) => sampled.reason === 'salary').length, 40);
});

test('every stratum gets in before any stratum gets a second vacancy', () => {
  const strata = new Set(POPULATION.map((each) => `${each.source}/${each.role}/${each.seniority}`));

  const sampled = new Set(
    sampleEvalSet(POPULATION).map(
      ({ candidate }) => `${candidate.source}/${candidate.role}/${candidate.seniority}`,
    ),
  );

  assert.equal(sampled.size, strata.size);
});

test('the sample is reproducible whatever the input order', () => {
  assert.deepEqual(ids(sampleEvalSet(POPULATION)), ids(sampleEvalSet(POPULATION.toReversed())));
});

test('a population smaller than the sample is taken whole', () => {
  assert.equal(sampleEvalSet(POPULATION.slice(0, 40)).length, 40);
});
