'use strict';
/**
 * Testes do motor de jogo (sem rede): node tests/engine.test.js
 */
const assert = require('assert/strict');
const { Room, GameError } = require('../server/game/Room');
const { sanitizeRoomConfig } = require('../server/game/config');
const { sanitizeGame } = require('../server/lib/validate');

function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const game = {
  id: 'g1',
  title: 'Teste',
  ...sanitizeGame({
    title: 'Teste',
    questions: [
      { id: 'a', type: 'multiple', text: '1+1?', options: [{ id: 'x', text: '2' }, { id: 'y', text: '3' }], correct: 'x', points: 10 },
      { id: 'b', type: 'open', text: 'Capital de Goiás?', answers: ['Goiânia'], points: 10 },
      { id: 'c', type: 'multiple', text: 'Incompleta', options: [{ id: 'x', text: 'só uma' }], correct: 'x' },
    ],
  }),
};

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name);
    throw err;
  }
}

function makeRoom(cfg) {
  return new Room({ code: 'TESTE1', hostUserId: 'u1', game, config: sanitizeRoomConfig(cfg, {}), rng: seeded() });
}

function answerFor(room, playerId, right) {
  const q = room.current.question;
  if (q.type === 'multiple') return room.submitAnswer(playerId, right ? q.correct : q.options.find((o) => o.id !== q.correct).id);
  return room.submitAnswer(playerId, right ? 'goiania' : 'anápolis');
}

console.log('Motor de jogo');

test('perguntas incompletas são ignoradas', () => {
  const room = makeRoom({ mode: 'classic' });
  assert.equal(room.questions.length, 2);
});

test('Classic Quiz individual: pontuação, revelação automática e fim', () => {
  const room = makeRoom({ mode: 'classic', speedBonus: false, timer: 0 });
  const a = room.addPlayer({ name: 'Ana' });
  const b = room.addPlayer({ name: 'Bia' });
  room.setConnected(a.id, 's1');
  room.setConnected(b.id, 's2');
  room.start();
  assert.equal(room.phase, 'question');
  assert.equal(room.playerView(a.id).question.correct, undefined, 'jogador não pode ver a resposta antes da revelação');
  answerFor(room, a.id, true);
  assert.equal(room.phase, 'question');
  assert.throws(() => answerFor(room, a.id, true), GameError);
  answerFor(room, b.id, false);
  assert.equal(room.phase, 'reveal');
  assert.equal(room.state.get(a.id).score, 10);
  assert.equal(room.state.get(b.id).score, 0);
  room.next();
  answerFor(room, a.id, false);
  answerFor(room, b.id, true);
  room.next();
  assert.equal(room.phase, 'finished');
  assert.equal(room.results.ranking.length, 2);
  assert.equal(room.results.ranking[0].place, 1);
  assert.equal(room.results.ranking[1].place, 1, 'empate deve dividir o 1º lugar');
});

test('resposta aberta ignora acentos e maiúsculas', () => {
  const room = makeRoom({ mode: 'classic', shuffleQuestions: false, timer: 0 });
  const a = room.addPlayer({ name: 'Ana' });
  room.setConnected(a.id, 's1');
  room.start();
  answerFor(room, a.id, true);
  room.next();
  room.submitAnswer(a.id, '  GOIÂNIA! ');
  assert.equal(room.current.results[a.id].correct, true);
});

test('Classic com equipes: a primeira resposta da equipe vale', () => {
  const room = makeRoom({ mode: 'classic', playStyle: 'teams', teamCount: 2, timer: 0, speedBonus: false });
  const a = room.addPlayer({ name: 'Ana', teamId: 't1' });
  const b = room.addPlayer({ name: 'Beto', teamId: 't1' });
  const c = room.addPlayer({ name: 'Caio', teamId: 't2' });
  [a, b, c].forEach((p, i) => room.setConnected(p.id, 's' + i));
  room.start();
  answerFor(room, a.id, true);
  assert.throws(() => answerFor(room, b.id, false), /já foi registrada/);
  answerFor(room, c.id, false);
  assert.equal(room.phase, 'reveal');
  assert.equal(room.state.get('t1').score, 10);
});

test('Spud Game: movimento, turnos e vencedor', () => {
  const room = makeRoom({ mode: 'spud', answerSource: 'presenter', teamCount: 3, boardLength: 20, timer: 0 });
  room.start();
  assert.deepEqual(room.competitorIds(), ['t1', 't2', 't3']);
  assert.deepEqual(room.current.activeIds, ['t1']);
  let rounds = 0;
  while (room.phase !== 'finished' && rounds < 500) {
    const q = room.current.question;
    if (q.type === 'multiple') room.presenterAnswer({ value: q.correct });
    else room.presenterAnswer({ judge: true });
    assert.ok(room.lastResolution.steps.length > 0);
    if (room.phase === 'finished') break;
    room.next();
    rounds++;
  }
  assert.equal(room.phase, 'finished');
  const winner = room.results.ranking[0];
  assert.equal(winner.position, room.board.length - 1);
  assert.equal(room.results.winnerId, winner.id);
});

test('Spud Game: perguntas não se repetem antes de usar todas', () => {
  const room = makeRoom({ mode: 'spud', answerSource: 'presenter', teamCount: 2, timer: 0, boardLength: 40, wrongPenalty: 0 });
  room.start();
  const seen = [room.current.qIndex];
  for (let i = 0; i < 3; i++) {
    room.presenterAnswer({ judge: false, value: room.current.question.options[1] && room.current.question.options[1].id });
    room.next();
    seen.push(room.current.qIndex);
  }
  assert.notEqual(seen[0], seen[1]);
  assert.notEqual(seen[2], seen[3]);
});

test('Spud Game: power-ups validados no servidor', () => {
  const room = makeRoom({ mode: 'spud', timer: 0, startWithPowerup: true, powerups: { speed: true, shield: false, double: false, swap: false, shuffle: false } });
  const a = room.addPlayer({ name: 'Ana' });
  const b = room.addPlayer({ name: 'Bia' });
  room.setConnected(a.id, 's1');
  room.setConnected(b.id, 's2');
  room.start();
  assert.deepEqual(room.state.get(a.id).powerups, ['speed']);
  assert.throws(() => room.usePowerup({ type: 'player', playerId: a.id }, { powerup: 'shield' }), /não tem/);
  room.usePowerup({ type: 'player', playerId: a.id }, { powerup: 'speed' });
  assert.equal(room.state.get(a.id).armed.speed, true);
  assert.equal(room.state.get(a.id).powerups.length, 0);
  answerFor(room, a.id, true);
  answerFor(room, b.id, false);
  const boost = room.lastResolution.steps.find((s) => s.type === 'boost');
  assert.ok(boost, 'o Speed Boost deve somar casas na resposta certa');
  assert.ok(room.state.get(a.id).position >= 4);
});

test('Spud Game: escudo bloqueia casa de perigo', () => {
  const room = makeRoom({ mode: 'spud', answerSource: 'presenter', teamCount: 2, timer: 0, movement: 'fixed', fixedSteps: 1 });
  room.start();
  const dangerAt = room.board.indexOf('danger');
  const st = room.state.get('t1');
  st.position = dangerAt - 1;
  st.shield = true;
  const q = room.current.question;
  room.presenterAnswer(q.type === 'multiple' ? { value: q.correct } : { judge: true });
  assert.equal(st.position, dangerAt);
  assert.equal(st.shield, false);
  assert.ok(room.lastResolution.steps.some((s) => s.type === 'shield'));
});

test('jogador que cai não trava a rodada', () => {
  const room = makeRoom({ mode: 'classic', timer: 0 });
  const a = room.addPlayer({ name: 'Ana' });
  const b = room.addPlayer({ name: 'Bia' });
  room.setConnected(a.id, 's1');
  room.setConnected(b.id, 's2');
  room.start();
  answerFor(room, a.id, true);
  room.setConnected(b.id, null);
  room.checkAllAnswered();
  assert.equal(room.phase, 'reveal');
});

test('reiniciar mantém participantes e zera o jogo', () => {
  const room = makeRoom({ mode: 'spud', timer: 0 });
  const a = room.addPlayer({ name: 'Ana' });
  room.setConnected(a.id, 's1');
  room.start();
  room.end();
  room.restart();
  assert.equal(room.phase, 'lobby');
  assert.equal(room.players.size, 1);
  assert.equal(room.state.size, 0);
});

console.log(`\n${passed} testes passaram.`);
