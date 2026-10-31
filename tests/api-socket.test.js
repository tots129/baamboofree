'use strict';
/**
 * Teste de integração: API HTTP + multiplayer Socket.IO + persistência.
 * Usa DATABASE_URL se definida; senão, o PostgreSQL embutido (PGlite) numa pasta temporária.
 *   node tests/api-socket.test.js
 */
const assert = require('assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

if (!process.env.DATABASE_URL) {
  process.env.LOCAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jogae-test-'));
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';

const { io: ioClient } = require('socket.io-client');

let base;
let server;

async function start() {
  // Recarrega os módulos para simular um reinício completo do servidor.
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}server${path.sep}`)) delete require.cache[k];
  const { createApp } = require('../server/index');
  const app = await createApp();
  server = app.server;
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  return app;
}

async function stop(app) {
  app.io.close();
  await new Promise((r) => server.close(r));
  await require('../server/db').close();
}

function client() {
  let cookie = '';
  async function req(method, url, body, headers = {}) {
    const opts = { method, headers: { ...headers } };
    if (cookie) opts.headers.cookie = cookie;
    if (body !== undefined) {
      if (Buffer.isBuffer(body)) opts.body = body;
      else {
        opts.body = JSON.stringify(body);
        opts.headers['content-type'] = 'application/json';
      }
    }
    const res = await fetch(base + url, opts);
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data };
  }
  return {
    req,
    get cookie() {
      return cookie;
    },
  };
}

function sock(cookie) {
  return ioClient(base, { transports: ['websocket'], extraHeaders: cookie ? { cookie } : {}, forceNew: true });
}

function emit(s, ev, payload) {
  return new Promise((resolve, reject) => {
    s.emit(ev, payload, (res) => (res && res.ok ? resolve(res) : reject(new Error(res && res.error))));
  });
}

function nextState(s, pred = () => true, ms = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      s.off('room:state', fn);
      reject(new Error('timeout esperando estado'));
    }, ms);
    function fn(st) {
      if (pred(st)) {
        clearTimeout(t);
        s.off('room:state', fn);
        resolve(st);
      }
    }
    s.on('room:state', fn);
  });
}

const connected = (s) => new Promise((r) => (s.connected ? r() : s.once('connect', r)));

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name);
    throw err;
  }
}

(async () => {
  console.log(`Integração (${process.env.DATABASE_URL ? 'PostgreSQL' : 'PGlite'})`);
  let app = await start();
  const ana = client();
  const beto = client();
  const email = `ana${Date.now()}@teste.com`;
  let gameId;
  let shareCode;

  await test('cadastro valida dados e cria sessão', async () => {
    let r = await ana.req('POST', '/api/auth/register', { name: 'A', email: 'x', password: '1' });
    assert.equal(r.status, 400);
    r = await ana.req('POST', '/api/auth/register', { name: 'Ana Professora', email, password: 'segredo123' });
    assert.equal(r.status, 201);
    assert.ok(ana.cookie.startsWith('jogae_sessao='));
    r = await ana.req('POST', '/api/auth/register', { name: 'Ana', email, password: 'segredo123' });
    assert.equal(r.status, 409);
  });

  await test('login, sessão e rota privada', async () => {
    const anon = client();
    let r = await anon.req('GET', '/api/games');
    assert.equal(r.status, 401);
    r = await anon.req('POST', '/api/auth/login', { email, password: 'errada' });
    assert.equal(r.status, 401);
    r = await ana.req('GET', '/api/auth/me');
    assert.equal(r.data.user.name, 'Ana Professora');
  });

  await test('nova conta já vem com jogos de demonstração', async () => {
    const r = await ana.req('GET', '/api/games');
    assert.ok(r.data.games.length >= 4);
    assert.ok(r.data.games.every((g) => g.readyCount > 0));
  });

  await test('criar, salvar perguntas, pesquisar e filtrar', async () => {
    let r = await ana.req('POST', '/api/games', { title: 'Frações divertidas', subject: 'Matemática' });
    assert.equal(r.status, 201);
    gameId = r.data.game.id;
    r = await ana.req('PUT', `/api/games/${gameId}`, {
      description: 'Teste',
      questions: [
        { id: 'q1', type: 'multiple', text: 'Metade de 10?', options: [{ id: 'a', text: '5' }, { id: 'b', text: '2' }], correct: 'a', points: 10 },
        { id: 'q2', type: 'open', text: 'Quanto é 2+2?', answers: ['4', 'quatro'], points: 20 },
        { id: 'q3', type: 'multiple', text: '<script>alert(1)</script>', options: [{ id: 'a', text: 'só uma' }] },
      ],
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.game.questions.length, 3);
    assert.equal(r.data.game.readyCount, 2);
    r = await ana.req('GET', '/api/games?search=fra%C3%A7%C3%B5es');
    assert.equal(r.data.games.length, 1);
    r = await ana.req('GET', '/api/games?subject=Geografia');
    assert.ok(r.data.games.every((g) => g.subject === 'Geografia'));
  });

  await test('outra conta não acessa jogo alheio', async () => {
    await beto.req('POST', '/api/auth/register', { name: 'Beto', email: `beto${Date.now()}@teste.com`, password: 'segredo123' });
    let r = await beto.req('GET', `/api/games/${gameId}`);
    assert.equal(r.status, 404);
    r = await beto.req('PUT', `/api/games/${gameId}`, { title: 'hack' });
    assert.equal(r.status, 404);
  });

  await test('duplicar e compartilhar', async () => {
    let r = await ana.req('POST', `/api/games/${gameId}/duplicate`);
    assert.equal(r.status, 201);
    assert.match(r.data.game.title, /cópia/);
    r = await ana.req('POST', `/api/games/${gameId}/share`, { shared: true });
    shareCode = r.data.game.shareCode;
    r = await client().req('GET', `/api/shared/${shareCode}`);
    assert.equal(r.status, 200);
    r = await beto.req('POST', `/api/shared/${shareCode}/copy`);
    assert.equal(r.status, 201);
    await ana.req('POST', `/api/games/${gameId}/share`, { shared: false });
    r = await client().req('GET', `/api/shared/${shareCode}`);
    assert.equal(r.status, 404);
  });

  await test('upload de imagem fica no banco', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    let r = await ana.req('POST', '/api/images', png, { 'content-type': 'image/png' });
    assert.equal(r.status, 201);
    const id = r.data.id;
    r = await client().req('GET', `/api/images/${id}`);
    assert.equal(r.status, 200);
    assert.equal(Buffer.from(r.data).length, png.length);
    r = await ana.req('POST', '/api/images', Buffer.from('não é imagem'), { 'content-type': 'image/png' });
    assert.equal(r.status, 415);
  });

  // ---------------------------------------------------------- multiplayer
  await test('Classic Quiz com 2 participantes, validação no servidor e reconexão', async () => {
    const host = sock(ana.cookie);
    await connected(host);
    const anon = sock();
    await connected(anon);
    await assert.rejects(emit(anon, 'host:create', { gameId }), /Entre na sua conta/);
    const hostReady = nextState(host, (s) => s.phase === 'lobby');
    const { code } = await emit(host, 'host:create', { gameId, config: { mode: 'classic', timer: 0, shuffleQuestions: false, speedBonus: false } });
    await hostReady;
    assert.match(code, /^[A-Z0-9]{6}$/);

    const p1 = sock();
    const p2 = sock();
    await Promise.all([connected(p1), connected(p2)]);
    // (listeners são registrados antes das ações para não perder estados)
    const lobbyP = nextState(host, (s) => s.players.length === 2);
    const j1 = await emit(p1, 'player:join', { code, name: 'Lia', character: 'rex', color: '#3DDC97' });
    const j2 = await emit(p2, 'player:join', { code, name: 'Lia' });
    const lobby = await lobbyP;
    assert.deepEqual(lobby.players.map((p) => p.name).sort(), ['Lia', 'Lia 2']);

    // Participante não consegue controlar a partida
    await assert.rejects(emit(p1, 'host:action', { code, action: 'start' }), /Apenas quem criou/);

    const q1p = nextState(p1, (s) => s.phase === 'question');
    await emit(host, 'host:action', { code, action: 'start' });
    const q1 = await q1p;
    assert.equal(q1.question.correct, undefined, 'resposta correta não vai para o celular antes da hora');
    assert.equal(q1.you.myTurn, true);

    // Resposta inválida é recusada
    await assert.rejects(emit(p1, 'player:answer', { value: 'nao-existe' }), /inválida/);
    await emit(p1, 'player:answer', { value: 'a' });
    await assert.rejects(emit(p1, 'player:answer', { value: 'a' }), /já foi registrada/);

    // Reconexão: p2 cai e volta com o token
    p2.disconnect();
    await nextState(host, (s) => s.players.some((p) => p.name === 'Lia 2' && !p.connected));
    const p2b = sock();
    await connected(p2b);
    const backP = nextState(host, (s) => s.players.every((p) => p.connected));
    await emit(p2b, 'player:rejoin', { code, token: j2.token });
    const back = await backP;
    assert.equal(back.phase, 'question');

    const reveal = nextState(host, (s) => s.phase === 'reveal');
    await emit(p2b, 'player:answer', { value: 'b' });
    const r1 = await reveal;
    const scores = Object.fromEntries(r1.competitors.map((c) => [c.name, c.score]));
    assert.deepEqual(scores, { Lia: 10, 'Lia 2': 0 });

    const q2p = nextState(host, (s) => s.phase === 'question' && s.question.num === 2);
    await emit(host, 'host:action', { code, action: 'next' });
    await q2p;
    await emit(p1, 'player:answer', { value: '  QUATRO ' });
    const r2p = nextState(host, (s) => s.phase === 'reveal');
    await emit(p2b, 'player:answer', { value: '5' });
    const r2 = await r2p;
    assert.equal(r2.question.results[j1.playerId].correct, true);

    const fin = nextState(host, (s) => s.phase === 'finished');
    await emit(host, 'host:action', { code, action: 'next' });
    const f = await fin;
    assert.equal(f.results.ranking[0].name, 'Lia');
    assert.equal(f.results.ranking[0].score, 30);

    // Jogar novamente volta para a sala de espera com os mesmos participantes
    const againP = nextState(host, (s) => s.phase === 'lobby');
    await emit(host, 'host:action', { code, action: 'restart' });
    const again = await againP;
    assert.equal(again.players.length, 2);

    [host, anon, p1, p2b].forEach((s) => s.disconnect());
  });

  await test('Spud Game em equipes com turnos, poderes e vencedor', async () => {
    const host = sock(ana.cookie);
    await connected(host);
    const { code } = await emit(host, 'host:create', {
      gameId,
      config: { mode: 'spud', playStyle: 'teams', teamCount: 2, turnStyle: 'turns', timer: 0, boardLength: 20, startWithPowerup: true },
    });
    const players = [sock(), sock(), sock()];
    await Promise.all(players.map(connected));
    const joins = [];
    joins.push(await emit(players[0], 'player:join', { code, name: 'Rui', teamId: 't1' }));
    joins.push(await emit(players[1], 'player:join', { code, name: 'Sol', teamId: 't1' }));
    const threeP = nextState(host, (s) => s.players.length === 3);
    joins.push(await emit(players[2], 'player:join', { code, name: 'Teo', teamId: 't2' }));
    await threeP;

    const started = nextState(host, (s) => s.phase === 'question');
    await emit(host, 'host:action', { code, action: 'start' });
    let st = await started;
    assert.equal(st.board.length, 20);
    assert.equal(st.competitors.length, 2);
    assert.ok(st.competitors.every((c) => c.powerups.length === 1));
    assert.deepEqual(st.question.activeIds, ['t1']);

    // Equipe fora da vez não responde
    await assert.rejects(emit(players[2], 'player:answer', { value: 'a' }), /não é a sua vez/);

    const answerSocket = { t1: players[0], t2: players[2] };
    let rounds = 0;
    let usedPower = false;
    while (st.phase !== 'finished' && rounds < 200) {
      const active = st.question.activeIds[0];
      const s = answerSocket[active];
      const comp = st.competitors.find((c) => c.id === active);
      if (!usedPower && comp.powerups.length) {
        const pw = comp.powerups[0];
        const target = st.competitors.find((c) => c.id !== active).id;
        const powerState = nextState(host, (x) => x.lastResolution && x.lastResolution.kind === 'power');
        await emit(s, 'player:power', { powerup: pw, targetId: target });
        await powerState;
        usedPower = true;
      }
      const hostQ = await new Promise((resolve) => {
        host.once('room:state', resolve);
        emit(host, 'host:attach', { code });
      });
      const q = hostQ.question;
      const value = q.type === 'multiple' ? q.correct : q.acceptedAnswers[0];
      const after = nextState(host, (x) => x.phase === 'reveal' || x.phase === 'finished');
      await emit(s, 'player:answer', { value });
      st = await after;
      assert.ok(st.lastResolution.steps.length > 0);
      if (st.phase === 'finished') break;
      const nq = nextState(host, (x) => x.phase === 'question');
      await emit(host, 'host:action', { code, action: 'next' });
      st = await nq;
      rounds++;
    }
    assert.equal(st.phase, 'finished');
    assert.ok(usedPower);
    const winner = st.results.ranking[0];
    assert.equal(winner.position, 19);
    assert.equal(st.results.winnerId, winner.id);
    [host, ...players].forEach((s) => s.disconnect());
  });

  await test('modo apresentador: administrador registra respostas', async () => {
    const host = sock(ana.cookie);
    await connected(host);
    const { code } = await emit(host, 'host:create', { gameId, config: { mode: 'spud', answerSource: 'presenter', teamCount: 3, timer: 0 } });
    const p = sock();
    await connected(p);
    await assert.rejects(emit(p, 'player:join', { code, name: 'X' }), /apresentador/);
    const q = nextState(host, (s) => s.phase === 'question');
    await emit(host, 'host:action', { code, action: 'start' });
    const st = await q;
    assert.equal(st.competitors.length, 3);
    const r = nextState(host, (s) => s.phase === 'reveal');
    const val = st.question.type === 'multiple' ? { value: st.question.correct } : { judge: true };
    await emit(host, 'host:action', { code, action: 'answer', ...val });
    const rv = await r;
    assert.equal(rv.question.results.t1.correct, true);
    host.disconnect();
    p.disconnect();
  });

  await test('partidas terminadas aparecem no perfil', async () => {
    const r = await ana.req('GET', '/api/auth/stats');
    assert.ok(r.data.matches >= 2);
    assert.ok(r.data.recentMatches.some((m) => m.winner));
  });

  // ---------------------------------------------------------- persistência
  await test('dados continuam salvos após reiniciar o servidor', async () => {
    await stop(app);
    app = await start();
    const again = client();
    const r = await again.req('POST', '/api/auth/login', { email, password: 'segredo123' });
    assert.equal(r.status, 200);
    const g = await again.req('GET', `/api/games/${gameId}`);
    assert.equal(g.data.game.title, 'Frações divertidas');
    assert.equal(g.data.game.questions[1].answers[1], 'quatro');
    const demos = await again.req('GET', '/api/games');
    assert.ok(demos.data.games.length >= 6);
  });

  await stop(app);
  console.log(`\n${passed} testes de integração passaram.`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
