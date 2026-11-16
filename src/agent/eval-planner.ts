// CLI: runs the planner eval against the live model and prints the score (ADR 0020). It spends
// about 20 Gemini calls of the shared free-tier quota, so it runs on demand, not on every PR.
// Logs hold only synthetic eval questions and plans, never vacancy text.
import { GEMINI_BASE_URL, MODEL } from '../extractor/index.ts';
import { tracerFromEnvironment } from '../observability/index.ts';
import { planQuestion } from './plan.ts';
import { PLANNER_CASES, scorePlans } from './planner-cases.ts';

// ---- functions ---------------------------------------------------------------------------------

async function evalPlanner(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required');
  }
  const gemini = { apiKey, model: MODEL, baseUrl: process.env.GEMINI_BASE_URL ?? GEMINI_BASE_URL };
  const tracer = tracerFromEnvironment();
  const results = [];
  // Sequential on purpose: the free tier limits requests per minute.
  for (const { question, expected } of PLANNER_CASES) {
    results.push({ question, expected, actual: await planQuestion(gemini, question, tracer) });
  }
  await tracer.flush();
  const score = scorePlans(results);
  console.log(`planner accuracy=${score.accuracy} (${score.correct}/${score.total})`);
  for (const miss of score.misses) {
    console.log(
      `miss: ${miss.question}\n  expected ${JSON.stringify(miss.expected)}\n  actual   ${JSON.stringify(miss.actual)}`,
    );
  }
}

// ---- entry point -------------------------------------------------------------------------------

await evalPlanner();
