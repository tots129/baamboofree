'use strict';
/**
 * Imagens enviadas pelos usuários ficam no PostgreSQL (armazenamento persistente
 * externo ao servidor), nunca na pasta temporária do Render.
 * O navegador reduz e comprime a imagem antes de enviar.
 */
const express = require('express');
const db = require('../db');
const config = require('../config');
const { uuid, isUuid, HttpError } = require('../lib/util');
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('../lib/rateLimit');

const router = express.Router();

function sniffMime(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  return null;
}

router.post(
  '/images',
  requireAuth,
  rateLimit({ windowMs: 10 * 60 * 1000, max: 120, message: 'Muitos envios de imagem. Aguarde alguns minutos.' }),
  express.raw({ type: ['image/*', 'application/octet-stream'], limit: config.maxImageBytes }),
  async (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) throw new HttpError(400, 'Envie um arquivo de imagem.');
    const mime = sniffMime(buf);
    if (!mime) throw new HttpError(415, 'Formato não suportado. Use JPG, PNG, WEBP ou GIF.');
    const id = uuid();
    await db.query('INSERT INTO images (id, owner_id, mime, data, size) VALUES ($1, $2, $3, $4, $5)', [
      id,
      req.user.id,
      mime,
      buf,
      buf.length,
    ]);
    res.status(201).json({ id, url: `/api/images/${id}` });
  }
);

router.get('/images/:id', async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Imagem não encontrada.');
  const row = await db.one('SELECT mime, data FROM images WHERE id = $1', [req.params.id]);
  if (!row) throw new HttpError(404, 'Imagem não encontrada.');
  const data = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(data);
});

module.exports = router;
