// Painel do administrador (/painel/CODIGO) e tela de apresentação (/tela/CODIGO).
import qrcode from 'qrcode-generator';
import constants from '../../../shared/constants.js';
import { html, raw, on, $, esc } from '../lib/dom.js';
import { getSocket, emit, syncClock } from '../lib/socket.js';
import { toast, modal, confirmDialog, volumeControl, bindVolume } from '../lib/ui.js';
import { navigate } from '../lib/nav.js';
import { sfx } from '../lib/sound.js';
import { characterSVG, CHARACTERS, COLORS } from '../lib/characters.js';
import { Board } from '../game/board.js';
import { runSteps } from '../game/animate.js';
import { confetti, POWERUPS } from '../game/overlays.js';
import { timerRing, startTimers, questionCard, optionsGrid, scoreboard, podium, rankingTable, avatar, powerupChips } from '../game/widgets.js';

const { LIMITS } = constants;

function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

export function render(root, { code, display }) {
  const isHost = !display;
  const socket = getSocket();
  let state = null;
  let layoutKey = null;
  let board = null;
  let lastResId = undefined;
  let animating = false;
  let pendingRes = null;
  let stopTimers = () => {};
  let lastPhaseKey = null;
  let lastPlayerCount = 0;
  let fatal = null;
  let editingTeams = false;

  root.innerHTML = String(html`<div class="stage-wrap ${isHost ? 'is-host' : 'is-display'}">
    <header class="stage-head">
      <a href="${isHost ? '/biblioteca' : '/'}" class="logo small" aria-label="Jogaê!"><span class="logo-word">Joga<span class="logo-e">ê</span>!</span></a>
      <h1 class="stage-title" data-title>Conectando...</h1>
      <span class="code-chip" title="Código da sala">Código <strong>${code}</strong></span>
      <span class="conn-dot" data-conn title="Conexão"></span>
      ${volumeControl()}
      <button class="icon-btn" data-fullscreen title="Tela cheia" aria-label="Tela cheia">⛶</button>
      ${isHost ? html`<button class="btn small" data-open-display title="Abrir a tela de apresentação em outra aba (para o projetor)">Tela de apresentação</button>` : ''}
    </header>
    <div class="stage-body" data-body><div class="loading"><div class="spinner"></div><p>Conectando à sala...</p></div></div>
    ${isHost ? html`<footer class="stage-controls" data-controls></footer>` : ''}
  </div>`);
  bindVolume(root);

  const body = $('[data-body]', root);
  const controls = $('[data-controls]', root);
  const conn = $('[data-conn]', root);

  const nameOf = (id) => {
    const c = state && state.competitors.find((x) => x.id === id);
    return c ? c.name : '?';
  };

  // ------------------------------------------------------------- conexão
  async function attach() {
    conn.classList.add('ok');
    try {
      await emit(isHost ? 'host:attach' : 'display:attach', { code });
      fatal = null;
    } catch (err) {
      fatal = err.message;
      drawFatal();
    }
  }

  function drawFatal() {
    destroyBoard();
    layoutKey = null;
    body.innerHTML = String(html`<div class="empty-state"><p class="big-emoji">🚪</p><h2>${fatal}</h2>
      <p>${isHost ? 'Salas ficam ativas enquanto o servidor estiver no ar. Abra uma nova partida pela biblioteca.' : 'Confira o código com quem está conduzindo o jogo.'}</p>
      <a class="btn primary" href="${isHost ? '/biblioteca' : '/jogar'}">${isHost ? 'Voltar à biblioteca' : 'Entrar com outro código'}</a></div>`);
    if (controls) controls.innerHTML = '';
  }

  const onState = (s) => {
    syncClock(s.serverNow);
    const prev = state;
    state = s;
    $('[data-title]', root).textContent = s.gameTitle;

    if (s.config.mode === 'spud' && s.lastResolution) {
      if (lastResId === undefined) lastResId = s.lastResolution.id; // ao conectar, não repete animações antigas
      else if (s.lastResolution.id !== lastResId) {
        lastResId = s.lastResolution.id;
        pendingRes = s.lastResolution;
      }
    } else if (lastResId === undefined) lastResId = null;

    // Sons de transição
    const phaseKey = `${s.phase}:${s.question ? s.question.num : 0}`;
    if (lastPhaseKey && phaseKey !== lastPhaseKey) {
      if (s.phase === 'question') sfx.reveal();
      if (s.phase === 'reveal' && s.config.mode === 'classic') {
        const r = s.question && s.question.results ? Object.values(s.question.results) : [];
        if (r.some((x) => x.correct)) sfx.correct();
        else sfx.wrong();
      }
    }
    lastPhaseKey = phaseKey;
    if (s.phase === 'lobby' && s.players.length > lastPlayerCount && prev) sfx.join();
    lastPlayerCount = s.players.length;

    draw();
    if (pendingRes && !animating) playResolution();
  };

  async function playResolution() {
    if (!board) return;
    animating = true;
    const res = pendingRes;
    pendingRes = null;
    drawControls();
    try {
      await runSteps(board, $('[data-board-host]', root), res, nameOf);
    } catch (err) {
      console.error(err);
    }
    animating = false;
    if (pendingRes) return playResolution();
    draw();
  }

  socket.on('room:state', onState);
  socket.on('connect', attach);
  socket.on('disconnect', () => conn.classList.remove('ok'));
  socket.on('room:closed', (m) => {
    fatal = m.message;
    drawFatal();
  });
  if (socket.connected) attach();

  // ------------------------------------------------------------- desenho
  function destroyBoard() {
    if (board) board.destroy();
    board = null;
  }

  function currentLayout() {
    if (!state) return null;
    if (state.phase === 'lobby') return 'lobby';
    if (state.phase === 'finished' && !animating && !pendingRes) return 'finished';
    return state.config.mode === 'spud' ? 'spud' : 'classic';
  }

  function draw() {
    if (fatal || !state) return;
    const key = currentLayout();
    stopTimers();
    if (key !== layoutKey) {
      destroyBoard();
      layoutKey = key;
      body.className = `stage-body layout-${key}`;
      if (key === 'spud') {
        body.innerHTML = String(html`<div class="spud-stage">
          <div class="spud-main">
            <div class="spud-question" data-question></div>
            <div class="board-host" data-board-host><div class="board" data-board></div></div>
          </div>
          <aside class="side-panel" data-side></aside>
        </div>`);
        board = new Board($('[data-board]', root), state.board);
        board.syncPieces(state.competitors);
        board.setPositions(Object.fromEntries(state.competitors.map((c) => [c.id, c.position])), false);
      }
      if (key === 'finished') {
        sfx.fanfare();
        setTimeout(() => confetti(body, 120), 100);
      }
    }
    if (key === 'lobby') drawLobby();
    else if (key === 'classic') drawClassic();
    else if (key === 'spud') drawSpud();
    else if (key === 'finished') drawFinished();
    drawControls();
    stopTimers = startTimers(body, { ticking: true });
  }

  // ----------------------------------------------------------------- lobby
  function drawLobby() {
    const s = state;
    // Não atrapalha quem está digitando o nome de uma equipe.
    const focused = document.activeElement;
    if (editingTeams && focused && focused.closest && focused.closest('[data-team-form]') && body.contains(focused)) return;
    const joinUrl = `${location.origin}/jogar/${s.code}`;
    const presenter = s.config.answerSource === 'presenter';
    const teams = s.config.playStyle === 'teams';
    body.innerHTML = String(html`<div class="lobby">
      ${presenter
        ? html`<section class="lobby-join presenter-info">
            <h2>Modo apresentador</h2>
            <p>Ninguém precisa de celular: as equipes respondem em voz alta e você registra a resposta de cada uma na sua vez.</p>
            <p class="lobby-mode">${s.config.mode === 'spud' ? '🏁 Spud Game' : '❓ Classic Quiz'} · ${s.questionCount} perguntas</p>
          </section>`
        : html`<section class="lobby-join">
            <p class="join-step">Entre em <strong>${location.host}/jogar</strong> e digite o código</p>
            <div class="big-code" aria-label="Código da sala">${s.code.split('').map((ch) => html`<span>${ch}</span>`)}</div>
            <div class="qr" aria-label="QR Code para entrar">${raw(qrSvg(joinUrl))}</div>
            <p class="lobby-mode">${s.config.mode === 'spud' ? '🏁 Spud Game' : '❓ Classic Quiz'} · ${s.questionCount} perguntas · ${teams ? 'em equipes' : 'individual'}</p>
          </section>`}
      <section class="lobby-people">
        <div class="lobby-people-head">
          <h2>${teams ? 'Equipes' : 'Participantes'} ${!presenter ? html`<span class="count-pill">${s.players.length}</span>` : ''}</h2>
          ${isHost && teams ? html`<button class="btn small" data-edit-teams>${editingTeams ? 'Concluir' : 'Editar equipes'}</button>` : ''}
        </div>
        ${teams ? (editingTeams && isHost ? teamEditor() : teamColumns()) : playerGrid()}
      </section>
    </div>`);
  }

  function playerGrid() {
    if (!state.players.length) return html`<div class="waiting"><div class="dots"><i></i><i></i><i></i></div><p>Esperando a turma entrar...</p></div>`;
    return html`<ul class="player-grid">${state.players.map(
      (p) => html`<li class="player-chip ${p.connected ? '' : 'offline'}" style="--c:${p.color}">
        <span class="char-idle">${avatar(p, 54)}</span><span class="pc-name">${p.name}</span>
        ${isHost ? html`<button class="icon-btn tiny kick" data-kick="${p.id}" aria-label="Remover ${p.name}" title="Remover">✕</button>` : ''}
      </li>`
    )}</ul>`;
  }

  function teamColumns() {
    const presenter = state.config.answerSource === 'presenter';
    return html`<div class="team-columns">${state.teams.map((t) => {
      const members = state.players.filter((p) => p.teamId === t.id);
      return html`<div class="team-col" style="--c:${t.color}">
        <div class="team-col-head">${avatar(t, 48, 'char-idle')}<strong>${t.name}</strong></div>
        ${presenter
          ? ''
          : html`<ul>${members.length
              ? members.map(
                  (p) => html`<li class="${p.connected ? '' : 'offline'}">${avatar(p, 26)} ${p.name}${
                    isHost ? html`<button class="icon-btn tiny kick" data-kick="${p.id}" aria-label="Remover ${p.name}">✕</button>` : ''
                  }</li>`
                )
              : html`<li class="muted">Ninguém ainda</li>`}</ul>`}
      </div>`;
    })}</div>`;
  }

  function teamEditor() {
    return html`<form class="team-editor" data-team-form>
      ${state.teams.map(
        (t, i) => html`<div class="team-edit-row" style="--c:${t.color}" data-team-row="${i}">
          <button type="button" class="avatar-btn" data-team-char="${i}" title="Trocar personagem">${avatar(t, 44)}</button>
          <input name="name" value="${t.name}" maxlength="${LIMITS.teamNameMax}" aria-label="Nome da equipe ${i + 1}" />
          <div class="color-picker mini">${COLORS.slice(0, 6).map(
            (c) => html`<button type="button" class="color-dot ${t.color === c ? 'active' : ''}" style="--c:${c}" data-team-color="${i}" data-color="${c}" aria-label="Cor"></button>`
          )}</div>
          ${state.teams.length > 2 ? html`<button type="button" class="icon-btn" data-team-remove="${i}" aria-label="Remover equipe">✕</button>` : ''}
        </div>`
      )}
      ${state.teams.length < LIMITS.teamsMax ? html`<button type="button" class="btn small ghost" data-team-add>+ Equipe</button>` : ''}
    </form>`;
  }

  function collectTeams() {
    return [...root.querySelectorAll('[data-team-row]')].map((row, i) => ({
      ...state.teams[i],
      name: row.querySelector('input[name=name]').value,
    }));
  }

  async function sendTeams(teams) {
    try {
      await emit('host:action', { code, action: 'teams', teams });
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // --------------------------------------------------------------- classic
  function turnLabel(q) {
    if (state.config.turnStyle !== 'turns' || !q) return '';
    const id = q.activeIds[0];
    const c = state.competitors.find((x) => x.id === id);
    if (!c) return '';
    return html`<div class="turn-label" style="--c:${c.color}">${avatar(c, 34, 'char-idle')}<span>Vez de <strong>${c.name}</strong></span></div>`;
  }

  function answeredLabel(q) {
    if (state.phase !== 'question') return '';
    const total = q.activeIds.length;
    if (state.config.turnStyle === 'turns') return '';
    return html`<span class="answered-count"><strong>${q.answeredIds.length}</strong> de ${total} responderam</span>`;
  }

  function skippedLabel(q) {
    if (!q.skipped || !q.skipped.length) return '';
    return html`<span class="skipped-note">😴 ${q.skipped.map(nameOf).join(', ')} ${q.skipped.length > 1 ? 'perderam' : 'perdeu'} a vez</span>`;
  }

  let peek = false;
  function answerArea(q) {
    const presenterPick = isHost && state.config.answerSource === 'presenter' && state.phase === 'question';
    // O painel costuma estar no telão: a resposta só aparece depois da revelação.
    if (q.type === 'multiple') {
      const shown = state.phase === 'question' ? { ...q, correct: undefined } : q;
      return optionsGrid(shown, { mode: presenterPick ? 'pick' : 'show' });
    }
    if (state.phase !== 'question') {
      return html`<div class="open-answer revealed">Resposta: <strong>${q.acceptedAnswers.join(' / ')}</strong></div>`;
    }
    if (presenterPick) {
      return html`<div class="open-answer host-judge"><p>${
        peek
          ? html`Resposta esperada: <strong>${q.acceptedAnswers.join(' / ')}</strong> <button class="btn small ghost" data-peek>Esconder</button>`
          : html`A equipe responde em voz alta. <button class="btn small ghost" data-peek title="Mostra a resposta só se esta tela não estiver no projetor">Ver resposta esperada</button>`
      }</p>
        <div class="judge-row"><button class="btn good big" data-judge="true">✓ Acertou</button><button class="btn danger big" data-judge="false">✗ Errou</button></div></div>`;
    }
    return html`<div class="open-answer">✍️ Digite a resposta no seu celular</div>`;
  }

  function resultsSummary(q) {
    if (state.phase === 'question' || !q.results) return '';
    const entries = Object.entries(q.results);
    const right = entries.filter(([, r]) => r.correct).length;
    return html`<div class="results-strip">
      <p><strong>${right}</strong> de ${entries.length} acert${right === 1 ? 'ou' : 'aram'}</p>
      <ul>${entries.map(([id, r]) => {
        const c = state.competitors.find((x) => x.id === id);
        if (!c) return '';
        return html`<li class="${r.correct ? 'ok' : 'bad'}" style="--c:${c.color}">${avatar(c, 24)}<span>${c.name}</span>${
          q.type === 'open' && r.answer && state.config.answerSource !== 'presenter' ? html`<em>“${r.answer}”</em>` : ''
        }<b>${r.correct ? `+${r.points}` : r.answered ? '✗' : '—'}</b></li>`;
      })}</ul></div>`;
  }

  function drawClassic() {
    const q = state.question;
    if (!q) return;
    body.innerHTML = String(html`<div class="classic-stage">
      <div class="classic-main ${state.phase}">
        <div class="q-meta">
          <span class="q-counter">Pergunta ${q.num}${q.total ? ` de ${q.total}` : ''}</span>
          <span class="q-points">${q.points} pts</span>
          ${answeredLabel(q)}
          ${timerRing(state.phase === 'question' ? q : null)}
        </div>
        ${turnLabel(q)}
        ${questionCard(q)}
        ${answerArea(q)}
        ${resultsSummary(q)}
      </div>
      <aside class="side-panel"><h2 class="side-title">Placar</h2>${scoreboard(state, { activeIds: q.activeIds, answeredIds: q.answeredIds })}</aside>
    </div>`);
    if (state.phase !== 'question') body.querySelector('.timer')?.remove();
  }

  // ------------------------------------------------------------------ spud
  function drawSpud() {
    const s = state;
    const q = s.question;
    board.syncPieces(s.competitors);
    if (!animating && !pendingRes) board.setPositions(Object.fromEntries(s.competitors.map((c) => [c.id, c.position])));
    board.setActive(q && s.phase === 'question' ? q.activeIds : []);

    const qBox = $('[data-question]', root);
    if (q) {
      qBox.className = `spud-question ${s.phase}`;
      qBox.innerHTML = String(html`
        <div class="q-meta">
          <span class="q-counter">Pergunta ${q.num}</span>
          <span class="q-points">${q.points} pts</span>
          ${turnLabel(q)}
          ${answeredLabel(q)}
          ${skippedLabel(q)}
          ${timerRing(s.phase === 'question' ? q : null)}
        </div>
        <div class="spud-q-body">
          ${questionCard(q, { compact: true })}
          ${answerArea(q)}
        </div>
        ${s.phase !== 'question' ? resultsSummary(q) : ''}`);
      if (s.phase !== 'question') qBox.querySelector('.timer')?.remove();
    }
    $('[data-side]', root).innerHTML = String(html`<h2 class="side-title">Corrida</h2>
      ${scoreboard(s, { activeIds: q ? q.activeIds : [], answeredIds: q ? q.answeredIds : [] })}
      <div class="legend">
        <span><i class="lg lg-star">★</i> Roleta</span><span><i class="lg lg-danger">!</i> Perigo</span><span><i class="lg lg-gift">🎁</i> Poder</span>
      </div>`);
  }

  // -------------------------------------------------------------- resultado
  function drawFinished() {
    const r = state.results;
    const winner = r.ranking[0];
    body.innerHTML = String(html`<div class="finished">
      <h2 class="finish-title">${winner ? (state.config.mode === 'spud' && r.winnerId ? `${winner.name} venceu a corrida!` : `${winner.name} venceu!`) : 'Fim de jogo!'}</h2>
      ${podium(r, state.config.mode)}
      <section class="final-ranking"><h3>Classificação final</h3>${rankingTable(r, state.config.mode)}</section>
    </div>`);
  }

  // -------------------------------------------------------------- controles
  function drawControls() {
    if (!controls || !state || fatal) return;
    const s = state;
    const q = s.question;
    const layout = currentLayout();
    let main = '';
    let extra = '';
    if (layout === 'lobby') {
      const count = s.competitors.length;
      main = html`<button class="btn primary big" data-act="start" ${count ? '' : raw('disabled')}>Começar partida</button>`;
      extra = html`<span class="muted">${count ? `${count} ${s.config.playStyle === 'teams' ? 'equipe' : 'participante'}${count > 1 ? 's' : ''} pront${count > 1 ? 'os' : 'o'}` : 'Aguardando participantes'}</span>
        <button class="btn ghost" data-close-room>Fechar sala</button>`;
    } else if (layout === 'finished') {
      main = html`<button class="btn primary big" data-act="restart">Jogar de novo</button>`;
      extra = html`<a class="btn" href="/biblioteca">Voltar à biblioteca</a><button class="btn ghost" data-close-room>Fechar sala</button>`;
    } else if (s.phase === 'question') {
      main = html`<button class="btn secondary big" data-act="reveal">${s.config.answerSource === 'presenter' ? 'Ninguém respondeu' : 'Revelar resposta'}</button>`;
      extra = html`${presenterPowerups()}<button class="btn ghost" data-end>Encerrar partida</button>`;
    } else {
      const last = s.config.mode === 'classic' && q && q.isLast;
      const finishedNow = s.phase === 'finished';
      main = finishedNow
        ? html`<button class="btn primary big" disabled>Chegada!</button>`
        : html`<button class="btn primary big" data-act="next" ${animating ? raw('disabled') : ''}>${animating ? 'Animando...' : last ? 'Ver resultado' : 'Próxima pergunta'}</button>`;
      extra = html`<button class="btn ghost" data-end>Encerrar partida</button>`;
    }
    controls.innerHTML = String(html`<div class="controls-inner">${main}<div class="controls-extra">${extra}</div></div>`);
  }

  function presenterPowerups() {
    const s = state;
    if (s.config.mode !== 'spud' || !s.question) return '';
    const items = [];
    for (const id of s.question.activeIds) {
      const c = s.competitors.find((x) => x.id === id);
      if (!c || !c.powerups.length || s.question.answeredIds.includes(id)) continue;
      if (s.config.answerSource !== 'presenter' && s.config.turnStyle !== 'turns') continue;
      items.push(html`<span class="host-powers" data-comp="${c.id}"><small>Poderes de ${c.name}:</small>${powerupChips(c.powerups, { clickable: true })}</span>`);
    }
    return items;
  }

  // ---------------------------------------------------------------- ações
  async function act(action, data = {}) {
    try {
      await emit('host:action', { code, action, ...data });
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function chooseTarget(compId, title) {
    return new Promise((resolve) => {
      const others = state.competitors.filter((c) => c.id !== compId);
      const m = modal({
        title,
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

  const off = [
    on(root, 'click', '[data-act]', (_e, b) => {
      sfx.click();
      act(b.dataset.act);
    }),
    on(root, 'click', '[data-end]', async () => {
      if (await confirmDialog({ title: 'Encerrar partida?', message: 'A partida termina agora e a classificação é mostrada com as posições atuais.', confirm: 'Encerrar' }))
        act('end');
    }),
    on(root, 'click', '[data-close-room]', async () => {
      if (await confirmDialog({ title: 'Fechar sala?', message: 'Todos os participantes serão desconectados.', confirm: 'Fechar sala', danger: true })) {
        await act('close');
        navigate('/biblioteca');
      }
    }),
    on(root, 'click', '[data-kick]', async (_e, b) => {
      const p = state.players.find((x) => x.id === b.dataset.kick);
      if (p && (await confirmDialog({ title: 'Remover participante?', message: `${p.name} sairá da partida.`, confirm: 'Remover', danger: true })))
        act('kick', { playerId: p.id });
    }),
    on(root, 'click', '.mode-pick [data-option]', (_e, b) => {
      sfx.click();
      act('answer', { value: b.dataset.option });
    }),
    on(root, 'click', '[data-judge]', (_e, b) => {
      peek = false;
      act('answer', { judge: b.dataset.judge === 'true' });
    }),
    on(root, 'click', '[data-peek]', () => {
      peek = !peek;
      draw();
    }),
    on(root, 'click', '.host-powers [data-power]', async (_e, b) => {
      const compId = b.closest('[data-comp]').dataset.comp;
      const powerup = b.dataset.power;
      let targetId = null;
      if (powerup === 'swap') {
        targetId = await chooseTarget(compId, 'Trocar de lugar com quem?');
        if (!targetId) return;
      }
      act('power', { competitorId: compId, powerup, targetId });
    }),
    on(root, 'click', '[data-edit-teams]', async () => {
      if (editingTeams) await sendTeams(collectTeams());
      editingTeams = !editingTeams;
      draw();
    }),
    on(root, 'change', '[data-team-form] input[name=name]', () => sendTeams(collectTeams())),
    on(root, 'click', '[data-team-color]', (_e, b) => {
      const teams = collectTeams();
      teams[Number(b.dataset.teamColor)].color = b.dataset.color;
      sendTeams(teams);
    }),
    on(root, 'click', '[data-team-char]', (_e, b) => {
      const teams = collectTeams();
      const t = teams[Number(b.dataset.teamChar)];
      const i = CHARACTERS.findIndex((c) => c.id === t.character);
      t.character = CHARACTERS[(i + 1) % CHARACTERS.length].id;
      sendTeams(teams);
    }),
    on(root, 'click', '[data-team-add]', () => {
      const teams = collectTeams();
      teams.push({});
      sendTeams(teams);
    }),
    on(root, 'click', '[data-team-remove]', (_e, b) => {
      const teams = collectTeams();
      teams.splice(Number(b.dataset.teamRemove), 1);
      sendTeams(teams);
    }),
    on(root, 'click', '[data-open-display]', () => window.open(`/tela/${code}`, '_blank', 'noopener')),
    on(root, 'click', '[data-fullscreen]', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    }),
  ];

  return () => {
    off.forEach((f) => f());
    stopTimers();
    destroyBoard();
    socket.off('room:state', onState);
    socket.off('connect', attach);
    socket.off('room:closed');
    socket.off('disconnect');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
}

export { esc, characterSVG };
