// Componentes visuais compartilhados entre o painel, a tela principal e o celular.
import { html, raw, imageUrl } from '../lib/dom.js';
import { characterSVG } from '../lib/characters.js';
import { serverTime } from '../lib/socket.js';
import { sfx } from '../lib/sound.js';
import { OPTION_LETTERS } from '../lib/preview.js';
import { POWERUPS } from './overlays.js';

export { OPTION_LETTERS };

export function timerRing(q) {
  if (!q || !q.deadline) return html`<div class="timer no-limit" title="Sem limite de tempo">∞</div>`;
  return html`<div class="timer" data-timer data-deadline="${q.deadline}" data-seconds="${q.seconds}">
    <svg viewBox="0 0 44 44" aria-hidden="true"><circle class="timer-bg" cx="22" cy="22" r="19"/><circle class="timer-fg" cx="22" cy="22" r="19" pathLength="100"/></svg>
    <span class="timer-num">${q.seconds}</span></div>`;
}

/** Atualiza todos os cronômetros visíveis. Retorna função para parar. */
export function startTimers(root, { ticking = true } = {}) {
  let raf;
  let lastSec = null;
  const loop = () => {
    root.querySelectorAll('[data-timer]').forEach((el) => {
      const deadline = Number(el.dataset.deadline);
      const total = Number(el.dataset.seconds) * 1000;
      const left = Math.max(0, deadline - serverTime());
      const sec = Math.ceil(left / 1000);
      el.querySelector('.timer-num').textContent = sec;
      el.querySelector('.timer-fg').style.strokeDashoffset = String(100 - (left / total) * 100);
      el.classList.toggle('low', sec <= 5 && left > 0);
      el.classList.toggle('done', left <= 0);
      if (ticking && sec !== lastSec) {
        if (sec <= 5 && sec > 0 && lastSec !== null) sfx.tick();
        if (sec === 0 && lastSec > 0) sfx.timeUp();
        lastSec = sec;
      }
    });
    raf = requestAnimationFrame(loop);
  };
  loop();
  return () => cancelAnimationFrame(raf);
}

export function questionCard(q, { compact = false } = {}) {
  return html`<div class="q-card ${compact ? 'compact' : ''}">
    ${q.image ? html`<img class="q-image" src="${imageUrl(q.image)}" alt="" />` : ''}
    <h2 class="q-text">${q.text}</h2>
  </div>`;
}

/**
 * Alternativas. mode: 'show' (tela), 'pick' (apresentador escolhe), 'answer' (celular).
 */
export function optionsGrid(q, { mode = 'show', results, chosen } = {}) {
  const revealed = q.correct !== undefined && q.correct !== null;
  const n = q.options.length;
  const tag = mode === 'show' ? 'div' : 'button';
  return html`<div class="options-grid n${n} mode-${mode}">${q.options.map((o, i) => {
    const cls = revealed ? (o.id === q.correct ? 'is-correct' : 'is-dim') : '';
    const picked = chosen && chosen === o.id ? 'is-chosen' : '';
    const attrs = mode === 'show' ? '' : `type="button" data-option="${o.id}"`;
    return html`<${raw(tag)} class="opt opt-${i} ${cls} ${picked}" ${raw(attrs)}><span class="opt-letter">${OPTION_LETTERS[i]}</span><span class="opt-text">${o.text}</span>${
      revealed && o.id === q.correct ? html`<span class="opt-check" aria-label="Correta">✓</span>` : ''
    }</${raw(tag)}>`;
  })}</div>`;
}

export function avatar(c, size = 40, cls = '') {
  return raw(characterSVG(c.character, c.color, { size, className: cls }));
}

export function powerupChips(list, { clickable = false } = {}) {
  if (!list || !list.length) return '';
  return html`<span class="pw-chips">${list.map((p, i) =>
    clickable
      ? html`<button class="pw-chip" data-power="${p}" data-index="${i}" title="${POWERUPS[p].description}">${POWERUPS[p].icon} ${POWERUPS[p].label}</button>`
      : html`<span class="pw-chip small" title="${POWERUPS[p].label}: ${POWERUPS[p].description}">${POWERUPS[p].icon}</span>`
  )}</span>`;
}

/** Placar lateral. Spud ordena por posição; Classic por pontos. */
export function scoreboard(state, { activeIds = [], answeredIds = [] } = {}) {
  const spud = state.config.mode === 'spud';
  const finish = state.board ? state.board.length - 1 : 1;
  const list = state.competitors.slice().sort((a, b) => (spud ? b.position - a.position || b.score - a.score : b.score - a.score));
  return html`<ol class="scoreboard">${list.map((c, i) => {
    const active = activeIds.includes(c.id);
    const answered = answeredIds.includes(c.id);
    return html`<li class="sb-row ${active ? 'is-active' : ''} ${c.connected ? '' : 'is-offline'}" style="--c:${c.color}">
      <span class="sb-place">${i + 1}</span>
      <span class="sb-avatar">${avatar(c, 36)}</span>
      <span class="sb-main">
        <span class="sb-name">${c.name}${c.shield ? html` <span title="Escudo ativo">🛡️</span>` : ''}${c.skip ? html` <span title="Perde a próxima vez">😴</span>` : ''}${
          c.armed && c.armed.speed ? html` <span title="Speed Boost ativo">⚡</span>` : ''
        }${c.armed && c.armed.double ? html` <span title="Double Points ativo">✖️2</span>` : ''}</span>
        ${spud
          ? html`<span class="sb-progress"><span style="width:${Math.round((c.position / finish) * 100)}%"></span></span>`
          : ''}
        ${spud ? powerupChips(c.powerups) : ''}
      </span>
      <span class="sb-score"><strong>${c.score}</strong><small>pts</small>${spud ? html`<small class="sb-pos">casa ${c.position}</small>` : ''}</span>
      ${active && answered ? html`<span class="sb-answered" title="Já respondeu">✔</span>` : ''}
    </li>`;
  })}</ol>`;
}

export function podium(results, mode) {
  const top = results.ranking.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return html`<div class="podium">${order.map((r) => html`
    <div class="podium-col place-${r.place}" style="--c:${r.color}">
      <div class="podium-char ${r.place === 1 ? 'char-cheer' : 'char-idle'}">${avatar(r, r.place === 1 ? 120 : 92)}</div>
      <div class="podium-name">${r.name}</div>
      <div class="podium-block"><span class="podium-place">${r.place}º</span><span>${mode === 'spud' ? (r.finishOrder ? 'Chegou!' : `Casa ${r.position}`) : `${r.score} pts`}</span></div>
    </div>`)}</div>`;
}

export function rankingTable(results, mode) {
  return html`<ol class="ranking">${results.ranking.map(
    (r) => html`<li style="--c:${r.color}"><span class="rk-place">${r.place}º</span><span class="rk-avatar">${avatar(r, 34)}</span>
      <span class="rk-name">${r.name}${r.members && r.members.length ? html`<small>${r.members.join(', ')}</small>` : ''}</span>
      ${mode === 'spud' ? html`<span class="rk-pos">${r.finishOrder ? '🏁 Chegada' : `Casa ${r.position}`}</span>` : ''}
      <span class="rk-score">${r.score} pts</span><span class="rk-correct">${r.correct}/${r.answered} acertos</span></li>`
  )}</ol>`;
}
