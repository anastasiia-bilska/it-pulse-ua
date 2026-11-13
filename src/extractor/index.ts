// Public API of the extractor module. Other modules import only from here.
export {
  COMPANY_TYPES,
  CURRENCIES,
  DOMAINS,
  ENGLISH_LEVELS,
  ROLES,
  SALARY_PERIODS,
  SENIORITIES,
  WORK_FORMATS,
  type ExtractedFields,
} from './fields.ts';
export { EXTRACTOR_VERSION, MODEL } from './prompt.ts';
export { vacancyText } from './vacancy-text.ts';
