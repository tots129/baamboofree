'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

const COOKIE = 'jogae_sessao';

function signSession(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
}

function setSessionCookie(req, res, userId) {
  res.cookie(COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function verifyToken(raw) {
  if (!raw) return null;
  try {
    const payload = jwt.verify(raw, config.jwtSecret);
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch (_) {
    return null;
  }
}

/** Lê o cookie de sessão a partir do cabeçalho Cookie bruto (usado pelo Socket.IO). */
function userIdFromCookieHeader(header) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === COOKIE) {
      return verifyToken(decodeURIComponent(part.slice(idx + 1).trim()));
    }
  }
  return null;
}

function publicUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, avatar: row.avatar, createdAt: row.created_at };
}

async function loadUser(req, _res, next) {
  try {
    const userId = verifyToken(req.cookies && req.cookies[COOKIE]);
    req.user = userId ? publicUser(await db.one('SELECT * FROM users WHERE id = $1', [userId])) : null;
    next();
  } catch (err) {
    next(err);
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Entre na sua conta para continuar.' });
  next();
}

module.exports = {
  COOKIE,
  setSessionCookie,
  clearSessionCookie,
  userIdFromCookieHeader,
  publicUser,
  loadUser,
  requireAuth,
};
