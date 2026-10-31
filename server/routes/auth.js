'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { uuid, HttpError } = require('../lib/util');
const { validateEmail, validatePassword, validateName, sanitizeAvatar } = require('../lib/validate');
const { setSessionCookie, clearSessionCookie, publicUser, requireAuth } = require('../middleware/auth');
const { copyDemoGamesTo } = require('../db/seed');
const rateLimit = require('../lib/rateLimit');

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

router.post('/register', authLimiter, async (req, res) => {
  const name = validateName(req.body.name);
  const email = validateEmail(req.body.email);
  const password = validatePassword(req.body.password);

  const exists = await db.one('SELECT id FROM users WHERE email = $1', [email]);
  if (exists) throw new HttpError(409, 'Já existe uma conta com este e-mail. Tente entrar.');

  const hash = await bcrypt.hash(password, 12);
  const id = uuid();
  const avatar = sanitizeAvatar(req.body.avatar);
  const row = await db.one(
    'INSERT INTO users (id, name, email, password_hash, avatar) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [id, name, email, hash, JSON.stringify(avatar)]
  );
  // Todo usuário novo começa com os jogos de demonstração na biblioteca.
  await copyDemoGamesTo(id).catch((err) => console.error('[seed] falha ao copiar demos:', err.message));

  setSessionCookie(req, res, id);
  res.status(201).json({ user: publicUser(row) });
});

router.post('/login', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const row = email ? await db.one('SELECT * FROM users WHERE email = $1', [email]) : null;
  const ok = row && row.password_hash !== '!' && (await bcrypt.compare(password, row.password_hash));
  if (!ok) throw new HttpError(401, 'E-mail ou senha incorretos.');
  setSessionCookie(req, res, row.id);
  res.json({ user: publicUser(row) });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user || null });
});

router.patch('/me', requireAuth, async (req, res) => {
  const updates = [];
  const params = [];
  if ('name' in req.body) {
    params.push(validateName(req.body.name));
    updates.push(`name = $${params.length}`);
  }
  if ('avatar' in req.body) {
    params.push(JSON.stringify(sanitizeAvatar(req.body.avatar)));
    updates.push(`avatar = $${params.length}`);
  }
  if (!updates.length) throw new HttpError(400, 'Nada para atualizar.');
  params.push(req.user.id);
  const row = await db.one(`UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  res.json({ user: publicUser(row) });
});

router.post('/password', requireAuth, authLimiter, async (req, res) => {
  const row = await db.one('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const ok = await bcrypt.compare(String(req.body.currentPassword || ''), row.password_hash);
  if (!ok) throw new HttpError(400, 'A senha atual está incorreta.');
  const hash = await bcrypt.hash(validatePassword(req.body.newPassword), 12);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
  res.json({ ok: true });
});

router.get('/stats', requireAuth, async (req, res) => {
  const g = await db.one(
    `SELECT COUNT(*)::int AS games, COALESCE(SUM(jsonb_array_length(questions)), 0)::int AS questions,
            COALESCE(SUM(plays), 0)::int AS plays
       FROM games WHERE owner_id = $1`,
    [req.user.id]
  );
  const matches = await db.query(
    `SELECT id, game_id, game_title, mode, results, started_at, finished_at
       FROM matches WHERE owner_id = $1 ORDER BY started_at DESC LIMIT 12`,
    [req.user.id]
  );
  const m = await db.one('SELECT COUNT(*)::int AS total FROM matches WHERE owner_id = $1', [req.user.id]);
  res.json({
    games: g.games,
    questions: g.questions,
    plays: g.plays,
    matches: m.total,
    recentMatches: matches.map((r) => ({
      id: r.id,
      gameId: r.game_id,
      gameTitle: r.game_title,
      mode: r.mode,
      winner: Array.isArray(r.results) && r.results[0] ? r.results[0].name : null,
      participants: Array.isArray(r.results) ? r.results.length : 0,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    })),
  });
});

module.exports = router;
