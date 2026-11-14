// Human names for the enum values the extractor writes. A value with no label shows as is, so a
// new enum value never breaks the page; it just looks raw until someone names it here.
import type { Language } from '../../shared/lib/index.ts';
import type { Dimension } from './types.ts';

// ---- types -------------------------------------------------------------------------------------

type LabelTable = Partial<Record<string, string>>;

// ---- constants ---------------------------------------------------------------------------------

const SHARED_LABELS: Record<Language, LabelTable> = {
  uk: { not_stated: 'Не вказано', other: 'Інше' },
  en: { not_stated: 'Not stated', other: 'Other' },
};

const LABELS: Record<Language, Partial<Record<Dimension, LabelTable>>> = {
  uk: {
    source: { dou: 'DOU', djinni: 'Djinni' },
    role: {
      backend: 'Backend',
      frontend: 'Frontend',
      fullstack: 'Fullstack',
      mobile: 'Mobile',
      ml_ai: 'ML / AI',
      data_engineering: 'Data Engineering',
      data_analytics: 'Data Analytics',
      devops: 'DevOps',
      qa: 'QA',
      security: 'Security',
      gamedev: 'GameDev',
      embedded: 'Embedded',
      design: 'Дизайн',
      product: 'Product-менеджмент',
      project: 'Project-менеджмент',
      business_analysis: 'Бізнес-аналіз',
      marketing: 'Маркетинг',
      sales: 'Продажі',
      hr: 'HR',
      support: 'Підтримка',
      management: 'Менеджмент',
    },
    seniority: {
      intern: 'Intern',
      junior: 'Junior',
      middle: 'Middle',
      senior: 'Senior',
      lead: 'Lead',
    },
    work_format: { remote: 'Віддалено', office: 'Офіс', hybrid: 'Гібрид' },
    english: {
      none: 'Не потрібна',
      basic: 'Basic',
      intermediate: 'Intermediate',
      upper: 'Upper-Intermediate',
      fluent: 'Fluent',
    },
    company_type: { product: 'Продуктова', outsource: 'Аутсорс', outstaff: 'Аутстаф' },
    domain: {
      fintech: 'FinTech',
      igaming: 'iGaming',
      gamedev: 'GameDev',
      ecommerce: 'E-commerce',
      healthtech: 'HealthTech',
      edtech: 'EdTech',
      adtech: 'AdTech',
      martech: 'MarTech',
      defense: 'Оборона',
      govtech: 'GovTech',
      logistics: 'Логістика',
      telecom: 'Телеком',
      automotive: 'Автомобільна',
      cybersecurity: 'Кібербезпека',
      ai: 'AI',
    },
  },
  en: {
    source: { dou: 'DOU', djinni: 'Djinni' },
    role: {
      backend: 'Backend',
      frontend: 'Frontend',
      fullstack: 'Fullstack',
      mobile: 'Mobile',
      ml_ai: 'ML / AI',
      data_engineering: 'Data Engineering',
      data_analytics: 'Data Analytics',
      devops: 'DevOps',
      qa: 'QA',
      security: 'Security',
      gamedev: 'GameDev',
      embedded: 'Embedded',
      design: 'Design',
      product: 'Product',
      project: 'Project',
      business_analysis: 'Business analysis',
      marketing: 'Marketing',
      sales: 'Sales',
      hr: 'HR',
      support: 'Support',
      management: 'Management',
    },
    seniority: {
      intern: 'Intern',
      junior: 'Junior',
      middle: 'Middle',
      senior: 'Senior',
      lead: 'Lead',
    },
    work_format: { remote: 'Remote', office: 'Office', hybrid: 'Hybrid' },
    english: {
      none: 'Not required',
      basic: 'Basic',
      intermediate: 'Intermediate',
      upper: 'Upper-Intermediate',
      fluent: 'Fluent',
    },
    company_type: { product: 'Product', outsource: 'Outsource', outstaff: 'Outstaff' },
    domain: {
      fintech: 'FinTech',
      igaming: 'iGaming',
      gamedev: 'GameDev',
      ecommerce: 'E-commerce',
      healthtech: 'HealthTech',
      edtech: 'EdTech',
      adtech: 'AdTech',
      martech: 'MarTech',
      defense: 'Defense',
      govtech: 'GovTech',
      logistics: 'Logistics',
      telecom: 'Telecom',
      automotive: 'Automotive',
      cybersecurity: 'Cybersecurity',
      ai: 'AI',
    },
  },
};

// ---- functions ---------------------------------------------------------------------------------

export function valueLabel(dimension: Dimension, value: string, language: Language): string {
  return LABELS[language][dimension]?.[value] ?? SHARED_LABELS[language][value] ?? value;
}
