import pg from 'pg';
import { findProblems } from './checks.ts';
import { collectAll, type Feed, type Summary } from './ingest.ts';

// From the category <select> on jobs.dou.ua/vacancies/. Recheck occasionally.
const DOU_CATEGORIES = [
  '.NET',
  'Account Manager',
  'AI/ML',
  'Analyst',
  'Android',
  'Animator',
  'Architect',
  'Artist',
  'Assistant',
  'Big Data',
  'Blockchain',
  'C++',
  'C-level',
  'Copywriter',
  'Data Engineer',
  'Data Science',
  'DBA',
  'Design',
  'DevOps',
  'Embedded',
  'Engineering Manager',
  'Erlang',
  'ERP/CRM',
  'Finance',
  'Flutter',
  'Front End',
  'Golang',
  'Hardware',
  'HR',
  'iOS/macOS',
  'Java',
  'Legal',
  'Marketing',
  'No-code',
  'Node.js',
  'Office Manager',
  'Other',
  'PHP',
  'Procurement',
  'Product Manager',
  'Project Manager',
  'Python',
  'QA',
  'React Native',
  'Ruby',
  'Rust',
  'Sales',
  'Salesforce',
  'SAP',
  'Scala',
  'Scrum Master',
  'Security',
  'SEO',
  'Support',
  'SysAdmin',
  'Technical Writer',
  'Unity',
  'Unreal Engine',
  'Військова справа',
];

const FEEDS: Feed[] = [
  ...DOU_CATEGORIES.map((category) => ({
    source: 'dou' as const,
    feed: `dou:${category}`,
    url: `https://jobs.dou.ua/vacancies/feeds/?category=${encodeURIComponent(category)}`,
  })),
  // The general Djinni feed carries <category> tags.
  // Switch to ?primary_keyword=X feeds if fetch_log shows gaps.
  { source: 'djinni', feed: 'djinni:all', url: 'https://djinni.co/jobs/rss/' },
];

const POLITE_DELAY_MS = 1000;
const RETRY_BASE_MS = 5000;
const HEALTHCHECK_TIMEOUT_MS = 10_000;
/** The run itself fails (and GitHub emails) only when most feeds are down. */
const MAX_FAILED_SHARE = 0.5;

/**
 * healthchecks.io: a success ping is the heartbeat (a missing one alerts), /fail alerts now.
 * A broken healthchecks.io must never fail the collector itself.
 */
async function pingHealthchecks(problems: string[]): Promise<void> {
  const pingUrl = process.env.HEALTHCHECK_URL;
  if (!pingUrl) {
    return;
  }
  const hasProblems = problems.length > 0;
  try {
    await fetch(hasProblems ? `${pingUrl}/fail` : pingUrl, {
      method: 'POST',
      body: hasProblems ? problems.join('\n') : 'ok',
      signal: AbortSignal.timeout(HEALTHCHECK_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`healthcheck ping failed: ${String(error)}`);
  }
}

function summaryLine(summary: Summary): string {
  return [
    `feeds=${summary.feeds}`,
    `items=${summary.items}`,
    `new=${summary.newItems}`,
    `failed=${summary.failedFeeds.length}`,
    `gaps=${summary.gapFeeds.length}`,
  ].join(' ');
}

async function collect(db: pg.Client): Promise<void> {
  const summary = await collectAll(db, FEEDS, {
    userAgent: process.env.COLLECTOR_UA ?? 'it-pulse-ua-collector/0.1 (non-commercial research)',
    delayMs: POLITE_DELAY_MS,
    retryBaseMs: RETRY_BASE_MS,
    log: console.log,
  });
  const problems = await findProblems(db, summary);
  console.log(summaryLine(summary));
  for (const problem of problems) {
    console.log(`PROBLEM\t${problem}`);
  }
  await pingHealthchecks(problems);
  if (summary.failedFeeds.length > summary.feeds * MAX_FAILED_SHARE) {
    process.exitCode = 1;
  }
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await collect(db);
} catch (error) {
  await pingHealthchecks([`collector crashed: ${String(error)}`]);
  throw error;
} finally {
  await db.end();
}
