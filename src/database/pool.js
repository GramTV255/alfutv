'use strict';
const { Pool, types } = require('pg');
const { config } = require('../config');
const logger = require('../utils/logger');

// Return BIGINT/NUMERIC counts as numbers where safe
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1700, (v) => parseFloat(v));

const pool = new Pool({
  connectionString: config.databaseUrl || undefined,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
  keepAlive: true,
  statement_timeout: 15000, // a stuck query frees its connection instead of piling up requests
  query_timeout: 20000,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Every connection works inside the app's own schema (created by the migration runner).
pool.on('connect', (client) => { client.query(`SET search_path TO ${config.dbSchema}, public`).catch(() => {}); });
pool.on('error', (err) => logger.error('Unexpected PG pool error', err));

const query = (text, params) => pool.query(text, params);

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
