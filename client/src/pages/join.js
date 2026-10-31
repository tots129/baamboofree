import { html, raw, on } from '../lib/dom.js';
import { emit, savePlayerSession, loadPlayerSession, clearPlayerSession } from '../lib/socket.js';
import { navigate } from '../lib/nav.js';
import { characterSVG, CHARACTERS, COLORS } from '../lib/characters.js';
import { user } from '../lib/auth.js';
import { sfx } from '../lib/sound.js';

const NAME_KEY = 'jogae:meu-nome';

export function render(root, { code: initialCode }) {
  let step = initialCode ? 'loading' : 'code';
  let room = null;
  let error = '';
  let code = (initialCode || '').toUpperCase();
  const me = user();
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(NAME_KEY) || '{}') || {};
  } catch (_) {
    /* */
  }
  const form = {
    name: saved.name || (me ? me.name.split(' ')[0] : ''),
    character: saved.character || CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id,
    color: saved.color || COLORS[Math.floor(Math.random() * COLORS.length)],
    teamId: null,
  };

  function draw() {
    if (step === 'loading') {
      root.innerHTML = '<div class="loading"><div class="spinner"></div><p>Procurando a sala...</p></div>';
      return;
    }
    if (step === 'code') {
      root.innerHTML = String(html`
        <section class="join-wrap">
          <div class="join-card">
            <h1>Entrar na partida</h1>
            <p class="muted">Digite o código que aparece no telão.</p>
            <form data-code class="code-form">
              <input class="code-input" name="code" value="${code}" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="ABC123" aria-label="Código da sala" required />
              ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
              <button class="btn primary big block" type="submit">Continuar</button>
            </form>
          </div>
        </section>`);
      const input = root.querySelector('.code-input');
      input.focus();
      return;
    }
    const prev = loadPlayerSession(room.code);
    if (room.answerSource === 'presenter') {
      root.innerHTML = String(html`<section class="join-wrap"><div class="join-card">
        <h1>${room.gameTitle}</h1>
        <p>Esta partida é conduzida pelo professor na tela principal. Não é preciso entrar pelo celular: acompanhe pelo telão!</p>
        <a class="btn" href="/tela/${room.code}">Ver a tela da partida</a></div></section>`);
      return;
    }
    root.innerHTML = String(html`
      <section class="join-wrap">
        <div class="join-card wide">
          <p class="room-chip">Sala <strong>${room.code}</strong> · ${room.mode === 'spud' ? 'Spud Game' : 'Classic Quiz'}</p>
          <h1>${room.gameTitle}</h1>
          ${prev
            ? html`<div class="rejoin-box"><p>Você já estava nesta partida.</p><button class="btn secondary" data-rejoin>Voltar para a partida</button></div>`
            : ''}
          ${room.phase === 'finished' ? html`<p class="form-error">Esta partida já terminou.</p>` : ''}
          <form data-join class="form">
            <div class="join-avatar" data-preview>${raw(characterSVG(form.character, form.color, { size: 110, className: 'char-idle' }))}</div>
            <label class="field"><span>Seu nome</span><input name="name" value="${form.name}" maxlength="20" required autocomplete="nickname" placeholder="Como você quer aparecer" /></label>
            <div class="field"><span>Personagem</span>
              <div class="char-picker compact" role="radiogroup" aria-label="Personagem">${CHARACTERS.map(
                (c) => html`<button type="button" class="char-option ${form.character === c.id ? 'active' : ''}" data-char="${c.id}" role="radio" aria-checked="${form.character === c.id}" title="${c.name}">${raw(characterSVG(c.id, form.color, { size: 44 }))}</button>`
              )}</div>
            </div>
            <div class="field"><span>Cor</span>
              <div class="color-picker" role="radiogroup" aria-label="Cor">${COLORS.map(
                (c) => html`<button type="button" class="color-dot ${form.color === c ? 'active' : ''}" style="--c:${c}" data-color="${c}" role="radio" aria-checked="${form.color === c}" aria-label="Cor"></button>`
              )}</div>
            </div>
            ${room.playStyle === 'teams'
              ? html`<div class="field"><span>Equipe</span>
                  <div class="team-picker">${room.teams.map(
                    (t) => html`<button type="button" class="team-option ${form.teamId === t.id ? 'active' : ''}" style="--c:${t.color}" data-team="${t.id}">
                      ${raw(characterSVG(t.character, t.color, { size: 40 }))}<span><strong>${t.name}</strong><small>${t.members} jogador${t.members === 1 ? '' : 'es'}</small></span></button>`
                  )}</div>
                  ${room.phase !== 'lobby' ? html`<small class="hint">A partida já começou: você entra direto na equipe escolhida.</small>` : ''}
                </div>`
              : ''}
            ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
            <button class="btn primary big block" type="submit" ${room.phase === 'finished' ? raw('disabled') : ''}>Entrar no jogo</button>
          </form>
        </div>
      </section>`);
  }

  async function peek(c) {
    step = 'loading';
    draw();
    try {
      const res = await emit('room:peek', { code: c });
      room = res.room;
      code = room.code;
      if (room.playStyle === 'teams' && !form.teamId) {
        const min = room.teams.reduce((a, t) => (t.members < a.members ? t : a), room.teams[0]);
        form.teamId = min.id;
      }
      error = '';
      step = 'details';
      if (location.pathname !== `/jogar/${room.code}`) history.replaceState(null, '', `/jogar/${room.code}`);
    } catch (err) {
      error = err.message;
      step = 'code';
    }
    draw();
  }

  const off = [
    on(root, 'input', '.code-input', (_e, el) => {
      el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }),
    on(root, 'submit', '[data-code]', (e, f) => {
      e.preventDefault();
      code = f.code.value.trim().toUpperCase();
      if (code.length !== 6) {
        error = 'O código tem 6 letras e números.';
        draw();
        return;
      }
      peek(code);
    }),
    on(root, 'click', '[data-char]', (_e, b) => {
      form.character = b.dataset.char;
      readName();
      draw();
    }),
    on(root, 'click', '[data-color]', (_e, b) => {
      form.color = b.dataset.color;
      readName();
      draw();
    }),
    on(root, 'click', '[data-team]', (_e, b) => {
      form.teamId = b.dataset.team;
      readName();
      draw();
    }),
    on(root, 'click', '[data-rejoin]', () => navigate(`/partida/${room.code}`)),
    on(root, 'submit', '[data-join]', async (e, f) => {
      e.preventDefault();
      readName();
      const btn = f.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        localStorage.setItem(NAME_KEY, JSON.stringify({ name: form.name, character: form.character, color: form.color }));
      } catch (_) {
        /* */
      }
      try {
        clearPlayerSession(room.code);
        const res = await emit('player:join', { code: room.code, ...form });
        savePlayerSession(res.code, { token: res.token, playerId: res.playerId });
        sfx.join();
        navigate(`/partida/${res.code}`);
      } catch (err) {
        error = err.message;
        draw();
      }
    }),
  ];

  function readName() {
    const input = root.querySelector('[data-join] [name=name]');
    if (input) form.name = input.value;
  }

  draw();
  if (initialCode) peek(initialCode);
  return () => off.forEach((f) => f());
}
