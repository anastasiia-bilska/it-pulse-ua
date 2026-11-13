# 0003. Collector runtime: TypeScript on Node 24, no build step

- Status: accepted
- Date: 2026-11-13

## Context

The planned backend is NestJS (TypeScript). The collector has to run today as a short script in GitHub Actions, before the backend exists.

## Decision

- Write the collector in TypeScript and run it directly with Node 24's built-in type stripping (`node collector/collect.ts`). There is no tsc, tsx or bundler.
- Dependencies are only `pg` and `fast-xml-parser`. Migrations are plain SQL in `db/migrations/`, applied in order by a 25-line `migrate.ts` that records them in `schema_migrations`.
- Tests use `node --test` on synthetic fixtures. Real vacancy text never goes into the repository.

## Consequences

- One language across the stack, so `normalize.ts` can move into the NestJS worker unchanged.
- Type stripping only erases types: no `enum`, no parameter properties, no type checking at run time. Add `tsc --noEmit` to CI when the codebase grows.
- Rejected: Python, which would be a second language in the stack. Also rejected: an ORM or migration framework for four tables. Revisit when NestJS arrives.
