// One rule for "a salary in USD per month", shared by the dashboard and the digest: a vacancy's
// salary is the midpoint of its range (or the bound that is given), converted at the official
// National Bank of Ukraine rate of the build day. EUR and UAH vacancies count too, instead of
// being silently dropped.
import { z } from 'zod';

// ---- types -------------------------------------------------------------------------------------

/** USD for one unit of each non-USD currency, and the NBU date they are valid for. */
export interface UsdRates {
  date: string;
  eur: number;
  uah: number;
}

// ---- constants ---------------------------------------------------------------------------------

export const NBU_RATES_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json';
const REQUEST_TIMEOUT_MS = 10_000;

/** NBU quotes hryvnias per one unit of a currency. */
const nbuRatesSchema = z.array(
  z.object({ cc: z.string(), rate: z.number().positive(), exchangedate: z.string() }),
);

// ---- functions ---------------------------------------------------------------------------------

/**
 * Today's rates, or null when the NBU can't be reached: the page and the digest then fall back to
 * USD salaries only and say so, instead of failing.
 */
export async function fetchUsdRates(fetcher: typeof fetch = fetch): Promise<UsdRates | null> {
  try {
    const response = await fetcher(NBU_RATES_URL, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return toUsdRates(await response.json());
  } catch (error) {
    console.log(`PROBLEM\tNBU exchange rates unavailable, salaries are USD only: ${String(error)}`);
    return null;
  }
}

/** Throws on a response without USD or EUR: a half-read rate table must not convert anything. */
export function toUsdRates(response: unknown): UsdRates {
  const rows = nbuRatesSchema.parse(response);
  const usd = rows.find((row) => row.cc === 'USD');
  const eur = rows.find((row) => row.cc === 'EUR');
  if (!usd || !eur) {
    throw new Error('NBU rates lack USD or EUR');
  }
  return { date: usd.exchangedate, eur: eur.rate / usd.rate, uah: 1 / usd.rate };
}

/** The query parameters `usdMonthSalarySql` reads; nulls leave only USD salaries. */
export function rateParameters(rates: UsdRates | null): [number | null, number | null] {
  return [rates?.eur ?? null, rates?.uah ?? null];
}

/**
 * SQL for the monthly USD salary of a `vacancy_current` row, with the EUR and UAH rates read from
 * `$first` and `$first + 1`. It is null for any other currency or period, or a missing rate, so
 * callers filter with `is not null`.
 */
export function usdMonthSalarySql(first: number): string {
  return `(case
      when salary_period <> 'month' then null
      when salary_currency = 'USD' then 1
      when salary_currency = 'EUR' then $${first}::float8
      when salary_currency = 'UAH' then $${first + 1}::float8
    end) * (coalesce(salary_min, salary_max) + coalesce(salary_max, salary_min))::float8 / 2`;
}
