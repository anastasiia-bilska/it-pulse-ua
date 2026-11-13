import type pg from 'pg';

/** Runs `work` inside a transaction: commits on success, rolls back and rethrows on failure. */
export async function inTransaction<T>(db: pg.Client, work: () => Promise<T>): Promise<T> {
  await db.query('begin');
  try {
    const result = await work();
    await db.query('commit');
    return result;
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}
