'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const config = require('./config');
const db = require('./db');
const { seedDemos } = require('./db/seed');
const { loadUser } = require('./middleware/auth');
const sockets = require('./sockets');

async function createApp() {
  await db.connect();
  await seedDemos();

  const app = express();
  app.set('trust proxy', 1); // Render fica atrás de um proxy HTTPS
  app.disable('x-powered-by');
  app.use(compression());
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });
  app.use(cookieParser());

  // ---------- API ----------
  const api = express.Router();
  api.use(express.json({ limit: '1mb' }));
  api.use(loadUser);
  api.get('/health', (_req, res) => res.json({ ok: true, database: db.info(), rooms: sockets.manager.rooms.size }));
  api.use('/auth', require('./routes/auth'));
  api.use(require('./routes/games'));
  api.use(require('./routes/images'));
  api.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  // eslint-disable-next-line no-unused-vars
  api.use((err, _req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Arquivo grande demais (máximo de 2 MB).' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dados inválidos.' });
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error('[api] erro:', err);
    res.status(status).json({ error: status >= 500 ? 'Erro interno do servidor. Tente de novo.' : err.message });
  });
  app.use('/api', api);

  // ---------- Frontend ----------
  const indexFile = path.join(config.distDir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    console.warn('[server] Frontend não encontrado em dist/. Rode "npm run build" antes de "npm start".');
  }
  app.use(
    express.static(config.distDir, {
      index: false,
      setHeaders(res, file) {
        if (/\.(js|css)$/.test(file) && /-[A-Z0-9]{8}\./i.test(path.basename(file))) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );
  // Rotas do app de página única (/biblioteca, /jogar/ABC123 etc.)
  app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
    if (!fs.existsSync(indexFile)) {
      return res.status(503).send('Frontend não compilado. Rode "npm run build".');
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: config.corsOrigin ? { origin: config.corsOrigin.split(','), credentials: true } : undefined,
    pingInterval: 20000,
    pingTimeout: 25000,
  });
  sockets.setup(io);
  return { app, server, io };
}

async function main() {
  const { server } = await createApp();
  server.listen(config.port, config.host, () => {
    console.log(`[server] Jogaê! rodando em http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  });

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} recebido, encerrando...`);
    server.close();
    await db.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[server] Falha ao iniciar:', err);
    process.exit(1);
  });
}

module.exports = { createApp };
