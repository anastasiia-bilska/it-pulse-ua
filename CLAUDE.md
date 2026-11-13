# Engineering rules

These rules bind every change in this repository, whoever writes it: a person or an AI agent.
`npm run lint` enforces the mechanical part (`eslint.config.ts`). The rest is on the author and
the reviewer. Why these tools: [ADR 0006](docs/adr/0006-code-style-and-linting.md).

## Code reads like a book

- **Fixed file layout**, in this order, with a `// ---- section ----` comment before each block:
  1. imports;
  2. types (interfaces and type aliases);
  3. constants (numbers, SQL, configured parsers);
  4. module state, if any (tests only, set in `before()`);
  5. functions;
  6. the entry-point code, in a CLI file.

  Never put a type or a constant between functions. ESLint enforces types-before-functions
  (`perfectionist/sort-modules`) and function declarations (`func-style`); constants are checked in
  review.

- **Functions top-down, like a newspaper.** The public entry point comes first. The helpers it
  calls come below, in the order they are called. A reader stops once they know enough.
- **Functions are declared with `function`**, not as arrow-function constants, so the constants
  block holds only values. Arrows are for inline callbacks.
- **One level of abstraction per function.** `collectFeed` reads as a story (fetch → parse →
  store → log). The SQL and HTTP details live one level down, in small named functions.
- **Names tell the intent.** Write `hasGap`, `insertContentVersion`, `PERSISTENT_GAPS_SQL`, not
  `check`, `doInsert`, `q`. Use no abbreviations except well-known ones (`db`, `id`, `url`).
  Boolean names start with `is` / `has` / `was` / `can`.
- **Small functions, shallow nesting.** Keep a function under ~40 lines, at most 3 parameters, and
  nesting at most 2 deep. Prefer early returns over `else` chains.
- **No magic values.** Give numbers and SQL a named constant that says what they mean
  (`GAP_STREAK`, `REQUEST_TIMEOUT_MS`).
- **Comments explain _why_, not _what_.** Write a comment for a business rule, a trade-off or a
  trap (`// Order matters: …`). If a comment only restates the code, rename instead.

## Design principles

- **KISS and YAGNI first.** Build the simplest thing that solves today's problem. Add no
  abstraction for a single use and no config for a value that never changes. Don't scaffold
  "for later".
- **DRY on knowledge, not on look-alike lines.** A rule lives in one place (`inTransaction`,
  `contentHash`). Two lines that only look the same may stay apart.
- **SOLID, where it pays off:**
  - single responsibility per module (`ingest` collects, `checks` judges, `collect` wires and
    reports);
  - depend on narrow interfaces (functions take the `pg.Client` and the data they need, not
    globals);
  - no inheritance hierarchies.
- **GRASP:**
  - the information expert owns the behaviour, for example the SQL that knows `fetch_log` sits
    next to the logic that needs it;
  - low coupling and high cohesion between modules;
  - a controller (`collect.ts`) only orchestrates.
- **Fail loudly at boundaries, stay resilient inside.** Validate external input (RSS, env vars,
  LLM output). One broken feed must never stop the others.

## TypeScript

- Strict compiler options plus `typescript-eslint` `strictTypeChecked`. Never use `any`. Type
  query rows with `db.query<Row>()`.
- Node runs `.ts` directly, so use only erasable syntax: no enums, no namespaces, no parameter
  properties.
- Prefer `const`, immutable array methods (`toSorted`) and pure functions. Mutation stays local.

## Data and privacy

- Never commit raw vacancy text, and never print it to logs or ping bodies: Actions logs are
  public. Log counts and feed names only.
- Test fixtures are synthetic.
- History is append-only. A change that could alter `contentHash` or rewrite stored rows needs an
  ADR and a golden test.

## Tests

- Every behaviour change comes with a test.
  - Unit tests: `*.test.ts`.
  - Integration tests, on real Postgres plus a fake HTTP server: `*.itest.ts`.
- Tests read as scenarios: arrange, act, assert, separated by blank lines.

## Definition of done

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` and
  `npm run test:integration` all pass. CI runs them all and blocks the merge.
- Every change goes through a pull request.
- Significant decisions get an ADR in `docs/adr/` in the same pull request.
