// Tela do participante (celular ou computador): /partida/CODIGO
import { html, raw, on, $ } from '../lib/dom.js';
import { getSocket, emit, syncClock, loadPlayerSession, clearPlayerSession } from '../lib/socket.js';
import { navigate } from '../lib/nav.js';
import { toast, modal, volumeControl, bindVolume } from '../lib/ui.js';
import { sfx } from '../lib/sound.js';
import { characterSVG, CHARACTERS, COLORS } from '../lib/characters.js';
import { timerRing, startTimers, questionCard, optionsGrid, avatar, powerupChips } from '../game/widgets.js';
import { POWERUPS, SPUD_EVENTS } from '../game/overlays.js';

export function render(root, { code }) {
  const session = loadPlayerSession(code);
  if (!session) {
    navigate(`/jogar/${code}`, { replace: true });
    return;
  }
  const socket = getSocket();
  let state = null;
  let fatal = null;
  let lastFeedbackKey = null;
  let stopTimers = () => {};
  let sending = false;
  let draftAnswer = '';
  let pickerOpen = false;

  root.innerHTML = String(html`<div class="player-wrap">
    <header class="player-head" data-head></header>
    <div class="player-body" data-body><div class="loading"><div class="spinner"></div><p>Entrando na partida...</p></div></div>
    <div class="reconnect" data-reconnect hidden><div class="spinner small"></div> Reconectando...</div>
  </div>`);
  const body = $('[data-body]', root);
  const head = $('[data-head]', root);
  const recon = $('[data-reconnect]', root);

  async function rejoin() {
    recon.hidden = true;
    try {
      await emit('player:rejoin', { code, token: session.token });
    } catch (err) {
      fatal = { message: err.message, rejoin: true };
      drawFatal();
    }
  }

  function drawFatal() {
    stopTimers();
    head.innerHTML = '';
    body.innerHTML = String(html`<div class="empty-state"><p class="big-emoji">👋</p><h2>${fatal.message}</h2>
      ${fatal.rejoin ? html`<a class="btn primary" href="/jogar/${code}" data-clear>Entrar de novo</a>` : ''}
      <a class="btn ghost" href="/">Ir para o início</a></div>`);
  }

  const onState = (s) => {
    syncClock(s.serverNow);
    state = s;
    if (fatal) return;
    draw();
  };
  const onKicked = (m) => {
    clearPlayerSession(code);
    fatal = { message: m.message, rejoin: false };
    drawFatal();
  };
  const onClosed = (m) => {
    clearPlayerSession(code);
    fatal = { message: m.message, rejoin: false };
    drawFatal();
  };
  const onDisconnect = () => {
    if (!fatal) recon.hidden = false;
  };

  socket.on('room:state', onState);
  socket.on('room:kicked', onKicked);
  socket.on('room:closed', onClosed);
  socket.on('connect', rejoin);
  socket.on('disconnect', onDisconnect);
  if (socket.connected) rejoin();

  // ----------------------------------------------------------- utilidades
  const me = () => state.you || {};
  const myComp = () => state.competitors.find((c) => c.id === me().competitorId);
  const spud = () => state.config.mode === 'spud';

  function myPlace() {
    const list = state.competitors.slice().sort((a, b) => (spud() ? b.position - a.position || b.score - a.score : b.score - a.score));
    return list.findIndex((c) => c.id === me().competitorId) + 1;
  }

  function drawHead() {
    const c = myComp();
    const y = me();
    const team = state.config.playStyle === 'teams' ? state.teams.find((t) => t.id === y.teamId) : null;
    head.innerHTML = String(html`
      <span class="ph-avatar">${raw(characterSVG(y.character, y.color, { size: 40 }))}</span>
      <span class="ph-name"><strong>${y.name}</strong>${team ? html`<small style="color:${team.color}">${team.name}</small>` : ''}</span>
      ${c && state.phase !== 'lobby'
        ? html`<span class="ph-stats"><strong>${c.score}</strong> pts${spud() ? html` · casa <strong>${c.position}</strong>` : ''}</span>`
        : html`<span class="ph-code">Sala ${state.code}</span>`}
      ${volumeControl()}`);
  }

  // --------------------------------------------------------------- desenho
  let lastSig = null;
  function signature() {
    const s = state;
    return JSON.stringify([
      s.phase,
      s.question && s.question.num,
      s.question && s.question.activeIds,
      s.you,
      myComp(),
      s.phase === 'lobby' ? s.players.map((p) => [p.teamId, p.character, p.color]) : 0,
      s.teams,
      pickerOpen,
      s.lastResolution && s.lastResolution.id,
      s.results && s.results.finishedAt,
    ]);
  }

  function draw() {
    const sig = signature();
    if (sig === lastSig) return;
    lastSig = sig;
    stopTimers();
    drawHead();
    const s = state;
    if (s.phase === 'lobby') drawLobby();
    else if (s.phase === 'question') drawQuestion();
    else if (s.phase === 'reveal') drawReveal();
    else if (s.phase === 'finished') drawFinished();
    stopTimers = startTimers(body, { ticking: false });
  }

  function drawLobby() {
    const y = me();
    const teams = state.config.playStyle === 'teams';
    body.innerHTML = String(html`<div class="p-lobby">
      <div class="p-avatar char-idle">${raw(characterSVG(y.character, y.color, { size: 140 }))}</div>
      <h1>Você está na sala!</h1>
      <p class="muted">Olhe para o telão. A partida começa quando o professor quiser.</p>
      <div class="dots"><i></i><i></i><i></i></div>
      ${teams
        ? html`<div class="team-picker small">${state.teams.map(
            (t) => html`<button class="team-option ${y.teamId === t.id ? 'active' : ''}" style="--c:${t.color}" data-team="${t.id}">${avatar(t, 30)}<span><strong>${t.name}</strong><small>${state.players.filter((p) => p.teamId === t.id).length} jogador(es)</small></span></button>`
          )}</div>`
        : ''}
      <button class="btn small ghost" data-change-look>Trocar personagem</button>
      ${pickerOpen
        ? html`<div class="look-picker">
            <div class="char-picker compact">${CHARACTERS.map(
              (c) => html`<button class="char-option ${y.character === c.id ? 'active' : ''}" data-char="${c.id}" title="${c.name}">${raw(characterSVG(c.id, y.color, { size: 40 }))}</button>`
            )}</div>
            <div class="color-picker">${COLORS.map((c) => html`<button class="color-dot ${y.color === c ? 'active' : ''}" style="--c:${c}" data-color="${c}" aria-label="Cor"></button>`)}</div>
          </div>`
        : ''}
      <button class="btn ghost small" data-leave>Sair da partida</button>
    </div>`);
  }

  function drawQuestion() {
    const q = state.question;
    const y = me();
    const c = myComp();
    if (!q) return;
    if (q.skipped && q.skipped.includes(y.competitorId) && !q.activeIds.includes(y.competitorId)) {
      body.innerHTML = String(html`<div class="p-wait"><p class="big-emoji">😴</p><h2>Você perdeu esta vez</h2><p class="muted">Na próxima pergunta você volta ao jogo.</p></div>`);
      return;
    }
    if (!y.myTurn) {
      const active = state.competitors.find((x) => x.id === q.activeIds[0]);
      body.innerHTML = String(html`<div class="p-wait">
        ${active ? html`<div class="char-idle">${avatar(active, 96)}</div><h2>Vez de ${active.name}</h2>` : html`<h2>Aguarde sua vez</h2>`}
        <p class="muted">Acompanhe pelo telão. Torça!</p>
        ${questionCard(q, { compact: true })}
      </div>`);
      return;
    }
    if (y.answered) {
      body.innerHTML = String(html`<div class="p-wait answered">
        <p class="big-emoji pop">📨</p>
        <h2>Resposta enviada!</h2>
        <p class="sent-answer">${y.answer ? y.answer.text : ''}</p>
        ${state.config.playStyle === 'teams' && y.answer && y.answer.by !== y.name ? html`<p class="muted">${y.answer.by} respondeu pela equipe.</p>` : ''}
        <p class="muted">Aguarde a revelação no telão.</p>
      </div>`);
      return;
    }
    const pw = spud() && c && c.powerups.length ? c.powerups : [];
    const armed = c && c.armed ? c.armed : {};
    body.innerHTML = String(html`<div class="p-question">
      <div class="p-q-top">${timerRing(q)}<span class="q-points">${q.points} pts</span>${
        state.config.playStyle === 'teams' ? html`<span class="muted small">A primeira resposta vale pela equipe</span>` : ''
      }</div>
      ${questionCard(q, { compact: true })}
      ${q.type === 'multiple'
        ? optionsGrid(q, { mode: 'answer' })
        : html`<form class="p-open" data-open>
            <input name="answer" maxlength="160" autocomplete="off" placeholder="Digite sua resposta" value="${draftAnswer}" aria-label="Sua resposta" />
            <button class="btn primary big" type="submit">Enviar</button>
          </form>`}
      ${pw.length || c.shield || armed.speed || armed.double
        ? html`<div class="p-powers">
            <p class="muted small">Seus poderes${c.shield ? ' · 🛡️ escudo ativo' : ''}${armed.speed ? ' · ⚡ boost ativo' : ''}${armed.double ? ' · ✖️2 ativo' : ''}</p>
            ${powerupChips(pw, { clickable: true })}
          </div>`
        : ''}
    </div>`);
    const input = body.querySelector('.p-open input');
    if (input) {
      input.addEventListener('input', () => (draftAnswer = input.value));
      input.focus();
    }
  }

  function stepText(s) {
    const mine = s.competitorId === me().competitorId;
    if (!mine && !(s.type === 'swap' && s.targetId === me().competitorId) && s.type !== 'shuffle') return null;
    switch (s.type) {
      case 'dice':
        return `🎲 Você tirou ${s.value} no dado`;
      case 'boost':
        return `⚡ Speed Boost: +${s.extra} casas`;
      case 'doubled':
        return `✖️2 Pontos dobrados: +${s.points}`;
      case 'finish':
        return '🏁 Você cruzou a linha de chegada!';
      case 'wrong':
        return `↩️ Voltou ${s.from - s.to} casa(s) por errar`;
      case 'danger':
        return `⚠️ Casa de perigo: voltou ${s.amount} casas`;
      case 'roulette':
        return `🎡 Roleta: ${SPUD_EVENTS[s.event].icon} ${SPUD_EVENTS[s.event].label}`;
      case 'gift':
        return `🎁 Ganhou o poder ${POWERUPS[s.powerup].label}`;
      case 'gift_full':
        return '🎁 Você já tem 3 poderes guardados';
      case 'shield':
        return '🛡️ Seu escudo te protegeu!';
      case 'skip':
        return '😴 Você vai perder a próxima vez';
      case 'points':
        return `💎 +${s.points} pontos extras`;
      case 'swap':
        return mine ? '🔄 Você trocou de lugar!' : '🔄 Alguém trocou de lugar com você!';
      case 'shuffle':
        return '🌪️ As posições foram embaralhadas!';
      default:
        return null;
    }
  }

  function drawReveal() {
    const q = state.question;
    const y = me();
    const c = myComp();
    const r = q && q.results ? q.results[y.competitorId] : null;
    const key = `${q.num}`;
    if (r && lastFeedbackKey !== key) {
      lastFeedbackKey = key;
      if (r.correct) sfx.correct();
      else if (r.answered) sfx.wrong();
    }
    const correctText =
      q.type === 'multiple' ? (q.options.find((o) => o.id === q.correct) || {}).text : (q.acceptedAnswers || []).join(' / ');
    const events =
      spud() && state.lastResolution && state.lastResolution.kind === 'answer'
        ? state.lastResolution.steps.map(stepText).filter(Boolean)
        : [];
    body.innerHTML = String(html`<div class="p-result ${r ? (r.correct ? 'good' : 'bad') : 'neutral'}">
      ${r
        ? r.correct
          ? html`<div class="p-avatar char-cheer">${raw(characterSVG(y.character, y.color, { size: 130 }))}</div><h1 class="pop">Acertou!</h1><p class="gain">+${r.points} pontos</p>`
          : html`<div class="p-avatar">${raw(characterSVG(y.character, y.color, { size: 130, mood: 'sad', className: 'char-sad' }))}</div><h1>${r.answered ? 'Não foi dessa vez' : 'Tempo esgotado'}</h1>`
        : html`<h2>Resposta revelada</h2>`}
      <p class="right-answer">Resposta certa: <strong>${correctText}</strong></p>
      ${events.length ? html`<ul class="p-events">${events.map((t) => html`<li>${t}</li>`)}</ul>` : ''}
      ${c ? html`<p class="p-rank">Você está em <strong>${myPlace()}º lugar</strong>${spud() ? html` · casa ${c.position} de ${state.board.length - 1}` : ''}</p>` : ''}
      <p class="muted">Próxima pergunta em instantes...</p>
    </div>`);
  }

  function drawFinished() {
    const res = state.results;
    const row = res.ranking.find((x) => x.id === me().competitorId);
    const y = me();
    if (row && lastFeedbackKey !== 'end') {
      lastFeedbackKey = 'end';
      if (row.place === 1) sfx.fanfare();
    }
    body.innerHTML = String(html`<div class="p-final">
      <div class="p-avatar ${row && row.place === 1 ? 'char-cheer' : 'char-idle'}">${raw(characterSVG(y.character, y.color, { size: 140 }))}</div>
      ${row
        ? html`<h1>${row.place === 1 ? 'Vitória!' : `${row.place}º lugar`}</h1><p class="gain">${row.score} pontos · ${row.correct} acerto${row.correct === 1 ? '' : 's'}</p>`
        : html`<h1>Fim de jogo!</h1>`}
      <ol class="mini-ranking">${res.ranking.slice(0, 5).map(
        (r) => html`<li class="${row && r.id === row.id ? 'me' : ''}"><span>${r.place}º</span>${avatar(r, 26)}<span>${r.name}</span><b>${r.score}</b></li>`
      )}</ol>
      <p class="muted">Se o professor começar outra rodada, você entra automaticamente.</p>
      <button class="btn ghost" data-leave>Sair</button>
    </div>`);
  }

  // ----------------------------------------------------------------- ações
  async function send(value) {
    if (sending) return;
    sending = true;
    try {
      await emit('player:answer', { value });
      draftAnswer = '';
      sfx.click();
    } catch (err) {
      toast(err.message, 'error');
    }
    sending = false;
  }

  function chooseTarget() {
    return new Promise((resolve) => {
      const others = state.competitors.filter((c) => c.id !== me().competitorId);
      const m = modal({
        title: 'Trocar de lugar com quem?',
        body: String(html`<div class="target-list">${others.map(
          (c) => html`<button class="target-btn" data-target="${c.id}" style="--c:${c.color}">${avatar(c, 40)}<span>${c.name}</span><small>casa ${c.position}</small></button>`
        )}</div>`),
        onClose: () => resolve(null),
      });
      on(m.body, 'click', '[data-target]', (_e, b) => {
        resolve(b.dataset.target);
        m.close('ok');
      });
    });
  }

  bindVolume(root);
  const off = [
    on(root, 'click', '.mode-answer [data-option]', (_e, b) => {
      b.classList.add('is-chosen');
      send(b.dataset.option);
    }),
    on(root, 'submit', '[data-open]', (e, f) => {
      e.preventDefault();
      const v = f.answer.value.trim();
      if (!v) return toast('Digite uma resposta.', 'error');
      send(v);
    }),
    on(root, 'click', '[data-power]', async (_e, b) => {
      const powerup = b.dataset.power;
      let targetId = null;
      if (powerup === 'swap') {
        targetId = await chooseTarget();
        if (!targetId) return;
      }
      try {
        await emit('player:power', { powerup, targetId });
        sfx.power();
        toast(`${POWERUPS[powerup].icon} ${POWERUPS[powerup].label} ativado!`, 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    }),
    on(root, 'click', '[data-change-look]', () => {
      pickerOpen = !pickerOpen;
      lastSig = null;
      draw();
    }),
    on(root, 'click', '[data-char]', (_e, b) => emit('player:update', { character: b.dataset.char }).catch((e) => toast(e.message, 'error'))),
    on(root, 'click', '[data-color]', (_e, b) => emit('player:update', { color: b.dataset.color }).catch((e) => toast(e.message, 'error'))),
    on(root, 'click', '[data-team]', (_e, b) => emit('player:update', { teamId: b.dataset.team }).catch((e) => toast(e.message, 'error'))),
    on(root, 'click', '[data-leave]', async () => {
      try {
        await emit('player:leave');
      } catch (_) {
        /* */
      }
      clearPlayerSession(code);
      navigate('/');
    }),
    on(root, 'click', '[data-clear]', () => clearPlayerSession(code)),
  ];

  return () => {
    off.forEach((f) => f());
    stopTimers();
    socket.off('room:state', onState);
    socket.off('room:kicked', onKicked);
    socket.off('room:closed', onClosed);
    socket.off('connect', rejoin);
    socket.off('disconnect', onDisconnect);
  };
}
