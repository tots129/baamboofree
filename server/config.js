'use strict';
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
} catch (_) {
  /* dotenv é opcional */
}

const isProduction = process.env.NODE_ENV === 'production';

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProduction) {
    console.warn(
      '[config] ATENÇÃO: JWT_SECRET não definido. Usando um segredo temporário — ' +
        'todos precisarão entrar de novo após cada reinício. Defina JWT_SECRET nas variáveis de ambiente.'
    );
  }
  jwtSecret = require('crypto').randomBytes(32).toString('hex');
}

module.exports = {
  isProduction,
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || '',
  databaseSsl: process.env.DATABASE_SSL || 'auto', // auto | true | false
  localDataDir: process.env.LOCAL_DATA_DIR || path.join(__dirname, '..', 'data'),
  jwtSecret,
  sessionDays: 30,
  maxImageBytes: 2 * 1024 * 1024,
  distDir: path.join(__dirname, '..', 'dist'),
  corsOrigin: process.env.CORS_ORIGIN || '',
};
