# 0008. Modular layout with tests in tests/ subfolders

- Status: accepted
- Date: 2026-11-13

## Context

The code started as one `collector/` folder with tests next to the files they test. With the
extractor, the taxonomy and later the API and agent coming, a flat folder would turn into a web
of cross-imports. The owner asked for a modular architecture with tests kept apart from the code.

## Decision

- One folder per module under `src/`: `collector`, `extractor`, `db`, `shared`, and so on.
- `src/<module>/index.ts` is the only door into a module. Test helpers shared across modules go
  through `src/<module>/testing.ts`.
- ESLint enforces the boundary with `no-restricted-imports`: a relative import that reaches into
  another module's folder fails unless it targets `index.ts` or `testing.ts`.
- Tests live in `src/<module>/tests/`: `*.test.ts` for unit tests, `*.itest.ts` for integration
  tests. The npm scripts glob `src/**/tests/`.
- Dependencies point from feature modules to `db` and `shared`, never back and never in a cycle.

## Consequences

- Moving or rewriting a module's internals never breaks another module, as long as `index.ts`
  stays the same.
- Tests import the module's internals through `../`, which is allowed inside a module, so unit
  tests can still reach small private helpers when that is the clearest test.
- Rejected:
  - npm workspaces (one package per module): build and versioning overhead with no gain for one
    deployable;
  - `eslint-plugin-boundaries`: more power than one regex rule needs today.
