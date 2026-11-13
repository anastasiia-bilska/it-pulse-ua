import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dir = new URL('../db/migrations/', import.meta.url);

export async function migrate(connectionString: string, log: (s: string) => void = console.log) {
  const db = new pg.Client({ connectionString });
  await db.connect();
  try {
    await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())');
    const done = new Set((await db.query('select name from schema_migrations')).rows.map((r) => r.name));
    for (const name of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(name)) continue;
      await db.query('begin');
      try {
        await db.query(await readFile(new URL(name, dir), 'utf8'));
        await db.query('insert into schema_migrations (name) values ($1)', [name]);
        await db.query('commit');
        log(`applied ${name}`);
      } catch (e) {
        await db.query('rollback');
        throw e;
      }
    }
  } finally {
    await db.end();
  }
}

if (import.meta.filename === resolve(process.argv[1])) await migrate(process.env.DATABASE_URL!);
