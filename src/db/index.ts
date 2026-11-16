// Public API of the db module. Other modules import only from here (tests: from ./testing.ts).
// migrate.ts is the CLI (`npm run migrate`), not part of the API: re-exporting it would pull its
// top-level await into the «Запитай ринок» Pages Function, which Cloudflare's bundler rejects.
export { inTransaction } from './db.ts';
