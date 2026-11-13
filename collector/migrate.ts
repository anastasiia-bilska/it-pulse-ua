import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';

const dir = new URL('../db/migrations/', import.meta.url);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())');
const done = new Set((await db.query('select name from schema_migrations')).rows.map((r) => r.name));

for (const name of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
  if (done.has(name)) continue;
  await db.query('begin');
  try {
    await db.query(await readFile(new URL(name, dir), 'utf8'));
    await db.query('insert into schema_migrations (name) values ($1)', [name]);
    await db.query('commit');
    console.log('applied', name);
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}
await db.end();
