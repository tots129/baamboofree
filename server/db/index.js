'use strict';
/**
 * Camada de banco de dados.
 *
 * - Produção (Render): PostgreSQL real via DATABASE_URL.
 * - Desenvolvimento local sem DATABASE_URL: PGlite (PostgreSQL completo embutido),
 *   salvo na pasta ./data. Assim `npm run dev` funciona sem instalar nada,
 *   usando exatamente o mesmo SQL da produção.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');

let driver = null; // { kind, query(sql, params) => rows, close() }

function sslOption(url) {
  if (config.databaseSsl === 'true') return { rejectUnauthorized: false };
  if (config.databaseSsl === 'false') return false;
  try {
    const host = new URL(url).hostname;
    // Hosts internos do Render (ex.: dpg-xxxx-a) e locais não usam SSL.
    if (!host.includes('.') || host === 'localhost' || host === '127.0.0.1') return false;
    return { rejectUnauthorized: false };
  } catch (_) {
    return false;
  }
}

async function connect() {
  if (driver) return driver;

  if (config.databaseUrl) {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: sslOption(config.databaseUrl),
      max: 10,
      idleTimeoutMillis: 30000,
    });
    pool.on('error', (err) => console.error('[db] erro no pool:', err.message));
    await pool.query('SELECT 1');
    driver = {
      kind: 'postgres',
      persistent: true,
      async query(sql, params = []) {
        const res = await pool.query(sql, params);
        return res.rows;
      },
      async exec(sql) {
        await pool.query(sql);
      },
      close: () => pool.end(),
    };
    console.log('[db] Conectado ao PostgreSQL.');
  } else {
    if (config.isProduction) {
      console.warn(
        '[db] ATENÇÃO: DATABASE_URL não está definida em produção. Usando banco local temporário — ' +
          'os dados podem ser perdidos em um novo deploy. Conecte um PostgreSQL (veja o README).'
      );
    }
    const dir = path.join(config.localDataDir, 'pglite');
    fs.mkdirSync(dir, { recursive: true });
    const { PGlite } = await import('@electric-sql/pglite');
    const db = await PGlite.create(dir);
    driver = {
      kind: 'pglite',
      persistent: !config.isProduction,
      async query(sql, params = []) {
        const res = await db.query(sql, params);
        return res.rows;
      },
      async exec(sql) {
        await db.exec(sql);
      },
      close: () => db.close(),
    };
    console.log(`[db] Usando PostgreSQL embutido (PGlite) em ${dir}`);
  }

  await migrate();
  return driver;
}

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await driver.exec(schema);
}

async function query(sql, params) {
  if (!driver) await connect();
  return driver.query(sql, params);
}

async function one(sql, params) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

function info() {
  return driver ? { kind: driver.kind, persistent: driver.persistent } : { kind: 'none', persistent: false };
}

async function close() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

module.exports = { connect, query, one, info, close };
