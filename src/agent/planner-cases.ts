// The planner eval (ADR 0021): questions with the plan they must get. The planner is the only step
// where the model decides what is computed, so it is the step worth scoring. Synthetic questions.
import { isDeepStrictEqual } from 'node:util';
import type { Plan } from './plan.ts';

// ---- types -------------------------------------------------------------------------------------

export interface PlannerCase {
  question: string;
  expected: Plan;
}

export interface PlannerScore {
  total: number;
  correct: number;
  /** correct / total, rounded to 0.01. */
  accuracy: number;
  misses: { question: string; expected: Plan; actual: Plan }[];
}

// ---- constants ---------------------------------------------------------------------------------

const ANY = { role: null, seniority: null } as const;
const ACCURACY_SCALE = 100;

export const PLANNER_CASES: PlannerCase[] = [
  {
    question: 'Скільки платять senior backend розробникам?',
    expected: { language: 'uk', tool: 'salary', filters: { role: 'backend', seniority: 'senior' } },
  },
  {
    question: 'What is the median salary for a middle QA engineer?',
    expected: { language: 'en', tool: 'salary', filters: { role: 'qa', seniority: 'middle' } },
  },
  {
    question: 'Яка зарплата у джунів?',
    expected: { language: 'uk', tool: 'salary', filters: { role: null, seniority: 'junior' } },
  },
  {
    question: 'How much do DevOps engineers earn?',
    expected: { language: 'en', tool: 'salary', filters: { role: 'devops', seniority: null } },
  },
  {
    question: 'Які скіли найчастіше просять у фронтенді?',
    expected: {
      language: 'uk',
      tool: 'top_skills',
      filters: { role: 'frontend', seniority: null },
    },
  },
  {
    question: 'What are the most in-demand skills right now?',
    expected: { language: 'en', tool: 'top_skills', filters: ANY },
  },
  {
    question: 'Що треба знати senior data engineer, які технології в топі?',
    expected: {
      language: 'uk',
      tool: 'top_skills',
      filters: { role: 'data_engineering', seniority: 'senior' },
    },
  },
  {
    question: 'Скільки вакансій просять Kubernetes?',
    expected: { language: 'uk', tool: 'skill_demand', filters: ANY, skill: 'Kubernetes' },
  },
  {
    question: 'How many backend jobs ask for Go?',
    expected: {
      language: 'en',
      tool: 'skill_demand',
      filters: { role: 'backend', seniority: null },
      skill: 'Go',
    },
  },
  {
    question: 'Чи популярний Python у ML-вакансіях?',
    expected: {
      language: 'uk',
      tool: 'skill_demand',
      filters: { role: 'ml_ai', seniority: null },
      skill: 'Python',
    },
  },
  {
    question: 'Яка частка віддалених вакансій?',
    expected: { language: 'uk', tool: 'distribution', filters: ANY, dimension: 'work_format' },
  },
  {
    question: 'How many mobile vacancies are remote vs office?',
    expected: {
      language: 'en',
      tool: 'distribution',
      filters: { role: 'mobile', seniority: null },
      dimension: 'work_format',
    },
  },
  {
    question: 'Який рівень англійської вимагають від senior?',
    expected: {
      language: 'uk',
      tool: 'distribution',
      filters: { role: null, seniority: 'senior' },
      dimension: 'english',
    },
  },
  {
    question: 'Product чи аутсорс: хто більше наймає?',
    expected: { language: 'uk', tool: 'distribution', filters: ANY, dimension: 'company_type' },
  },
  {
    question: 'Which domains hire the most?',
    expected: { language: 'en', tool: 'distribution', filters: ANY, dimension: 'domain' },
  },
  {
    question: 'Яких ролей зараз найбільше на ринку?',
    expected: { language: 'uk', tool: 'distribution', filters: ANY, dimension: 'role' },
  },
  {
    question: 'В яку компанію мені краще піти працювати?',
    expected: { language: 'uk', tool: 'unsupported' },
  },
  {
    question: 'Will salaries grow next year?',
    expected: { language: 'en', tool: 'unsupported' },
  },
  {
    question: 'Скільки платять у Польщі?',
    expected: { language: 'uk', tool: 'unsupported' },
  },
  {
    question: 'Напиши мені вірш про котиків',
    expected: { language: 'uk', tool: 'unsupported' },
  },
];

// ---- functions ---------------------------------------------------------------------------------

/** Exact match: the right tool with the wrong filter computes the wrong number. */
export function scorePlans(
  results: { question: string; expected: Plan; actual: Plan }[],
): PlannerScore {
  const misses = results.filter((result) => !isSamePlan(result.expected, result.actual));
  const correct = results.length - misses.length;
  const accuracy =
    results.length === 0
      ? 0
      : Math.round((correct / results.length) * ACCURACY_SCALE) / ACCURACY_SCALE;
  return { total: results.length, correct, accuracy, misses };
}

/** Skills compare case-insensitively: the SQL resolves "go" and "Go" to the same skill. */
function isSamePlan(expected: Plan, actual: Plan): boolean {
  return isDeepStrictEqual(withLowerCaseSkill(expected), withLowerCaseSkill(actual));
}

function withLowerCaseSkill(plan: Plan): Plan {
  return 'skill' in plan ? { ...plan, skill: plan.skill.toLowerCase() } : plan;
}
