'use strict';
const express = require('express');
const db = require('../db');
const { uuid, randomCode, isUuid, HttpError, cleanText } = require('../lib/util');
const { sanitizeGame, isQuestionReady } = require('../lib/validate');
const { requireAuth } = require('../middleware/auth');
const { SUBJECTS } = require('../../shared/constants');

const router = express.Router();

function summary(row) {
  const questions = Array.isArray(row.questions) ? row.questions : [];
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    subject: row.subject,
    coverImage: row.cover_image,
    questionCount: questions.length,
    readyCount: questions.filter(isQuestionReady).length,
    isShared: row.is_shared,
    shareCode: row.share_code,
    plays: row.plays,
    lastPlayedAt: row.last_played_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function full(row) {
  const questions = Array.isArray(row.questions) ? row.questions : [];
  return {
    ...summary(row),
    settings: row.settings || {},
    questions: questions.map((q) => ({ ...q, ready: isQuestionReady(q) })),
  };
}

async function uniqueShareCode() {
  for (let i = 0; i < 10; i++) {
    const code = randomCode(8);
    const taken = await db.one('SELECT 1 FROM games WHERE share_code = $1', [code]);
    if (!taken) return code;
  }
  throw new HttpError(500, 'Não foi possível gerar um código de compartilhamento.');
}

async function insertGame(ownerId, data) {
  const clean = sanitizeGame(data);
  const row = await db.one(
    `INSERT INTO games (id, owner_id, title, description, subject, cover_image, questions, settings, share_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      uuid(),
      ownerId,
      clean.title,
      clean.description,
      clean.subject,
      clean.cover_image,
      JSON.stringify(clean.questions),
      JSON.stringify(clean.settings),
      await uniqueShareCode(),
    ]
  );
  return row;
}

async function ownedGame(req) {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Jogo não encontrado.');
  const row = await db.one('SELECT * FROM games WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]);
  if (!row) throw new HttpError(404, 'Jogo não encontrado.');
  return row;
}

// ---------- Rotas privadas ----------

router.get('/games', requireAuth, async (req, res) => {
  const params = [req.user.id];
  let where = 'owner_id = $1';
  const search = cleanText(req.query.search, 100);
  if (search) {
    params.push(`%${search.replace(/[%_\\]/g, (c) => '\\' + c)}%`);
    where += ` AND title ILIKE $${params.length}`;
  }
  if (SUBJECTS.includes(req.query.subject)) {
    params.push(req.query.subject);
    where += ` AND subject = $${params.length}`;
  }
  const rows = await db.query(`SELECT * FROM games WHERE ${where} ORDER BY updated_at DESC LIMIT 500`, params);
  const recent = await db.query(
    `SELECT * FROM games WHERE owner_id = $1
      ORDER BY GREATEST(updated_at, COALESCE(last_played_at, updated_at)) DESC LIMIT 4`,
    [req.user.id]
  );
  res.json({ games: rows.map(summary), recent: recent.map(summary) });
});

router.post('/games', requireAuth, async (req, res) => {
  const row = await insertGame(req.user.id, req.body || {});
  res.status(201).json({ game: full(row) });
});

router.get('/games/:id', requireAuth, async (req, res) => {
  res.json({ game: full(await ownedGame(req)) });
});

router.put('/games/:id', requireAuth, async (req, res) => {
  await ownedGame(req);
  const clean = sanitizeGame(req.body || {}, { partial: true });
  const fields = Object.keys(clean);
  if (!fields.length) throw new HttpError(400, 'Nada para salvar.');
  const sets = [];
  const params = [];
  for (const f of fields) {
    const value = f === 'questions' || f === 'settings' ? JSON.stringify(clean[f]) : clean[f];
    params.push(value);
    sets.push(`${f} = $${params.length}`);
  }
  params.push(req.params.id, req.user.id);
  const row = await db.one(
    `UPDATE games SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length - 1} AND owner_id = $${params.length} RETURNING *`,
    params
  );
  res.json({ game: full(row) });
});

router.delete('/games/:id', requireAuth, async (req, res) => {
  await ownedGame(req);
  await db.query('DELETE FROM games WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

router.post('/games/:id/duplicate', requireAuth, async (req, res) => {
  const src = await ownedGame(req);
  const row = await insertGame(req.user.id, {
    title: `${src.title} (cópia)`.slice(0, 120),
    description: src.description,
    subject: src.subject,
    cover_image: src.cover_image,
    questions: src.questions,
    settings: src.settings,
  });
  res.status(201).json({ game: full(row) });
});

router.post('/games/:id/share', requireAuth, async (req, res) => {
  await ownedGame(req);
  const shared = req.body && req.body.shared !== false;
  const row = await db.one(
    'UPDATE games SET is_shared = $1, updated_at = NOW() WHERE id = $2 AND owner_id = $3 RETURNING *',
    [shared, req.params.id, req.user.id]
  );
  res.json({ game: summary(row) });
});

// ---------- Jogos compartilhados (link público) ----------

async function sharedGame(code) {
  const c = String(code || '').toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(c)) throw new HttpError(404, 'Este link de jogo não existe.');
  const row = await db.one(
    `SELECT g.*, u.name AS owner_name FROM games g JOIN users u ON u.id = g.owner_id
      WHERE g.share_code = $1 AND g.is_shared = TRUE`,
    [c]
  );
  if (!row) throw new HttpError(404, 'Este jogo não está mais compartilhado.');
  return row;
}

router.get('/shared/:code', async (req, res) => {
  const row = await sharedGame(req.params.code);
  const game = full(row);
  delete game.isShared;
  res.json({ game: { ...game, ownerName: row.owner_name, isMine: !!req.user && req.user.id === row.owner_id } });
});

router.post('/shared/:code/copy', requireAuth, async (req, res) => {
  const src = await sharedGame(req.params.code);
  const row = await insertGame(req.user.id, {
    title: src.title,
    description: src.description,
    subject: src.subject,
    cover_image: src.cover_image,
    questions: src.questions,
    settings: src.settings,
  });
  res.status(201).json({ game: full(row) });
});

module.exports = router;
module.exports.insertGame = insertGame;
