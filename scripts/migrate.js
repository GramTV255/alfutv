'use strict';
// Safe migration runner: ordered .sql files, each applied once inside a transaction,
// guarded by a Postgres advisory lock so concurrent deploys cannot collide.
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/database/pool');

const DIR = path.join(__dirname, '..', 'migrations');
const LOCK_ID = 727274; // arbitrary constant

async function migrate({ quiet = false } = {}) {
  const log = (...a) => { if (!quiet) console.log(...a); };
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    const { config } = require('../src/config');
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${config.dbSchema}`);
    await client.query(`SET search_path TO ${config.dbSchema}, public`);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    let applied = 0;
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
      log(`Applying ${f} ...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await client.query('COMMIT');
        applied++;
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${f} failed: ${e.message}`);
      }
    }
    log(applied ? `Done. ${applied} migration(s) applied.` : 'Database is up to date.');
    return applied;
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]); } catch (_) { /* ignore */ }
    client.release();
  }
}

module.exports = { migrate };

if (require.main === module) {
  require('dotenv').config();
  migrate()
    .then(() => pool.end())
    .catch((e) => { console.error(e.message); process.exit(1); });
}
