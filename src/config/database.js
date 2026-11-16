const { Pool } = require('pg');

const ssl = String(process.env.DB_SSL).toLowerCase() === 'true'
  ? { rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED).toLowerCase() !== 'false' }
  : false;

const pool = new Pool(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl, max: 10 }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      ssl, max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

pool.on('error', (e) => console.error('PG pool error:', e.message));

async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally { c.release(); }
}

module.exports = { pool, query: (t, p) => pool.query(t, p), tx };
