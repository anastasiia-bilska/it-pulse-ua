# 0006. Code style: ESLint, Prettier and written engineering rules

- Status: accepted
- Date: 2026-11-13

## Context

Code was reviewed as hard to read: long SQL inline in conditionals, one-letter names, deep nesting.
The project is a portfolio piece, so readability is a feature in itself. It is also written partly
by an AI agent, which needs explicit, checkable rules rather than taste.

## Decision

- **Prettier** owns formatting (`.prettierrc.json`: 100 columns, single quotes, trailing commas),
  so formatting is never discussed in review.
- **ESLint** (flat config, `eslint.config.ts`) owns code quality:
  - `@eslint/js` recommended;
  - `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked` (type-aware, no `any`);
  - `eslint-plugin-unicorn` recommended (modern APIs, descriptive names, consistent booleans);
  - readability limits: complexity 8, nesting depth 2, at most 3 params, 40 lines per function;
  - `eslint-config-prettier` last, so ESLint never fights Prettier.

  When a rule makes code worse, we turn it off with a one-line reason in the config instead of
  contorting the code. For example, string sorting stays in code-unit order because content hashes
  depend on it.

- **Written rules** in `CLAUDE.md` cover what a linter can't check: top-down structure, naming
  intent, KISS/YAGNI, DRY, SOLID and GRASP as applied here. The file is read automatically by
  Claude Code and applies equally to human contributors.
- **CI** runs `lint` and `format:check` in the existing required `check` job, so branch protection
  covers them with no settings change.
- Stricter `tsconfig`: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`.

## Consequences

- **TypeScript is pinned to 6.0** (from 7.0). `typescript-eslint` 8.x supports `typescript <6.1`,
  and type-aware linting is the main value here. Bump when typescript-eslint supports TS 7.
- The ESLint config is TypeScript, so ESLint needs `jiti` to load it (dev dependency).
- `npm audit` reports a moderate ReDoS in `minimatch` via `typescript-eslint`. It is dev-only and
  runs on our own glob patterns. `npm audit fix --force` would downgrade ESLint, so we wait for an
  upstream release.
- The refactor kept behaviour, with one fix. The volume-drop median averaged the 4th and 5th of 7
  values instead of taking the middle one, and is now a tested `median()`. The check is not active
  yet (it needs 8 days of history), so no alert changed. A golden test pins `contentHash` output,
  so a future refactor can't silently re-version stored vacancies.
- Rejected:
  - Biome: faster, but it has no type-aware rules comparable to `strictTypeChecked`;
  - Airbnb style config: unmaintained for flat config and TypeScript.
