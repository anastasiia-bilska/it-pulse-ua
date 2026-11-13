// Test-only helpers for integration suites. They DESTROY schema public of TEST_DATABASE_URL.
import pg from 'pg';
import { migrate } from './migrate.ts';

/** Pipeline roles. Production creates them with `neon roles create --access read_only`. */
export type PipelineRole = 'collector' | 'extractor';
const PIPELINE_ROLES: PipelineRole[] = ['collector', 'extractor'];

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is required (superuser; schema public is wiped)');
  }
  return url;
}

/** Recreates schema public and the pipeline roles the way production has them, then migrates. */
export async function resetDatabase(admin: pg.Client, adminUrl: string): Promise<void> {
  await admin.query('drop schema if exists public cascade; create schema public;');
  for (const role of PIPELINE_ROLES) {
    await admin.query(recreateReadOnlyRoleSql(role));
  }
  await migrate(adminUrl, quiet);
}

/** Connects as a pipeline role. Each role's test password equals its name. */
export async function connectAs(role: PipelineRole, adminUrl: string): Promise<pg.Client> {
  const url = new URL(adminUrl);
  url.username = role;
  url.password = role;
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  return client;
}

/** Mirrors Neon's `--access read_only`: SELECT on every table, now and later, nothing else. */
function recreateReadOnlyRoleSql(role: PipelineRole): string {
  return `
    drop role if exists ${role};
    create role ${role} login password '${role}';
    grant usage on schema public to ${role};
    alter default privileges in schema public grant select on tables to ${role};`;
}

function quiet(): void {
  // migrations log nothing in tests
}
