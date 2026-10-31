'use strict';
/**
 * Uma partida ao vivo. Todo o estado do jogo vive aqui no servidor:
 * respostas, pontos, turnos, posições, roleta e poderes são decididos
 * apenas pelo servidor — o navegador só envia intenções.
 */
const { CHARACTERS, COLORS, LIMITS, SPUD_EVENTS, POWERUPS } = require('../../shared/constants');
const { normalizeAnswer, cleanText, shuffle, randInt, token, uuid } = require('../lib/util');
const { isQuestionReady } = require('../lib/validate');
const { generateBoard } = require('./board');

const ANSWER_GRACE_MS = 600;
const MAX_POWERUPS = 3;

class GameError extends Error {}

class Room {
  constructor({ code, hostUserId, game, config, rng = Math.random, onChange = () => {}, onFinish = () => {} }) {
    this.code = code;
    this.hostUserId = hostUserId;
    this.hostToken = token();
    this.gameId = game.id;
    this.gameTitle = game.title;
    this.questions = (game.questions || []).filter(isQuestionReady);
    if (!this.questions.length) throw new GameError('Este jogo ainda não tem perguntas completas. Termine pelo menos uma no criador.');
    this.config = config;
    this.rng = rng;
    this.onChange = onChange;
    this.onFinish = onFinish;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();

    this.hostSockets = new Set();
    this.displaySockets = new Set();
    this.players = new Map(); // id -> player
    this.teams = config.teams.map((t) => ({ ...t }));
    this.timer = null;
    this.resolutionSeq = 0;
    this.resetGameState();
  }

  // ------------------------------------------------------------------ estado

  resetGameState() {
    clearTimeout(this.timer);
    this.timer = null;
    this.phase = 'lobby';
    this.state = new Map(); // competitorId -> estado de jogo
    this.turnOrder = [];
    this.turnPos = -1;
    this.deck = [];
    this.deckPos = 0;
    this.asked = 0;
    this.current = null;
    this.lastResolution = null;
    this.results = null;
    this.finishCount = 0;
    this.board =
      this.config.mode === 'spud'
        ? generateBoard(this.config.boardLength, {
            eventsEnabled: Object.values(this.config.events).some(Boolean),
            powerupsEnabled: Object.values(this.config.powerups).some(Boolean),
            rng: this.rng,
          })
        : null;
    this.matchId = null;
  }

  touch() {
    this.lastActivity = Date.now();
  }

  changed() {
    this.touch();
    this.onChange(this);
  }

  get finishIndex() {
    return this.board ? this.board.length - 1 : 0;
  }

  // -------------------------------------------------------------- jogadores

  addPlayer({ name, character, color, teamId }) {
    if (this.config.answerSource === 'presenter') {
      throw new GameError('Esta partida é conduzida pelo apresentador e não aceita participantes por celular.');
    }
    if (this.phase === 'finished') throw new GameError('Esta partida já terminou.');
    const active = [...this.players.values()].filter((p) => !p.kicked);
    if (active.length >= LIMITS.playersPerRoomMax) throw new GameError('A sala está cheia.');

    let clean = cleanText(name, LIMITS.playerNameMax);
    if (clean.length < 1) throw new GameError('Digite seu nome para entrar.');
    const taken = new Set(active.map((p) => p.name.toLowerCase()));
    if (taken.has(clean.toLowerCase())) {
      let i = 2;
      const base = clean.slice(0, LIMITS.playerNameMax - 3);
      while (taken.has(`${base} ${i}`.toLowerCase())) i++;
      clean = `${base} ${i}`;
    }

    const player = {
      id: uuid().slice(0, 12),
      token: token(),
      name: clean,
      character: CHARACTERS.some((c) => c.id === character) ? character : CHARACTERS[active.length % CHARACTERS.length].id,
      color: COLORS.includes(color) ? color : COLORS[active.length % COLORS.length],
      teamId: null,
      connected: false,
      socketId: null,
      kicked: false,
      joinedAt: Date.now(),
    };
    if (this.config.playStyle === 'teams') {
      player.teamId = this.teams.some((t) => t.id === teamId) ? teamId : this.smallestTeam().id;
    }
    this.players.set(player.id, player);

    // Entrada no meio da partida: vira competidor imediatamente.
    if (this.phase !== 'lobby') this.ensureCompetitor(this.competitorIdOf(player));
    this.changed();
    return player;
  }

  smallestTeam() {
    const counts = new Map(this.teams.map((t) => [t.id, 0]));
    for (const p of this.players.values()) if (!p.kicked && p.teamId) counts.set(p.teamId, (counts.get(p.teamId) || 0) + 1);
    return this.teams.reduce((best, t) => (counts.get(t.id) < counts.get(best.id) ? t : best), this.teams[0]);
  }

  findPlayerByToken(tok) {
    if (typeof tok !== 'string') return null;
    for (const p of this.players.values()) if (p.token === tok && !p.kicked) return p;
    return null;
  }

  updatePlayer(playerId, { character, color, teamId }) {
    const p = this.players.get(playerId);
    if (!p || p.kicked) throw new GameError('Participante não encontrado.');
    if (character !== undefined && CHARACTERS.some((c) => c.id === character)) p.character = character;
    if (color !== undefined && COLORS.includes(color)) p.color = color;
    if (teamId !== undefined && this.config.playStyle === 'teams') {
      if (this.phase !== 'lobby') throw new GameError('Só dá para trocar de equipe antes do jogo começar.');
      if (this.teams.some((t) => t.id === teamId)) p.teamId = teamId;
    }
    this.changed();
  }

  kick(playerId) {
    const p = this.players.get(playerId);
    if (!p) return null;
    p.kicked = true;
    p.connected = false;
    const sid = p.socketId;
    p.socketId = null;
    if (this.config.playStyle === 'individual') {
      this.turnOrder = this.turnOrder.filter((id) => id !== p.id);
      if (this.current) this.current.activeIds = this.current.activeIds.filter((id) => id !== p.id);
      this.state.delete(p.id);
    }
    this.checkAllAnswered();
    this.changed();
    return sid;
  }

  setConnected(playerId, socketId) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = !!socketId;
    p.socketId = socketId;
    this.changed();
  }

  // ------------------------------------------------------------ competidores

  competitorIdOf(player) {
    return this.config.playStyle === 'teams' ? player.teamId : player.id;
  }

  membersOf(competitorId) {
    return [...this.players.values()].filter((p) => !p.kicked && this.competitorIdOf(p) === competitorId);
  }

  /** Lista de competidores na ordem de turnos. */
  competitorIds() {
    if (this.phase !== 'lobby') return this.turnOrder.slice();
    if (this.config.playStyle === 'individual') {
      return [...this.players.values()].filter((p) => !p.kicked).map((p) => p.id);
    }
    if (this.config.answerSource === 'presenter') return this.teams.map((t) => t.id);
    return this.teams.filter((t) => this.membersOf(t.id).length > 0).map((t) => t.id);
  }

  competitorInfo(id) {
    if (this.config.playStyle === 'teams') {
      const t = this.teams.find((x) => x.id === id);
      return t ? { name: t.name, color: t.color, character: t.character } : null;
    }
    const p = this.players.get(id);
    return p ? { name: p.name, color: p.color, character: p.character } : null;
  }

  ensureCompetitor(id) {
    if (!id || this.state.has(id)) return;
    this.state.set(id, {
      score: 0,
      position: 0,
      shield: false,
      skip: 0,
      powerups: [],
      armed: { speed: false, double: false },
      correct: 0,
      answered: 0,
      finishOrder: null,
    });
    this.turnOrder.push(id);
  }

  isAnswerable(id) {
    if (this.config.answerSource === 'presenter') return true;
    return this.membersOf(id).some((p) => p.connected);
  }

  // ------------------------------------------------------------------ fluxo

  start() {
    if (this.phase !== 'lobby') throw new GameError('A partida já começou.');
    const ids = this.competitorIds();
    if (ids.length < 1) {
      throw new GameError(
        this.config.playStyle === 'teams' ? 'Ninguém entrou nas equipes ainda.' : 'Espere pelo menos um participante entrar.'
      );
    }
    for (const id of ids) this.ensureCompetitor(id);
    if (this.config.mode === 'spud' && this.config.startWithPowerup) {
      for (const id of ids) {
        const p = this.randomPowerup();
        if (p) this.state.get(id).powerups.push(p);
      }
    }
    this.buildDeck();
    this.matchId = uuid();
    this.startedAt = Date.now();
    this.nextQuestion();
  }

  buildDeck() {
    const idx = this.questions.map((_, i) => i);
    const last = this.deck.length ? this.deck[this.deckPos - 1] : null;
    this.deck = this.config.shuffleQuestions ? shuffle(idx, this.rng) : idx;
    // Ao reembaralhar, evita repetir a última pergunta logo em seguida.
    if (this.deck.length > 1 && this.deck[0] === last) this.deck.push(this.deck.shift());
    this.deckPos = 0;
  }

  totalQuestions() {
    if (this.config.mode !== 'classic') return null;
    const limit = this.config.questionLimit;
    return limit > 0 ? Math.min(limit, this.questions.length) : this.questions.length;
  }

  nextQuestion() {
    clearTimeout(this.timer);
    if (this.config.mode === 'classic' && this.asked >= this.totalQuestions()) return this.finish();
    if (this.deckPos >= this.deck.length) this.buildDeck(); // só no Spud Game (todas já usadas)

    const qIndex = this.deck[this.deckPos++];
    this.asked++;
    const q = this.questions[qIndex];
    const skipped = [];
    let activeIds;

    if (this.config.turnStyle === 'turns') {
      activeIds = [];
      for (let guard = 0; guard < this.turnOrder.length * 2 + 2 && !activeIds.length; guard++) {
        this.turnPos = (this.turnPos + 1) % this.turnOrder.length;
        const id = this.turnOrder[this.turnPos];
        const st = this.state.get(id);
        if (!st) continue;
        if (st.skip > 0) {
          st.skip--;
          skipped.push(id);
          continue;
        }
        activeIds.push(id);
      }
      if (!activeIds.length) activeIds = [this.turnOrder[this.turnPos]];
    } else {
      activeIds = [];
      for (const id of this.turnOrder) {
        const st = this.state.get(id);
        if (st.skip > 0) {
          st.skip--;
          skipped.push(id);
        } else activeIds.push(id);
      }
      if (!activeIds.length) activeIds = this.turnOrder.slice();
    }

    const seconds = q.time || this.config.timer;
    const now = Date.now();
    this.current = {
      num: this.asked,
      qIndex,
      question: q,
      startedAt: now,
      seconds,
      deadline: seconds > 0 ? now + seconds * 1000 : null,
      activeIds,
      skipped,
      answers: new Map(),
      results: null,
    };
    this.phase = 'question';
    this.lastResolution = null;
    if (seconds > 0) this.timer = setTimeout(() => this.safeReveal(), seconds * 1000 + ANSWER_GRACE_MS);
    this.changed();
  }

  safeReveal() {
    try {
      if (this.phase === 'question') this.reveal();
    } catch (err) {
      console.error('[sala] erro ao revelar:', err);
    }
  }

  // --------------------------------------------------------------- respostas

  checkAnswer(q, value) {
    if (q.type === 'multiple') {
      const opt = q.options.find((o) => o.id === value);
      if (!opt) throw new GameError('Alternativa inválida.');
      return { correct: opt.id === q.correct, text: opt.text, value: opt.id };
    }
    const text = cleanText(value, LIMITS.optionTextMax);
    if (!text) throw new GameError('Digite uma resposta.');
    const norm = normalizeAnswer(text);
    return { correct: q.answers.some((a) => normalizeAnswer(a) === norm), text, value: text };
  }

  /** Resposta enviada por um participante pelo celular/computador. */
  submitAnswer(playerId, value) {
    const p = this.players.get(playerId);
    if (!p || p.kicked) throw new GameError('Participante não encontrado.');
    if (this.phase !== 'question' || !this.current) throw new GameError('Não há pergunta aberta agora.');
    if (this.current.deadline && Date.now() > this.current.deadline + ANSWER_GRACE_MS) {
      throw new GameError('O tempo acabou!');
    }
    const compId = this.competitorIdOf(p);
    if (!this.current.activeIds.includes(compId)) throw new GameError('Agora não é a sua vez.');
    if (this.current.answers.has(compId)) throw new GameError('Sua resposta já foi registrada.');

    const res = this.checkAnswer(this.current.question, value);
    this.current.answers.set(compId, { ...res, playerId, by: p.name, at: Date.now() });
    if (!this.checkAllAnswered()) this.changed();
    return { received: true };
  }

  /** Modo apresentador: o administrador registra a resposta da equipe da vez. */
  presenterAnswer({ competitorId, value, judge }) {
    if (this.config.answerSource !== 'presenter') throw new GameError('Esta partida usa respostas pelos celulares.');
    if (this.phase !== 'question' || !this.current) throw new GameError('Não há pergunta aberta agora.');
    const compId = competitorId || this.current.activeIds[0];
    if (!this.current.activeIds.includes(compId)) throw new GameError('Não é a vez desta equipe.');
    if (this.current.answers.has(compId)) throw new GameError('Resposta já registrada.');
    const q = this.current.question;
    let res;
    if (q.type === 'open' && typeof judge === 'boolean') {
      res = { correct: judge, text: judge ? 'Correta (avaliada pelo apresentador)' : 'Incorreta', value: null };
    } else {
      res = this.checkAnswer(q, value);
    }
    this.current.answers.set(compId, { ...res, playerId: null, by: 'Apresentador', at: Date.now() });
    if (!this.checkAllAnswered()) this.changed();
  }

  checkAllAnswered() {
    if (this.phase !== 'question' || !this.current) return false;
    const pending = this.current.activeIds.filter((id) => !this.current.answers.has(id) && this.isAnswerable(id));
    if (pending.length === 0 && this.current.answers.size > 0) {
      this.reveal();
      return true;
    }
    return false;
  }

  reveal() {
    if (this.phase !== 'question') throw new GameError('Não há pergunta aberta para revelar.');
    clearTimeout(this.timer);
    if (this.config.mode === 'classic') this.revealClassic();
    else this.resolveSpud();
  }

  next() {
    if (this.phase === 'question') throw new GameError('Revele a resposta antes de seguir.');
    if (this.phase !== 'reveal') throw new GameError('Não dá para avançar agora.');
    this.nextQuestion();
  }

  // ----------------------------------------------------------- Classic Quiz

  revealClassic() {
    const q = this.current.question;
    const results = {};
    for (const id of this.current.activeIds) {
      const st = this.state.get(id);
      if (!st) continue;
      const ans = this.current.answers.get(id);
      st.answered++;
      let points = 0;
      if (ans && ans.correct) {
        points = q.points;
        if (this.config.speedBonus && this.current.deadline) {
          const total = this.current.seconds * 1000;
          const left = Math.max(0, this.current.deadline - ans.at);
          points += Math.round(q.points * 0.5 * (left / total));
        }
        st.score += points;
        st.correct++;
      }
      results[id] = { correct: !!(ans && ans.correct), answered: !!ans, points, answer: ans ? ans.text : null, by: ans ? ans.by : null };
    }
    this.current.results = results;
    this.phase = 'reveal';
    if (this.asked >= this.totalQuestions()) this.current.isLast = true;
    this.changed();
  }

  // -------------------------------------------------------------- Spud Game

  positions() {
    const out = {};
    for (const [id, st] of this.state) out[id] = st.position;
    return out;
  }

  randomPowerup() {
    const enabled = Object.keys(POWERUPS).filter((k) => this.config.powerups && this.config.powerups[k]);
    return enabled.length ? enabled[Math.floor(this.rng() * enabled.length)] : null;
  }

  enabledEvents() {
    return Object.keys(SPUD_EVENTS).filter((k) => this.config.events[k]);
  }

  resolveSpud() {
    const q = this.current.question;
    const steps = [];
    const start = this.positions();
    const results = {};
    const ctx = { steps, winner: null };

    // Ordem: quem respondeu primeiro age primeiro; quem não respondeu vai por último.
    const order = this.current.activeIds.slice().sort((a, b) => {
      const A = this.current.answers.get(a);
      const B = this.current.answers.get(b);
      return (A ? A.at : Infinity) - (B ? B.at : Infinity);
    });

    for (const id of order) {
      const st = this.state.get(id);
      if (!st) continue;
      const ans = this.current.answers.get(id);
      st.answered++;
      const correct = !!(ans && ans.correct);
      results[id] = { correct, answered: !!ans, points: 0, answer: ans ? ans.text : null, by: ans ? ans.by : null };
      if (ctx.winner) continue;

      if (correct) {
        st.correct++;
        let points = q.points;
        if (st.armed.double) {
          points *= 2;
          st.armed.double = false;
          steps.push(this.step('doubled', id, { points }));
        }
        st.score += points;
        results[id].points = points;

        let move;
        if (this.config.movement === 'dice') {
          move = randInt(1, 6, this.rng);
          steps.push(this.step('dice', id, { value: move }));
        } else {
          move = this.config.fixedSteps;
        }
        if (st.armed.speed) {
          st.armed.speed = false;
          move += 3;
          steps.push(this.step('boost', id, { extra: 3 }));
        }
        this.moveBy(id, move, ctx, { reason: 'correct', landing: true });
      } else {
        const back = Math.min(this.config.wrongPenalty, st.position);
        if (back > 0) {
          const from = st.position;
          st.position -= back;
          steps.push(this.step('wrong', id, { from, to: st.position }));
        } else {
          steps.push(this.step('miss', id, {}));
        }
      }
    }

    this.current.results = results;
    this.lastResolution = { id: ++this.resolutionSeq, kind: 'answer', start, steps };
    if (ctx.winner) {
      this.phase = 'reveal'; // o fim é anunciado logo após a animação de chegada
      this.finish(ctx.winner);
      return;
    }
    this.phase = 'reveal';
    this.changed();
  }

  step(type, competitorId, data) {
    return { type, competitorId, ...data, positions: this.positions(), scores: this.scoresSnapshot() };
  }

  scoresSnapshot() {
    const out = {};
    for (const [id, st] of this.state) out[id] = st.score;
    return out;
  }

  moveBy(id, amount, ctx, { landing }) {
    const st = this.state.get(id);
    const from = st.position;
    st.position = Math.max(0, Math.min(this.finishIndex, st.position + amount));
    ctx.steps.push(this.step('move', id, { from, to: st.position }));
    if (st.position >= this.finishIndex) {
      st.finishOrder = ++this.finishCount;
      ctx.winner = id;
      ctx.steps.push(this.step('finish', id, {}));
      return;
    }
    if (landing) this.applyTile(id, ctx);
  }

  /** Efeito ao cair em uma casa (somente após o movimento normal, sem reação em cadeia). */
  applyTile(id, ctx) {
    const st = this.state.get(id);
    const tile = this.board[st.position];
    if (tile === 'danger') {
      if (this.consumeShield(id, ctx, 'danger')) return;
      const back = randInt(2, 3, this.rng);
      const from = st.position;
      st.position = Math.max(0, st.position - back);
      ctx.steps.push(this.step('danger', id, { from, to: st.position, amount: back }));
    } else if (tile === 'star') {
      const options = this.enabledEvents();
      if (!options.length) return;
      const event = options[Math.floor(this.rng() * options.length)];
      ctx.steps.push(this.step('roulette', id, { event, options }));
      this.applyEvent(id, event, ctx);
    } else if (tile === 'gift') {
      const p = this.randomPowerup();
      if (!p) return;
      if (st.powerups.length >= MAX_POWERUPS) {
        ctx.steps.push(this.step('gift_full', id, { powerup: p }));
      } else {
        st.powerups.push(p);
        ctx.steps.push(this.step('gift', id, { powerup: p }));
      }
    }
  }

  consumeShield(id, ctx, against) {
    const st = this.state.get(id);
    if (!st.shield) return false;
    st.shield = false;
    ctx.steps.push(this.step('shield', id, { against }));
    return true;
  }

  applyEvent(id, event, ctx) {
    const st = this.state.get(id);
    switch (event) {
      case 'advance': {
        const n = randInt(2, 4, this.rng);
        this.moveBy(id, n, ctx, { landing: false });
        break;
      }
      case 'back': {
        if (this.consumeShield(id, ctx, 'back')) break;
        const n = randInt(2, 3, this.rng);
        this.moveBy(id, -n, ctx, { landing: false });
        break;
      }
      case 'skip': {
        if (this.consumeShield(id, ctx, 'skip')) break;
        st.skip = 1;
        ctx.steps.push(this.step('skip', id, {}));
        break;
      }
      case 'points': {
        st.score += 20;
        ctx.steps.push(this.step('points', id, { points: 20 }));
        break;
      }
      case 'swap': {
        const others = this.turnOrder.filter((o) => o !== id && this.state.has(o));
        if (!others.length) {
          ctx.steps.push(this.step('nothing', id, {}));
          break;
        }
        const target = others[Math.floor(this.rng() * others.length)];
        this.swapPositions(id, target, ctx);
        break;
      }
      case 'shuffle':
        this.shufflePositions(id, ctx);
        break;
      default:
        break;
    }
  }

  swapPositions(a, b, ctx) {
    const A = this.state.get(a);
    const B = this.state.get(b);
    // O escudo protege quem seria prejudicado (iria para trás).
    if (B.position < A.position && this.consumeShield(a, ctx, 'swap')) return;
    if (A.position < B.position && this.consumeShield(b, ctx, 'swap')) return;
    const pa = A.position;
    A.position = B.position;
    B.position = pa;
    ctx.steps.push(this.step('swap', a, { targetId: b }));
  }

  shufflePositions(by, ctx) {
    const ids = this.turnOrder.filter((id) => this.state.has(id));
    const before = ids.map((id) => this.state.get(id).position);
    const after = shuffle(before, this.rng);
    const protectedIds = [];
    ids.forEach((id, i) => {
      const st = this.state.get(id);
      if (after[i] < st.position && st.shield) {
        st.shield = false;
        protectedIds.push(id);
        return;
      }
      st.position = after[i];
    });
    ctx.steps.push(this.step('shuffle', by, { protectedIds }));
  }

  /** Usar um poder. actor = { type: 'player', playerId } | { type: 'host' }. */
  usePowerup(actor, { competitorId, powerup, targetId }) {
    if (this.config.mode !== 'spud') throw new GameError('Poderes só existem no Spud Game.');
    if (this.phase !== 'question' || !this.current) throw new GameError('Use os poderes enquanto a pergunta estiver aberta.');
    let compId = competitorId;
    if (actor.type === 'player') {
      const p = this.players.get(actor.playerId);
      if (!p || p.kicked) throw new GameError('Participante não encontrado.');
      compId = this.competitorIdOf(p);
    }
    const st = this.state.get(compId);
    if (!st) throw new GameError('Competidor não encontrado.');
    if (!this.current.activeIds.includes(compId)) throw new GameError('Você só pode usar poderes na sua vez.');
    if (this.current.answers.has(compId)) throw new GameError('Use o poder antes de responder.');
    const idx = st.powerups.indexOf(powerup);
    if (idx === -1) throw new GameError('Você não tem esse poder.');
    if (!this.config.powerups[powerup]) throw new GameError('Este poder está desativado nesta partida.');

    const ctx = { steps: [], winner: null };
    const start = this.positions();
    switch (powerup) {
      case 'speed':
        if (st.armed.speed) throw new GameError('O Speed Boost já está ativo.');
        st.armed.speed = true;
        break;
      case 'double':
        if (st.armed.double) throw new GameError('O Double Points já está ativo.');
        st.armed.double = true;
        break;
      case 'shield':
        if (st.shield) throw new GameError('O escudo já está ativo.');
        st.shield = true;
        break;
      case 'swap': {
        if (!targetId || targetId === compId || !this.state.has(targetId)) throw new GameError('Escolha com quem trocar de lugar.');
        break;
      }
      case 'shuffle':
        if (this.state.size < 2) throw new GameError('É preciso ter pelo menos dois participantes.');
        break;
      default:
        throw new GameError('Poder desconhecido.');
    }
    st.powerups.splice(idx, 1);
    ctx.steps.push(this.step('power', compId, { powerup, targetId: targetId || null }));
    if (powerup === 'swap') this.swapPositions(compId, targetId, ctx);
    if (powerup === 'shuffle') this.shufflePositions(compId, ctx);
    this.lastResolution = { id: ++this.resolutionSeq, kind: 'power', start, steps: ctx.steps };
    this.changed();
  }

  // ------------------------------------------------------------------- fim

  ranking() {
    const ids = this.turnOrder.filter((id) => this.state.has(id));
    const rows = ids.map((id) => {
      const st = this.state.get(id);
      const info = this.competitorInfo(id) || { name: '?', color: '#999', character: 'tuca' };
      return {
        id,
        ...info,
        score: st.score,
        position: st.position,
        correct: st.correct,
        answered: st.answered,
        finishOrder: st.finishOrder,
        members: this.config.playStyle === 'teams' ? this.membersOf(id).map((p) => p.name) : [],
      };
    });
    if (this.config.mode === 'spud') {
      rows.sort(
        (a, b) =>
          (a.finishOrder || Infinity) - (b.finishOrder || Infinity) || b.position - a.position || b.score - a.score
      );
    } else {
      rows.sort((a, b) => b.score - a.score || b.correct - a.correct);
    }
    let place = 0;
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      const tie =
        prev &&
        (this.config.mode === 'spud'
          ? !r.finishOrder && !prev.finishOrder && prev.position === r.position && prev.score === r.score
          : prev.score === r.score && prev.correct === r.correct);
      place = tie ? place : i + 1;
      r.place = place;
    });
    return rows;
  }

  finish(winnerId = null) {
    if (this.phase === 'finished') return;
    clearTimeout(this.timer);
    this.phase = 'finished';
    this.results = { winnerId, ranking: this.ranking(), finishedAt: Date.now() };
    this.changed();
    try {
      this.onFinish(this);
    } catch (err) {
      console.error('[sala] erro ao salvar resultado:', err);
    }
  }

  end() {
    if (this.phase === 'lobby') throw new GameError('A partida ainda não começou.');
    this.finish(null);
  }

  restart() {
    if (this.phase === 'lobby') return;
    this.resetGameState();
    this.changed();
  }

  // ------------------------------------------------------------------ views

  competitorsView() {
    return this.competitorIds()
      .map((id) => {
        const info = this.competitorInfo(id);
        if (!info) return null;
        const st = this.state.get(id);
        const members = this.config.playStyle === 'teams' ? this.membersOf(id) : [];
        return {
          id,
          ...info,
          score: st ? st.score : 0,
          position: st ? st.position : 0,
          shield: st ? st.shield : false,
          skip: st ? st.skip : 0,
          powerups: st ? st.powerups.slice() : [],
          armed: st ? { ...st.armed } : { speed: false, double: false },
          correct: st ? st.correct : 0,
          connected: this.isAnswerable(id),
          members: members.map((m) => ({ id: m.id, name: m.name, connected: m.connected })),
        };
      })
      .filter(Boolean);
  }

  questionView(withAnswer) {
    const c = this.current;
    if (!c) return null;
    const q = c.question;
    const reveal = withAnswer || this.phase !== 'question';
    const view = {
      num: c.num,
      total: this.totalQuestions(),
      type: q.type,
      text: q.text,
      image: q.image,
      points: q.points,
      options: q.type === 'multiple' ? q.options.filter((o) => o.text).map((o) => ({ id: o.id, text: o.text })) : [],
      seconds: c.seconds,
      startedAt: c.startedAt,
      deadline: c.deadline,
      activeIds: c.activeIds,
      skipped: c.skipped,
      answeredIds: [...c.answers.keys()],
      isLast: !!c.isLast,
    };
    if (reveal) {
      view.correct = q.type === 'multiple' ? q.correct : null;
      view.acceptedAnswers = q.type === 'open' ? q.answers : [];
    }
    if (this.phase !== 'question') view.results = c.results;
    return view;
  }

  baseView(role) {
    return {
      code: this.code,
      role,
      gameTitle: this.gameTitle,
      phase: this.phase,
      serverNow: Date.now(),
      config: this.config,
      questionCount: this.questions.length,
      teams: this.teams,
      players: [...this.players.values()]
        .filter((p) => !p.kicked)
        .map((p) => ({ id: p.id, name: p.name, character: p.character, color: p.color, teamId: p.teamId, connected: p.connected })),
      competitors: this.competitorsView(),
      board: this.board,
      question: this.questionView(role === 'host'),
      lastResolution: this.lastResolution,
      results: this.results,
    };
  }

  hostView() {
    const v = this.baseView('host');
    if (this.current && this.phase === 'question') {
      v.liveAnswers = Object.fromEntries(
        [...this.current.answers.entries()].map(([id, a]) => [id, { by: a.by, text: a.text, correct: a.correct }])
      );
    }
    return v;
  }

  displayView() {
    return this.baseView('display');
  }

  playerView(playerId) {
    const v = this.baseView('player');
    const p = this.players.get(playerId);
    if (!p) return v;
    const compId = this.competitorIdOf(p);
    const ans = this.current ? this.current.answers.get(compId) : null;
    v.you = {
      playerId: p.id,
      name: p.name,
      character: p.character,
      color: p.color,
      teamId: p.teamId,
      competitorId: compId,
      myTurn: !!(this.current && this.phase === 'question' && this.current.activeIds.includes(compId)),
      answered: !!ans,
      answer: ans ? { text: ans.text, value: ans.value, by: ans.by } : null,
    };
    return v;
  }
}

module.exports = { Room, GameError };
