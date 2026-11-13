// Makes a schema-valid model answer consistent with the database constraints, without guessing.
import type { ExtractedFields } from './fields.ts';

// ---- types -------------------------------------------------------------------------------------

type Skill = ExtractedFields['skills'][number];

// ---- constants ---------------------------------------------------------------------------------

/** Ukrainian IT vacancies state monthly pay unless they say otherwise (also told to the model). */
const DEFAULT_SALARY_PERIOD = 'month';

// ---- functions ---------------------------------------------------------------------------------

export function tidyFields(fields: ExtractedFields): ExtractedFields {
  return {
    ...fields,
    ...tidySalary(fields),
    locations: uniqueCaseInsensitive(fields.locations),
    skills: mergeDuplicateSkills(fields.skills),
  };
}

/**
 * - No amount: currency, period and quote mean nothing, so they are cleared.
 * - An amount without a currency can't be compared with anything, so the salary is dropped.
 * - min > max is a swapped range.
 */
function tidySalary(fields: ExtractedFields): Partial<ExtractedFields> {
  const hasAmount = fields.salary_min !== null || fields.salary_max !== null;
  if (!hasAmount || fields.salary_currency === null) {
    return {
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      salary_period: null,
      salary_quote: null,
    };
  }
  const [low, high] = orderedRange(fields.salary_min, fields.salary_max);
  return {
    salary_min: low,
    salary_max: high,
    salary_period: fields.salary_period ?? DEFAULT_SALARY_PERIOD,
  };
}

function orderedRange(min: number | null, max: number | null): [number | null, number | null] {
  const isSwapped = min !== null && max !== null && min > max;
  return isSwapped ? [max, min] : [min, max];
}

function uniqueCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** "Python" and "python" are one skill; it is required if any mention says so. */
function mergeDuplicateSkills(skills: Skill[]): Skill[] {
  const byName = new Map<string, Skill>();
  for (const skill of skills) {
    const name = skill.name.trim();
    const key = name.toLowerCase();
    const known = byName.get(key);
    byName.set(key, { name: known?.name ?? name, required: skill.required || !!known?.required });
  }
  return byName.values().toArray();
}
