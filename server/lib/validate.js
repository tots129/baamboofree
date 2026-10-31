'use strict';
const { SUBJECTS, LIMITS, CHARACTERS, COLORS } = require('../../shared/constants');
const { cleanText, clampInt, isUuid, uuid, HttpError } = require('./util');

const SHORT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
function safeId(v) {
  return typeof v === 'string' && SHORT_ID_RE.test(v) ? v : uuid().slice(0, 8);
}

/**
 * Limpa e valida uma pergunta. Nunca confia no formato enviado pelo navegador.
 * Perguntas incompletas são aceitas como rascunho (para o salvamento automático),
 * mas marcadas com `ready: false` e ignoradas na hora de jogar.
 */
function sanitizeQuestion(input, defaults) {
  const q = input && typeof input === 'object' ? input : {};
  const type = q.type === 'open' ? 'open' : 'multiple';
  const out = {
    id: safeId(q.id),
    type,
    text: cleanText(q.text, LIMITS.questionTextMax),
    image: isUuid(q.image) ? q.image : null,
    points: clampInt(q.points, 0, 1000, defaults.points),
    time: q.time === null || q.time === '' || q.time === undefined ? null : clampInt(q.time, 5, 300, null),
    options: [],
    correct: null,
    answers: [],
  };

  if (type === 'multiple') {
    const opts = Array.isArray(q.options) ? q.options.slice(0, LIMITS.optionsMax) : [];
    const seen = new Set();
    for (const o of opts) {
      if (!o || typeof o !== 'object') continue;
      let id = safeId(o.id);
      while (seen.has(id)) id = uuid().slice(0, 8);
      seen.add(id);
      out.options.push({ id, text: cleanText(o.text, LIMITS.optionTextMax) });
    }
    out.correct = out.options.some((o) => o.id === q.correct) ? q.correct : null;
  } else {
    const answers = Array.isArray(q.answers) ? q.answers : [];
    out.answers = answers
      .map((a) => cleanText(a, LIMITS.optionTextMax))
      .filter(Boolean)
      .slice(0, LIMITS.acceptedAnswersMax);
  }
  return out;
}

function isQuestionReady(q) {
  if (!q.text && !q.image) return false;
  if (q.type === 'multiple') {
    const filled = q.options.filter((o) => o.text);
    return filled.length >= LIMITS.optionsMin && !!q.correct && filled.some((o) => o.id === q.correct);
  }
  return q.answers.length > 0;
}

function sanitizeSettings(input) {
  const s = input && typeof input === 'object' ? input : {};
  return {
    defaultTime: clampInt(s.defaultTime, 0, 300, 20),
    defaultPoints: clampInt(s.defaultPoints, 0, 1000, 10),
  };
}

function sanitizeGame(input, { partial = false } = {}) {
  const g = input && typeof input === 'object' ? input : {};
  const out = {};

  if (!partial || 'title' in g) {
    out.title = cleanText(g.title, LIMITS.titleMax) || 'Jogo sem título';
  }
  if (!partial || 'description' in g) out.description = cleanText(g.description, LIMITS.descriptionMax);
  if (!partial || 'subject' in g) out.subject = SUBJECTS.includes(g.subject) ? g.subject : 'Geral';
  if (!partial || 'cover_image' in g || 'coverImage' in g) {
    const c = g.cover_image !== undefined ? g.cover_image : g.coverImage;
    out.cover_image = isUuid(c) ? c : null;
  }
  if (!partial || 'settings' in g) out.settings = sanitizeSettings(g.settings);
  if (!partial || 'questions' in g) {
    if (g.questions !== undefined && !Array.isArray(g.questions)) {
      throw new HttpError(400, 'O campo de perguntas é inválido.');
    }
    const list = Array.isArray(g.questions) ? g.questions : [];
    if (list.length > LIMITS.questionsMax) {
      throw new HttpError(400, `Um jogo pode ter no máximo ${LIMITS.questionsMax} perguntas.`);
    }
    const defaults = { points: (out.settings && out.settings.defaultPoints) || 10 };
    const ids = new Set();
    out.questions = list.map((q) => {
      const clean = sanitizeQuestion(q, defaults);
      while (ids.has(clean.id)) clean.id = uuid().slice(0, 8);
      ids.add(clean.id);
      return clean;
    });
  }
  if ('is_shared' in g || 'isShared' in g) {
    out.is_shared = Boolean(g.is_shared !== undefined ? g.is_shared : g.isShared);
  }
  return out;
}

function sanitizeAvatar(input) {
  const a = input && typeof input === 'object' ? input : {};
  return {
    character: CHARACTERS.some((c) => c.id === a.character) ? a.character : CHARACTERS[0].id,
    color: COLORS.includes(a.color) ? a.color : COLORS[0],
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validateEmail(email) {
  const e = cleanText(email, 200).toLowerCase();
  if (!EMAIL_RE.test(e)) throw new HttpError(400, 'Digite um e-mail válido.');
  return e;
}

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 6) throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres.');
  if (pw.length > 200) throw new HttpError(400, 'A senha é longa demais.');
  return pw;
}

function validateName(name) {
  const n = cleanText(name, 60);
  if (n.length < 2) throw new HttpError(400, 'Digite um nome com pelo menos 2 letras.');
  return n;
}

module.exports = {
  sanitizeGame,
  sanitizeQuestion,
  sanitizeSettings,
  isQuestionReady,
  sanitizeAvatar,
  validateEmail,
  validatePassword,
  validateName,
};
