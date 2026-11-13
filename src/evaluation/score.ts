// Scores model answers against labels (ADR 0012). Pure: no model, no network, no I/O.
import type { ExtractedFields } from '../extractor/index.ts';
import type { Labelling } from './sample.ts';

// ---- types -------------------------------------------------------------------------------------

/** The model's answer without its quotes: what a label must match. */
export type ExpectedFields = Omit<
  ExtractedFields,
  'domain_quote' | 'english_quote' | 'experience_quote' | 'salary_quote'
>;

export interface ScoredCase {
  labelling: Labelling;
  /** `null`: not labelled yet. The case is skipped and counted. */
  expected: ExpectedFields | null;
  /** `null`: the model call failed. Every field counts as wrong, so failures can't hide. */
  actual: ExpectedFields | null;
}

export type ScoredField = (typeof SCORED_FIELDS)[number];

export interface Tally {
  correct: number;
  total: number;
}

export interface SkillScore {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface GroupScore {
  items: number;
  fields: Record<ScoredField, Tally>;
  /** Pooled over every scored field: correct answers / answers. */
  accuracy: number;
  skills: SkillScore;
}

export interface EvalScore {
  skipped: number;
  failed: number;
  all: GroupScore;
  blind: GroupScore;
  prelabelled: GroupScore;
  /**
   * Prelabelled minus blind accuracy. A large positive gap means labellers anchored on the model's
   * pre-label (ADR 0007). `null` until both groups have items.
   */
  anchoringGap: number | null;
}

interface CaseScore {
  labelling: Labelling;
  fields: Record<ScoredField, boolean>;
  skills: SkillCounts;
}

interface SkillCounts {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

type LabelledCase = ScoredCase & { expected: ExpectedFields };

// ---- constants ---------------------------------------------------------------------------------

/** Exact match. */
const SCALAR_FIELDS = [
  'role',
  'seniority',
  'work_format',
  'english',
  'company_type',
  'domain',
  'abroad_allowed',
  'experience_years_min',
] as const satisfies (keyof ExpectedFields)[];

export const SCORED_FIELDS = [...SCALAR_FIELDS, 'salary', 'locations'] as const;

/** Amounts within 1% are the same salary: labels are typed by hand, gross/net rounding differs. */
const SALARY_TOLERANCE = 0.01;

// ---- functions ---------------------------------------------------------------------------------

export function scoreEval(cases: ScoredCase[]): EvalScore {
  const labelled = cases.filter((scored): scored is LabelledCase => scored.expected !== null);
  const scores = labelled.map((scored) => scoreCase(scored));
  const blind = groupScore(scores.filter((score) => score.labelling === 'blind'));
  const prelabelled = groupScore(scores.filter((score) => score.labelling === 'prelabelled'));
  const hasBothGroups = blind.items > 0 && prelabelled.items > 0;
  return {
    skipped: cases.length - labelled.length,
    failed: labelled.filter((scored) => scored.actual === null).length,
    all: groupScore(scores),
    blind,
    prelabelled,
    anchoringGap: hasBothGroups ? prelabelled.accuracy - blind.accuracy : null,
  };
}

function scoreCase({ labelling, expected, actual }: LabelledCase): CaseScore {
  const fields = Object.fromEntries(
    SCORED_FIELDS.map((field) => [field, actual !== null && isCorrect(field, expected, actual)]),
  ) as Record<ScoredField, boolean>;
  return { labelling, fields, skills: countSkills(expected.skills, actual?.skills ?? []) };
}

function isCorrect(field: ScoredField, expected: ExpectedFields, actual: ExpectedFields): boolean {
  if (field === 'salary') {
    return isSameSalary(expected, actual);
  }
  if (field === 'locations') {
    return isSameSet(expected.locations, actual.locations);
  }
  return expected[field] === actual[field];
}

/** Both "no salary" (every part null) or the same range, currency and period. */
function isSameSalary(expected: ExpectedFields, actual: ExpectedFields): boolean {
  return (
    isSameAmount(expected.salary_min, actual.salary_min) &&
    isSameAmount(expected.salary_max, actual.salary_max) &&
    expected.salary_currency === actual.salary_currency &&
    expected.salary_period === actual.salary_period
  );
}

function isSameAmount(expected: number | null, actual: number | null): boolean {
  return expected === null || actual === null
    ? expected === actual
    : Math.abs(expected - actual) <= SALARY_TOLERANCE * Math.max(expected, actual);
}

function isSameSet(expected: string[], actual: string[]): boolean {
  const expectedKeys = normalizedSet(expected);
  const actualKeys = normalizedSet(actual);
  return expectedKeys.size === actualKeys.size && expectedKeys.isSubsetOf(actualKeys);
}

/** Skill names only: `required` is not scored yet. */
function countSkills(
  expected: ExpectedFields['skills'],
  actual: ExpectedFields['skills'],
): SkillCounts {
  const expectedNames = normalizedSet(expected.map((skill) => skill.name));
  const actualNames = normalizedSet(actual.map((skill) => skill.name));
  const truePositives = expectedNames.intersection(actualNames).size;
  return {
    truePositives,
    falsePositives: actualNames.size - truePositives,
    falseNegatives: expectedNames.size - truePositives,
  };
}

function normalizedSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()));
}

function groupScore(scores: CaseScore[]): GroupScore {
  const fields = Object.fromEntries(
    SCORED_FIELDS.map((field) => [field, tally(scores.map((score) => score.fields[field]))]),
  ) as Record<ScoredField, Tally>;
  const tallies = Object.values(fields);
  const correct = tallies.reduce((sum, field) => sum + field.correct, 0);
  const total = tallies.reduce((sum, field) => sum + field.total, 0);
  return {
    items: scores.length,
    fields,
    accuracy: total === 0 ? 0 : correct / total,
    skills: skillScore(scores.map((score) => score.skills)),
  };
}

function tally(results: boolean[]): Tally {
  return { correct: results.filter(Boolean).length, total: results.length };
}

/**
 * Micro-averaged over all cases: summed counts, then the ratios. An empty denominator scores 1:
 * predicting no skills where none are stated is right, not undefined.
 */
function skillScore(counts: SkillCounts[]): SkillScore {
  const truePositives = counts.reduce((sum, count) => sum + count.truePositives, 0);
  const falsePositives = counts.reduce((sum, count) => sum + count.falsePositives, 0);
  const falseNegatives = counts.reduce((sum, count) => sum + count.falseNegatives, 0);
  const precision = ratioOrOne(truePositives, truePositives + falsePositives);
  const recall = ratioOrOne(truePositives, truePositives + falseNegatives);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { truePositives, falsePositives, falseNegatives, precision, recall, f1 };
}

function ratioOrOne(part: number, whole: number): number {
  return whole === 0 ? 1 : part / whole;
}
