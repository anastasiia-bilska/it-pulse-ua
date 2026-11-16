// CLI: asks the market one question and prints the answer (ADR 0021).
// Usage: npm run ask -- "Скільки платять senior backend?"
import pg from 'pg';
import { fetchUsdRates } from '../dashboard/index.ts';
import { GEMINI_BASE_URL, MODEL } from '../extractor/index.ts';
import { tracerFromEnvironment } from '../observability/index.ts';
import { askMarket, isValidQuestion, MAX_QUESTION_CHARS } from './ask-market.ts';

// ---- functions ---------------------------------------------------------------------------------

async function ask(question: string): Promise<void> {
  if (!isValidQuestion(question)) {
    throw new Error(`A question is 3 to ${MAX_QUESTION_CHARS} characters long`);
  }
  const tracer = tracerFromEnvironment();
  const db = new pg.Client({ connectionString: requiredEnvironment('DATABASE_URL') });
  await db.connect();
  try {
    const answer = await askMarket(db, question, {
      gemini: {
        apiKey: requiredEnvironment('GEMINI_API_KEY'),
        model: MODEL,
        baseUrl: process.env.GEMINI_BASE_URL ?? GEMINI_BASE_URL,
      },
      tracer,
      usdRates: await fetchUsdRates(),
      now: new Date(),
    });
    console.log(`[${answer.kind}] ${answer.text}`);
  } finally {
    await db.end();
    await tracer.flush();
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

// ---- entry point -------------------------------------------------------------------------------

await ask(process.argv.slice(2).join(' '));
