// Page copy in Ukrainian and English. Numbers are never written here: they come from
// aggregates.json and are passed in already formatted.
import type { Language } from '../lib/index.ts';

// ---- types -------------------------------------------------------------------------------------

export type Messages = typeof UK;

// ---- constants ---------------------------------------------------------------------------------

const UK = {
  /** The same text as <title> in uk.html, which crawlers read. */
  pageTitle: 'IT Pulse UA — ринок IT-вакансій України: навички, ролі, зарплати',
  skipToContent: 'Перейти до змісту',
  nav: {
    label: 'Розділи',
    market: 'Ринок',
    skills: 'Навички',
    salary: 'Зарплати',
    method: 'Методологія',
    openMenu: 'Відкрити меню',
    closeMenu: 'Закрити меню',
    language: 'Мова',
  },
  menuHints: {
    market: 'ролі, домени, профіль вакансії',
    skills: 'топ-30 за згадками',
    salary: 'медіана й квартилі в USD',
    method: 'як збираємо й рахуємо',
  },
  soon: 'скоро',
  ask: {
    title: 'Запитай ринок',
    hint: 'AI-агент',
    lead: 'AI-агент відповідає на питання про ринок цифрами з тих самих даних, що й дашборд, і завжди каже, на скількох вакансіях вони пораховані.',
    label: 'Твоє питання',
    placeholder: 'Скільки платять senior QA?',
    submit: 'Запитати',
    asking: 'Рахую…',
    offline: 'Не вдалося з’єднатися з агентом. Перевір інтернет і спробуй ще раз.',
    examplesTitle: 'Або спробуй:',
    examples: [
      'Яка частка вакансій з віддаленою роботою?',
      'Яка медіанна зарплата Middle?',
      'Які навички найпотрібніші?',
      'Скільки вакансій в оборонці?',
    ],
    thin: 'Якщо в групі менше 10 вакансій, агент чесно каже «даних замало» замість того, щоб вигадувати.',
    close: 'Закрити',
  },
  hero: {
    eyebrow: 'Оновлюється кожні 2 години · DOU + Djinni',
    title: 'Пульс IT-ринку України в цифрах',
    lead: 'Публічні вакансії з DOU та Djinni, які LLM розбирає на ролі, рівні, навички, формат роботи та зарплати. Біля кожної цифри видно, на скількох вакансіях вона порахована.',
  },
  freshness: {
    title: 'Дані трохи відстають.',
    reasons: {
      quota: 'Вичерпано денний ліміт AI-моделі.',
      backlog: 'У черзі багато нових вакансій.',
      failing: 'Обробка тимчасово не вдається.',
      never: 'Аналіз вакансій ще не запускався.',
    },
    queued: (count: string): string =>
      `У черзі на аналіз: ${count}. Цифри нижче — лише по вже оброблених.`,
    lastOk: (date: string): string => `останній успішний запуск: ${date}`,
    lastRun: (date: string): string => `останній запуск: ${date}`,
    lastRunStopped: (date: string, processed: string): string =>
      `останній запуск: ${date}, оброблено ${processed}, далі ліміт`,
    lastRunFailed: (date: string): string => `останній запуск: ${date}, з помилкою`,
  },
  states: {
    loading: 'Завантажуємо статистику…',
    errorTitle: 'Не вдалося завантажити дані',
    errorBody: "Перевірте з'єднання та спробуйте ще раз.",
    retry: 'Спробувати ще раз',
    emptyTitle: 'Поки немає даних',
    emptyBody: "Щойно перші вакансії пройдуть аналіз, тут з'являться цифри.",
  },
  kpi: {
    label: 'Головні цифри',
    vacancies: (days: number): string => `Вакансій за ${days} днів`,
    vacanciesNote: 'у вікні спостереження',
    extracted: 'Проаналізовано LLM',
    extractedNote: (share: string): string => `${share} від усіх`,
    remote: 'Віддалена робота',
    salaries: 'Із зарплатою',
    salariesNote: 'база для зарплатних цифр',
  },
  insights: {
    title: 'Що видно зараз',
    swipe: 'гортайте',
    domainTag: '#1 домен',
    skillTag: '#1 навичка',
    gapTag: 'прогалина',
    domain: (name: string): string =>
      `${name} — найбільший домен серед вакансій із вказаним доменом.`,
    skill: (name: string): string => `${name} — найчастіша навичка у вакансіях.`,
    missingSeniority: (share: string): string => `${share} вакансій не вказують рівень.`,
    ofVacancies: 'вакансій',
  },
  market: {
    rolesTitle: 'Ролі',
    domainsTitle: 'Домени',
    showAll: (count: number): string => `Показати всі (${count})`,
    collapse: 'Згорнути',
    notStatedNote: '«Не вказано» — окрема категорія, ми її не ховаємо.',
  },
  profile: {
    title: 'Профіль вакансії',
    stacks: {
      seniority: 'Рівень',
      work_format: 'Формат роботи',
      english: 'Англійська',
      company_type: 'Тип компанії',
    },
  },
  skills: {
    title: 'Топ-30 навичок',
    note: 'згадок у вакансіях · нормалізовано через таксономію',
    showAll: 'Показати всі 30',
    collapse: 'Згорнути',
  },
  salary: {
    title: 'Зарплата за рівнем',
    note: 'USD на місяць, середина вилки; EUR і UAH за курсом НБУ · медіана та квартилі',
    median: 'медіана',
    thin: 'даних замало',
    none: 'Поки немає вакансій із вилкою',
    roleTitle: 'Зарплата за роллю',
    roleNote: (minN: number): string =>
      `Медіану показуємо, щойно в групі набереться ${minN} вакансій із вилкою.`,
  },
  digest: {
    title: 'Голосовий дайджест тижня',
    body: 'Головні зміни ринку за тиждень — коротким аудіо. Слухайте в дорозі, без графіків.',
    comingTitle: 'Дайджест скоро',
    trailerTitle: 'Трейлер · перший випуск у понеділок',
    weekTitle: (days: string): string => `Тиждень ${days}`,
    play: 'Відтворити',
    pause: 'Пауза',
    playUnavailable: 'Відтворення недоступне',
    transcript: 'Текст випуску',
    voice: 'Голос: ElevenLabs',
  },
  method: {
    title: 'Як це працює',
    steps: [
      {
        title: 'Збір',
        body: 'RSS-стрічки DOU за категоріями і Djinni кожні 2 години, 1 запит на секунду.',
      },
      {
        title: 'Дедуплікація',
        body: 'Вакансія = id + хеш вмісту. Підняття вакансії не створює дубль.',
      },
      {
        title: 'LLM-екстракція',
        body: 'Gemini повертає структуру; зарплата й досвід — лише з дослівною цитатою.',
      },
      { title: 'Агрегати', body: 'На сторінку потрапляють тільки агрегати, без текстів вакансій.' },
    ],
    rules: (minN: number, days: number): string[] => [
      'Кожна частка — з n',
      '«Не вказано» не ховаємо',
      `n < ${minN} — «даних замало»`,
      `Вікно — ${days} днів`,
    ],
  },
  footer: {
    text: 'Джерела: RSS DOU та Djinni. Некомерційне дослідження, лише агреговані дані, без текстів вакансій.',
    code: 'Код на GitHub',
    updated: (date: string): string => `Дані оновлено: ${date}`,
  },
};

const EN: Messages = {
  /** The same text as <title> in index.html, which crawlers read. */
  pageTitle: 'IT Pulse UA — Ukraine’s IT job market: skills, roles, salaries',
  skipToContent: 'Skip to content',
  nav: {
    label: 'Sections',
    market: 'Market',
    skills: 'Skills',
    salary: 'Salaries',
    method: 'Method',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    language: 'Language',
  },
  menuHints: {
    market: 'roles, domains, vacancy profile',
    skills: 'top 30 by mentions',
    salary: 'median and quartiles in USD',
    method: 'how we collect and count',
  },
  soon: 'soon',
  ask: {
    title: 'Ask the market',
    hint: 'AI agent',
    lead: 'An AI agent answers questions about the market with numbers from the same data as the dashboard, and always says how many vacancies they are based on.',
    label: 'Your question',
    placeholder: 'How much do senior QA engineers earn?',
    submit: 'Ask',
    asking: 'Counting…',
    offline: 'Could not reach the agent. Check your connection and try again.',
    examplesTitle: 'Or try:',
    examples: [
      'What share of vacancies is remote?',
      'What is the median Middle salary?',
      'Which skills are most in demand?',
      'How many vacancies are in defence?',
    ],
    thin: 'If a group has fewer than 10 vacancies, the agent says “not enough data” instead of making things up.',
    close: 'Close',
  },
  hero: {
    eyebrow: 'Updated every 2 hours · DOU + Djinni',
    title: 'The pulse of Ukraine’s IT job market',
    lead: 'Public vacancies from DOU and Djinni, broken down by an LLM into roles, levels, skills, work format and pay. Every figure shows how many vacancies it is based on.',
  },
  freshness: {
    title: 'Data is a little behind.',
    reasons: {
      quota: 'The AI model’s daily limit is used up.',
      backlog: 'Many new vacancies are queued.',
      failing: 'Processing is failing for now.',
      never: 'Vacancy analysis has not run yet.',
    },
    queued: (count: string): string =>
      `Queued for analysis: ${count}. The numbers below cover processed ones only.`,
    lastOk: (date: string): string => `last successful run: ${date}`,
    lastRun: (date: string): string => `last run: ${date}`,
    lastRunStopped: (date: string, processed: string): string =>
      `last run: ${date}, ${processed} processed, then the daily limit`,
    lastRunFailed: (date: string): string => `last run: ${date}, failed`,
  },
  states: {
    loading: 'Loading the numbers…',
    errorTitle: 'Could not load the data',
    errorBody: 'Check your connection and try again.',
    retry: 'Try again',
    emptyTitle: 'No data yet',
    emptyBody: 'Numbers appear here as soon as the first vacancies are analysed.',
  },
  kpi: {
    label: 'Key numbers',
    vacancies: (days: number): string => `Vacancies, ${days} days`,
    vacanciesNote: 'in the observation window',
    extracted: 'Analysed by LLM',
    extractedNote: (share: string): string => `${share} of all`,
    remote: 'Remote work',
    salaries: 'With a salary',
    salariesNote: 'the base of every salary number',
  },
  insights: {
    title: 'What stands out',
    swipe: 'swipe',
    domainTag: '#1 domain',
    skillTag: '#1 skill',
    gapTag: 'gap',
    domain: (name: string): string =>
      `${name} is the largest domain among vacancies that state one.`,
    skill: (name: string): string => `${name} is the most requested skill.`,
    missingSeniority: (share: string): string => `${share} of vacancies don’t state a level.`,
    ofVacancies: 'vacancies',
  },
  market: {
    rolesTitle: 'Roles',
    domainsTitle: 'Domains',
    showAll: (count: number): string => `Show all (${count})`,
    collapse: 'Collapse',
    notStatedNote: '“Not stated” is its own category; we never hide it.',
  },
  profile: {
    title: 'Vacancy profile',
    stacks: {
      seniority: 'Level',
      work_format: 'Work format',
      english: 'English',
      company_type: 'Company type',
    },
  },
  skills: {
    title: 'Top 30 skills',
    note: 'mentions in vacancies · normalized by the taxonomy',
    showAll: 'Show all 30',
    collapse: 'Collapse',
  },
  salary: {
    title: 'Salary by level',
    note: 'USD per month, range midpoint; EUR and UAH at the NBU rate · median and quartiles',
    median: 'median',
    thin: 'not enough data',
    none: 'No vacancies with a salary range yet',
    roleTitle: 'Salary by role',
    roleNote: (minN: number): string =>
      `A median shows once a group has ${minN} vacancies with a salary range.`,
  },
  digest: {
    title: 'Weekly voice digest',
    body: 'The week’s main market shifts as a short audio. Listen on the go, no charts needed.',
    comingTitle: 'Digest coming soon',
    trailerTitle: 'Trailer · first episode on Monday',
    weekTitle: (days: string): string => `Week of ${days}`,
    play: 'Play',
    pause: 'Pause',
    playUnavailable: 'Playback unavailable',
    transcript: 'Episode transcript',
    voice: 'Voice: ElevenLabs',
  },
  method: {
    title: 'How it works',
    steps: [
      {
        title: 'Collect',
        body: 'DOU category feeds and Djinni RSS every 2 hours, one request per second.',
      },
      { title: 'Dedup', body: 'A vacancy = id + content hash. A bump never makes a duplicate.' },
      {
        title: 'LLM extraction',
        body: 'Gemini returns structure; salary and experience need a verbatim quote.',
      },
      { title: 'Aggregates', body: 'Only aggregates reach the page, never vacancy text.' },
    ],
    rules: (minN: number, days: number): string[] => [
      'Every share has its n',
      '“Not stated” stays visible',
      `n < ${minN} — “not enough data”`,
      `${days}-day window`,
    ],
  },
  footer: {
    text: 'Sources: DOU and Djinni RSS. Non-commercial research, aggregates only, no vacancy text.',
    code: 'Code on GitHub',
    updated: (date: string): string => `Data updated: ${date}`,
  },
};

export const MESSAGES: Record<Language, Messages> = { uk: UK, en: EN };
