'use strict';
/**
 * Camada de tempo real (Socket.IO). Toda ação passa por validação no servidor.
 */
const db = require('./db');
const { userIdFromCookieHeader } = require('./middleware/auth');
const { RoomManager } = require('./game/RoomManager');
const { GameError } = require('./game/Room');
const { sanitizeRoomConfig, sanitizeTeams } = require('./game/config');
const { isUuid, uuid } = require('./lib/util');

const manager = new RoomManager();
const DISCONNECT_GRACE_MS = 8000;

function safeAck(ack) {
  return typeof ack === 'function' ? ack : () => {};
}

function errorMessage(err) {
  if (err instanceof GameError) return err.message;
  console.error('[socket] erro inesperado:', err);
  return 'Algo deu errado no servidor. Tente de novo.';
}

function setup(io) {
  function broadcast(room) {
    if (room._broadcastQueued) return;
    room._broadcastQueued = true;
    setImmediate(() => {
      room._broadcastQueued = false;
      if (!manager.rooms.has(room.code)) return;
      const hostView = room.hostView();
      for (const sid of room.hostSockets) io.to(sid).emit('room:state', hostView);
      if (room.displaySockets.size) {
        const displayView = room.displayView();
        for (const sid of room.displaySockets) io.to(sid).emit('room:state', displayView);
      }
      for (const p of room.players.values()) {
        if (p.socketId && !p.kicked) io.to(p.socketId).emit('room:state', room.playerView(p.id));
      }
    });
  }

  async function saveMatch(room) {
    const results = room.results.ranking.map((r) => ({
      name: r.name,
      place: r.place,
      score: r.score,
      position: r.position,
      correct: r.correct,
    }));
    await db.query(
      `INSERT INTO matches (id, owner_id, game_id, game_title, mode, results, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), NOW())
       ON CONFLICT (id) DO UPDATE SET results = EXCLUDED.results, finished_at = NOW()`,
      [room.matchId || uuid(), room.hostUserId, room.gameId, room.gameTitle, room.config.mode, JSON.stringify(results), room.startedAt || Date.now()]
    );
  }

  function attachSocketToRoom(socket, room, role, playerId = null) {
    socket.join(`room:${room.code}`);
    socket.data.code = room.code;
    socket.data.role = role;
    socket.data.playerId = playerId;
    if (role === 'host') room.hostSockets.add(socket.id);
    if (role === 'display') room.displaySockets.add(socket.id);
  }

  function detach(socket) {
    const room = manager.get(socket.data.code);
    if (!room) return;
    if (socket.data.role === 'host') room.hostSockets.delete(socket.id);
    if (socket.data.role === 'display') room.displaySockets.delete(socket.id);
    if (socket.data.role === 'player') {
      const p = room.players.get(socket.data.playerId);
      if (p && p.socketId === socket.id) {
        room.setConnected(p.id, null);
        // Pequenas quedas (celular bloqueou a tela, troca de rede) não encerram a pergunta:
        // só depois de alguns segundos desconectado a rodada deixa de esperar por ele.
        setTimeout(() => {
          try {
            room.checkAllAnswered();
          } catch (err) {
            console.error('[sala] erro ao verificar respostas:', err);
          }
        }, DISCONNECT_GRACE_MS).unref();
      }
    }
    socket.leave(`room:${room.code}`);
    socket.data.code = null;
    socket.data.role = null;
  }

  function requireHost(socket, code) {
    const room = manager.get(code || socket.data.code);
    if (!room) throw new GameError('Esta sala não existe mais.');
    if (!socket.data.userId || socket.data.userId !== room.hostUserId) {
      throw new GameError('Apenas quem criou a partida pode controlá-la.');
    }
    return room;
  }

  function requirePlayer(socket) {
    const room = manager.get(socket.data.code);
    if (!room || socket.data.role !== 'player') throw new GameError('Você não está em uma partida.');
    const p = room.players.get(socket.data.playerId);
    if (!p || p.kicked) throw new GameError('Você não está mais nesta partida.');
    return { room, player: p };
  }

  io.use((socket, next) => {
    socket.data.userId = userIdFromCookieHeader(socket.handshake.headers.cookie);
    next();
  });

  io.on('connection', (socket) => {
    // Limite simples de eventos por conexão (proteção contra abuso).
    let bucket = 40;
    const refill = setInterval(() => (bucket = Math.min(40, bucket + 8)), 1000);

    function on(event, handler) {
      socket.on(event, async (payload, ack) => {
        const reply = safeAck(ack);
        if (--bucket < 0) return reply({ ok: false, error: 'Calma! Muitas ações em pouco tempo.' });
        try {
          const result = await handler(payload && typeof payload === 'object' ? payload : {});
          reply({ ok: true, ...(result || {}) });
        } catch (err) {
          reply({ ok: false, error: errorMessage(err) });
        }
      });
    }

    // ---------- Administrador ----------

    on('host:create', async ({ gameId, config }) => {
      if (!socket.data.userId) throw new GameError('Entre na sua conta para criar uma partida.');
      if (!isUuid(gameId)) throw new GameError('Escolha um jogo válido.');
      const game = await db.one('SELECT * FROM games WHERE id = $1 AND owner_id = $2', [gameId, socket.data.userId]);
      if (!game) throw new GameError('Jogo não encontrado na sua biblioteca.');
      const room = manager.create({
        hostUserId: socket.data.userId,
        game,
        config: sanitizeRoomConfig(config, game.settings),
        onChange: broadcast,
        onFinish: (r) => saveMatch(r).catch((err) => console.error('[db] erro ao salvar partida:', err.message)),
      });
      detach(socket);
      attachSocketToRoom(socket, room, 'host');
      await db.query('UPDATE games SET plays = plays + 1, last_played_at = NOW() WHERE id = $1', [game.id]);
      broadcast(room);
      return { code: room.code };
    });

    on('host:attach', async ({ code }) => {
      const room = requireHost(socket, code);
      detach(socket);
      attachSocketToRoom(socket, room, 'host');
      broadcast(room);
      return { code: room.code };
    });

    on('host:action', async ({ code, action, ...data }) => {
      const room = requireHost(socket, code);
      switch (action) {
        case 'start':
          room.start();
          break;
        case 'reveal':
          room.reveal();
          break;
        case 'next':
          room.next();
          break;
        case 'end':
          room.end();
          break;
        case 'restart':
          room.restart();
          break;
        case 'kick': {
          const sid = room.kick(String(data.playerId || ''));
          if (sid) {
            io.to(sid).emit('room:kicked', { message: 'Você foi removido da partida pelo administrador.' });
            const s = io.sockets.sockets.get(sid);
            if (s) {
              s.leave(`room:${room.code}`);
              s.data.code = null;
              s.data.role = null;
            }
          }
          break;
        }
        case 'answer':
          room.presenterAnswer({
            competitorId: typeof data.competitorId === 'string' ? data.competitorId : null,
            value: data.value,
            judge: typeof data.judge === 'boolean' ? data.judge : undefined,
          });
          break;
        case 'power':
          room.usePowerup(
            { type: 'host' },
            { competitorId: String(data.competitorId || ''), powerup: String(data.powerup || ''), targetId: data.targetId ? String(data.targetId) : null }
          );
          break;
        case 'teams': {
          if (room.phase !== 'lobby') throw new GameError('As equipes só podem ser alteradas antes do jogo.');
          if (room.config.playStyle !== 'teams') throw new GameError('Esta partida não usa equipes.');
          const teams = sanitizeTeams(data.teams, Array.isArray(data.teams) ? data.teams.length : undefined);
          room.teams = teams;
          room.config.teams = teams;
          for (const p of room.players.values()) {
            if (p.teamId && !teams.some((t) => t.id === p.teamId)) p.teamId = room.smallestTeam().id;
          }
          room.changed();
          break;
        }
        case 'close': {
          io.to(`room:${room.code}`).emit('room:closed', { message: 'O administrador encerrou a sala.' });
          manager.remove(room.code);
          break;
        }
        default:
          throw new GameError('Ação desconhecida.');
      }
    });

    // ---------- Tela de apresentação (somente leitura) ----------

    on('display:attach', async ({ code }) => {
      const room = manager.get(code);
      if (!room) throw new GameError('Sala não encontrada. Confira o código.');
      detach(socket);
      attachSocketToRoom(socket, room, 'display');
      broadcast(room);
      return { code: room.code };
    });

    // ---------- Participantes ----------

    on('room:peek', async ({ code }) => {
      const room = manager.get(code);
      if (!room) throw new GameError('Sala não encontrada. Confira o código com o professor.');
      return {
        room: {
          code: room.code,
          gameTitle: room.gameTitle,
          mode: room.config.mode,
          playStyle: room.config.playStyle,
          answerSource: room.config.answerSource,
          phase: room.phase,
          teams: room.teams.map((t) => ({ ...t, members: room.membersOf(t.id).length })),
        },
      };
    });

    on('player:join', async ({ code, name, character, color, teamId }) => {
      const room = manager.get(code);
      if (!room) throw new GameError('Sala não encontrada. Confira o código com o professor.');
      const player = room.addPlayer({ name, character, color, teamId });
      detach(socket);
      attachSocketToRoom(socket, room, 'player', player.id);
      room.setConnected(player.id, socket.id);
      return { code: room.code, playerId: player.id, token: player.token };
    });

    on('player:rejoin', async ({ code, token }) => {
      const room = manager.get(code);
      if (!room) throw new GameError('Esta partida não existe mais.');
      const player = room.findPlayerByToken(token);
      if (!player) throw new GameError('Não encontramos você nesta partida. Entre de novo.');
      // Se havia outra aba conectada com o mesmo participante, ela é desligada.
      if (player.socketId && player.socketId !== socket.id) {
        const old = io.sockets.sockets.get(player.socketId);
        if (old) {
          old.emit('room:kicked', { message: 'Você entrou em outra aba ou dispositivo.' });
          old.data.code = null;
          old.data.role = null;
          old.leave(`room:${room.code}`);
        }
      }
      detach(socket);
      attachSocketToRoom(socket, room, 'player', player.id);
      room.setConnected(player.id, socket.id);
      return { code: room.code, playerId: player.id };
    });

    on('player:update', async (data) => {
      const { room, player } = requirePlayer(socket);
      room.updatePlayer(player.id, {
        character: typeof data.character === 'string' ? data.character : undefined,
        color: typeof data.color === 'string' ? data.color : undefined,
        teamId: typeof data.teamId === 'string' ? data.teamId : undefined,
      });
    });

    on('player:answer', async ({ value }) => {
      const { room, player } = requirePlayer(socket);
      if (typeof value !== 'string') throw new GameError('Resposta inválida.');
      return room.submitAnswer(player.id, value);
    });

    on('player:power', async ({ powerup, targetId }) => {
      const { room, player } = requirePlayer(socket);
      room.usePowerup(
        { type: 'player', playerId: player.id },
        { powerup: String(powerup || ''), targetId: targetId ? String(targetId) : null }
      );
    });

    on('player:leave', async () => {
      const room = manager.get(socket.data.code);
      if (room && socket.data.role === 'player') {
        const pid = socket.data.playerId;
        detach(socket);
        room.kick(pid);
      } else detach(socket);
    });

    socket.on('disconnect', () => {
      clearInterval(refill);
      detach(socket);
    });
  });

  return manager;
}

module.exports = { setup, manager };
