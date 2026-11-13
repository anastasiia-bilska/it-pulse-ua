# 0004. Least-privilege collector role, GitHub secrets

- Status: accepted
- Date: 2026-11-13

## Context

The collector runs every 2 hours from GitHub Actions in a public repository and needs a Postgres connection string. The raw layer is append-only and can't be rebuilt, because RSS has no history (ADR 0001, 0002). A leaked owner credential could drop or truncate everything collected so far.

Options for where the secret lives:
- GitHub Actions secrets;
- 1Password via a service account;
- Doppler or Infisical;
- HashiCorp Vault with dynamic credentials;
- a Neon API key that fetches the URL at runtime.

## Decision

- **Two roles.**
  - `collector` is created with `neon roles create --access read_only`, which gives SELECT on current and future tables. Migration `002` adds only what the collector writes: INSERT on `raw_item`, `sighting` and `fetch_log`, plus UPDATE of `sighting.last_seen` and `feed_state.last_modified`. It gets no DELETE, TRUNCATE or DDL.
  - `neondb_owner` is used only for migrations.
- **Two workflows.**
  - `collect` runs on a schedule with `DATABASE_URL`, the collector role.
  - `migrate` runs on a push to `main` that touches `db/migrations/**`, or by hand, with `DATABASE_URL_MIGRATE`, the owner role. It shares the `collect` concurrency group, so a migration never overlaps a write.
- **Storage:** both are GitHub Actions secrets. Connection strings use `sslmode=verify-full`, because `pg` v9 will treat `require` as weaker libpq semantics.
- **Grants for new tables:** each new table that the collector writes to needs an explicit grant in its migration.

## Consequences

- A leaked `DATABASE_URL` can only add rows. It cannot destroy or rewrite history.
- The owner credential is used only on migration changes, not 360 times a month.
- Rejected:
  - Vault, because it needs a server to run, which is out of budget for $0.
  - 1Password or Doppler, because a token would still sit in GitHub, so it adds a service without reducing exposure.
  - A Neon API key, because it controls the whole account, which is broader than one database role.
- Rotation: `neon roles reset-password collector`, then update the secret.
