import pg from 'pg';
import { collectAll, type Feed } from './ingest.ts';
import { findProblems } from './checks.ts';

// From the category <select> on jobs.dou.ua/vacancies/. Recheck occasionally.
const DOU_CATEGORIES = [
  '.NET', 'Account Manager', 'AI/ML', 'Analyst', 'Android', 'Animator', 'Architect', 'Artist', 'Assistant',
  'Big Data', 'Blockchain', 'C++', 'C-level', 'Copywriter', 'Data Engineer', 'Data Science', 'DBA', 'Design',
  'DevOps', 'Embedded', 'Engineering Manager', 'Erlang', 'ERP/CRM', 'Finance', 'Flutter', 'Front End', 'Golang',
  'Hardware', 'HR', 'iOS/macOS', 'Java', 'Legal', 'Marketing', 'No-code', 'Node.js', 'Office Manager', 'Other',
  'PHP', 'Procurement', 'Product Manager', 'Project Manager', 'Python', 'QA', 'React Native', 'Ruby', 'Rust',
  'Sales', 'Salesforce', 'SAP', 'Scala', 'Scrum Master', 'Security', 'SEO', 'Support', 'SysAdmin',
  'Technical Writer', 'Unity', 'Unreal Engine', 'Військова справа',
];

const FEEDS: Feed[] = [
  ...DOU_CATEGORIES.map((c) => ({
    source: 'dou' as const,
    feed: `dou:${c}`,
    url: `https://jobs.dou.ua/vacancies/feeds/?category=${encodeURIComponent(c)}`,
  })),
  // Djinni general feed carries <category> tags. Switch to ?primary_keyword=X feeds if fetch_log shows gaps.
  { source: 'djinni', feed: 'djinni:all', url: 'https://djinni.co/jobs/rss/' },
];

// healthchecks.io: success ping = heartbeat (missing ping → alert), /fail = alert now.
// A broken healthchecks.io must never fail the collector itself.
async function ping(problems: string[]) {
  const url = process.env.HEALTHCHECK_URL;
  if (!url) return;
  try {
    await fetch(problems.length ? `${url}/fail` : url, {
      method: 'POST',
      body: problems.join('\n') || 'ok',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error(`healthcheck ping failed: ${(e as Error).message}`);
  }
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const summary = await collectAll(db, FEEDS, {
    userAgent: process.env.COLLECTOR_UA ?? 'it-pulse-ua-collector/0.1 (non-commercial research)',
    delayMs: 1000,
    retryBaseMs: 5000,
    log: console.log,
  });
  const problems = await findProblems(db, summary);
  console.log(`feeds=${summary.feeds} items=${summary.items} new=${summary.newItems} failed=${summary.failedFeeds.length} gaps=${summary.gapFeeds.length}`);
  problems.forEach((p) => console.log(`PROBLEM\t${p}`));
  await ping(problems);
  if (summary.failedFeeds.length > summary.feeds / 2) process.exitCode = 1;
} catch (e) {
  await ping([`collector crashed: ${(e as Error).message}`]);
  throw e;
} finally {
  await db.end();
}
