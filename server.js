'use strict';
/**
 * Quiz Livre — servidor sem dependências externas (apenas módulos nativos do Node).
 * Armazena os jogos em data/games.json e serve a interface em /public.
 *
 * Uso:  node server.js
 * Env:  PORT (padrão 3000) · HOST (padrão 127.0.0.1; use 0.0.0.0 para abrir na rede da sala)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
// Em hospedagens (Render etc.) a plataforma define PORT e precisamos ouvir em 0.0.0.0.
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
// Se definida, criar/editar/excluir jogos exige esta senha (jogar e estudar continuam livres).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DB_FILE = path.join(DATA_DIR, 'games.json');
const MAX_BODY = 2 * 1024 * 1024; // 2 MB

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/* ------------------------------ Banco (JSON) ------------------------------ */

function seedGames() {
  const q = (q, a, points = 10) => ({ q, a, points, image: '' });
  return [
    {
      id: 'exemplo',
      title: 'Exemplo: Conhecimentos gerais',
      updatedAt: new Date().toISOString(),
      questions: [
        q('Qual é a capital do Brasil?', 'Brasília'),
        q('Quantos planetas existem no Sistema Solar?', '8'),
        q('Qual é o maior oceano do mundo?', 'Oceano Pacífico'),
        q('Quem pintou a Mona Lisa?', 'Leonardo da Vinci', 20),
        q('Qual é o resultado de 7 × 8?', '56'),
        q('Em que continente fica o Egito?', 'África'),
        q('Qual gás as plantas absorvem para fazer fotossíntese?', 'Gás carbônico (CO₂)', 20),
        q('Quantos lados tem um hexágono?', '6'),
        q('Qual é o idioma mais falado no mundo (nativos)?', 'Mandarim', 20),
        q('Qual é o menor país do mundo?', 'Vaticano'),
        q('Qual animal é conhecido como o rei da selva?', 'Leão'),
        q('Quantos dias tem um ano bissexto?', '366'),
      ],
    },
  ];
}

function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE); // escrita atômica
}

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      const db = { games: seedGames() };
      saveDb(db);
      return db;
    }
    throw err;
  }
}

/* ------------------------------- Validação -------------------------------- */

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const cleanStr = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const cleanUrl = (v) => {
  const s = cleanStr(v, 500);
  return /^https?:\/\//i.test(s) ? s : '';
};
const clampInt = (v, min, max, dflt) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

function sanitizeGame(body) {
  if (!body || typeof body !== 'object') throw httpError(400, 'Corpo da requisição inválido.');
  const title = cleanStr(body.title, 120);
  if (!title) throw httpError(400, 'Dê um título ao jogo.');
  if (!Array.isArray(body.questions)) throw httpError(400, 'Lista de perguntas inválida.');
  if (body.questions.length > 500) throw httpError(400, 'Máximo de 500 perguntas por jogo.');
  const questions = body.questions
    .map((x) => ({
      q: cleanStr(x && x.q, 1000),
      a: cleanStr(x && x.a, 1000),
      points: clampInt(x && x.points, 0, 1000, 10),
      image: cleanUrl(x && x.image),
    }))
    .filter((x) => x.q && x.a);
  if (!questions.length) throw httpError(400, 'Adicione pelo menos uma pergunta com resposta.');
  return { title, questions };
}

/* --------------------------------- HTTP ----------------------------------- */

function sendJson(res, status, data) {
  const body = data === null ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      if (tooBig) return;
      size += c.length;
      if (size > MAX_BODY) {
        tooBig = true;
        chunks.length = 0;
        reject(httpError(413, 'Conteúdo grande demais.'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return;
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(httpError(400, 'JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function isAdmin(req) {
  if (!ADMIN_PASSWORD) return true;
  const given = Buffer.from(String(req.headers['x-admin-password'] || ''));
  const wanted = Buffer.from(ADMIN_PASSWORD);
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}

async function handleApi(req, res, pathname) {
  const m = pathname.match(/^\/api\/games(?:\/([\w-]+))?$/);
  if (!m) throw httpError(404, 'Rota não encontrada.');
  if (req.method !== 'GET' && !isAdmin(req)) throw httpError(401, 'Senha de administrador necessária ou incorreta.');
  const id = m[1];
  const db = loadDb();

  if (!id) {
    if (req.method === 'GET') {
      return sendJson(
        res,
        200,
        db.games.map((g) => ({
          id: g.id,
          title: g.title,
          count: g.questions.length,
          updatedAt: g.updatedAt,
        }))
      );
    }
    if (req.method === 'POST') {
      const game = { id: crypto.randomBytes(4).toString('hex'), ...sanitizeGame(await readBody(req)), updatedAt: new Date().toISOString() };
      db.games.push(game);
      saveDb(db);
      return sendJson(res, 201, game);
    }
    throw httpError(405, 'Método não permitido.');
  }

  const idx = db.games.findIndex((g) => g.id === id);
  if (idx === -1) throw httpError(404, 'Jogo não encontrado.');

  if (req.method === 'GET') return sendJson(res, 200, db.games[idx]);
  if (req.method === 'PUT') {
    const game = { id, ...sanitizeGame(await readBody(req)), updatedAt: new Date().toISOString() };
    db.games[idx] = game;
    saveDb(db);
    return sendJson(res, 200, game);
  }
  if (req.method === 'DELETE') {
    db.games.splice(idx, 1);
    saveDb(db);
    return sendJson(res, 204, null);
  }
  throw httpError(405, 'Método não permitido.');
}

function serveStatic(res, pathname) {
  let filePath;
  try {
    filePath = path.join(PUBLIC_DIR, decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  } catch {
    res.writeHead(400).end('Requisição inválida');
    return;
  }
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end('Acesso negado');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' https: http: data:; style-src 'self' 'unsafe-inline'; script-src 'self'",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw httpError(405, 'Método não permitido.');
    serveStatic(res, pathname);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (pathname.startsWith('/api/')) sendJson(res, status, { error: status === 500 ? 'Erro interno do servidor.' : err.message });
    else res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(err.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🥔 Quiz Livre rodando em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (HOST === '0.0.0.0') console.log('   Escutando em todas as interfaces (acessível por outros dispositivos).');
  if (HOST === '0.0.0.0' && !ADMIN_PASSWORD) console.warn('   ⚠️  ADMIN_PASSWORD não definida: qualquer pessoa pode editar e apagar jogos.');
});
