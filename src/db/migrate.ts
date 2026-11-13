import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { inTransaction } from './db.ts';

const MIGRATIONS_DIRECTORY = new URL('../../db/migrations/', import.meta.url);

const CREATE_LEDGER_SQL = `
  create table if not exists schema_migrations (
    name       text primary key,
    applied_at timestamptz default now()
  )`;

/** Applies pending db/migrations/*.sql in file-name order, each in its own transaction. */
export async function migrate(
  connectionString: string,
  log: (line: string) => void = console.log,
): Promise<void> {
  const db = new pg.Client({ connectionString });
  await db.connect();
  try {
    await db.query(CREATE_LEDGER_SQL);
    const pending = await pendingMigrations(db);
    for (const name of pending) {
      await applyMigration(db, name);
      log(`applied ${name}`);
    }
  } finally {
    await db.end();
  }
}

async function pendingMigrations(db: pg.Client): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIRECTORY);
  const { rows } = await db.query<{ name: string }>('select name from schema_migrations');
  const applied = new Set(rows.map((row) => row.name));
  // Default sort = code-unit order, so 001_ < 002_ < 010_.
  return files.filter((file) => file.endsWith('.sql') && !applied.has(file)).toSorted();
}

async function applyMigration(db: pg.Client, name: string): Promise<void> {
  const sql = await readFile(new URL(name, MIGRATIONS_DIRECTORY), 'utf8');
  await inTransaction(db, async () => {
    await db.query(sql);
    await db.query('insert into schema_migrations (name) values ($1)', [name]);
  });
}

const isEntryPoint = import.meta.filename === path.resolve(process.argv[1] ?? '');
if (isEntryPoint) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  await migrate(connectionString);
}
