import { html, raw, on, formatDate } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { user, logout, updateLocalUser } from '../lib/auth.js';
import { toast, loadingBlock } from '../lib/ui.js';
import { navigate } from '../lib/nav.js';
import { resetSocket } from '../lib/socket.js';
import { characterSVG, CHARACTERS, COLORS } from '../lib/characters.js';

export function render(root) {
  const u = user();
  let avatar = { ...u.avatar };
  let stats = null;

  function draw() {
    root.innerHTML = String(html`
      <header class="page-head"><div><h1>Seu perfil</h1><p class="muted">Conta criada em ${new Date(u.createdAt).toLocaleDateString('pt-BR')}</p></div>
        <button class="btn ghost" data-logout>Sair da conta</button></header>
      <div class="profile-grid">
        <section class="panel">
          <h2>Personagem e nome</h2>
          <div class="profile-avatar" data-avatar-preview>${raw(characterSVG(avatar.character, avatar.color, { size: 120, className: 'char-idle' }))}</div>
          <div class="char-picker" role="radiogroup" aria-label="Personagem">
            ${CHARACTERS.map(
              (c) => html`<button class="char-option ${avatar.character === c.id ? 'active' : ''}" data-char="${c.id}" role="radio" aria-checked="${avatar.character === c.id}" title="${c.name}">
                ${raw(characterSVG(c.id, avatar.color, { size: 48 }))}<small>${c.name}</small></button>`
            )}
          </div>
          <div class="color-picker" role="radiogroup" aria-label="Cor">
            ${COLORS.map((c) => html`<button class="color-dot ${avatar.color === c ? 'active' : ''}" style="--c:${c}" data-color="${c}" role="radio" aria-checked="${avatar.color === c}" aria-label="Cor ${c}"></button>`)}
          </div>
          <form data-profile class="form">
            <label class="field"><span>Nome</span><input name="name" value="${u.name}" minlength="2" maxlength="60" required /></label>
            <label class="field"><span>E-mail</span><input value="${u.email}" disabled /></label>
            <button class="btn primary" type="submit">Salvar perfil</button>
          </form>
        </section>
        <section class="panel">
          <h2>Seus números</h2>
          <div data-stats>${loadingBlock()}</div>
        </section>
        <section class="panel">
          <h2>Trocar senha</h2>
          <form data-password class="form">
            <label class="field"><span>Senha atual</span><input type="password" name="currentPassword" autocomplete="current-password" required /></label>
            <label class="field"><span>Nova senha</span><input type="password" name="newPassword" autocomplete="new-password" minlength="6" required /></label>
            <button class="btn" type="submit">Trocar senha</button>
          </form>
        </section>
      </div>`);
    drawStats();
  }

  function drawStats() {
    const box = root.querySelector('[data-stats]');
    if (!box || !stats) return;
    box.innerHTML = String(html`
      <dl class="stat-row">
        <div><dt>Jogos</dt><dd>${stats.games}</dd></div>
        <div><dt>Perguntas</dt><dd>${stats.questions}</dd></div>
        <div><dt>Partidas</dt><dd>${stats.matches}</dd></div>
      </dl>
      <h3>Últimas partidas</h3>
      ${stats.recentMatches.length
        ? html`<ul class="match-list">${stats.recentMatches.map(
            (m) => html`<li><span class="mode-pill ${m.mode}">${m.mode === 'spud' ? 'Spud Game' : 'Classic Quiz'}</span>
              <span class="match-title">${m.gameTitle}</span>
              <span class="muted">${m.finishedAt ? `🏆 ${m.winner || '—'} · ${m.participants} participante${m.participants === 1 ? '' : 's'}` : 'Não terminada'} · ${formatDate(m.startedAt)}</span></li>`
          )}</ul>`
        : html`<p class="muted">Nenhuma partida terminada ainda. Abra uma pela biblioteca!</p>`}`);
  }

  draw();
  api
    .get('/api/auth/stats')
    .then((s) => {
      stats = s;
      drawStats();
    })
    .catch((err) => {
      const box = root.querySelector('[data-stats]');
      if (box) box.textContent = err.message;
    });

  const refreshAvatar = () => {
    root.querySelector('[data-avatar-preview]').innerHTML = characterSVG(avatar.character, avatar.color, { size: 120, className: 'char-idle char-hop' });
    root.querySelectorAll('[data-char]').forEach((b) => {
      b.classList.toggle('active', b.dataset.char === avatar.character);
      b.setAttribute('aria-checked', b.dataset.char === avatar.character);
      b.querySelector('svg').outerHTML = characterSVG(b.dataset.char, avatar.color, { size: 48 });
    });
    root.querySelectorAll('[data-color]').forEach((b) => {
      b.classList.toggle('active', b.dataset.color === avatar.color);
      b.setAttribute('aria-checked', b.dataset.color === avatar.color);
    });
  };

  const off = [
    on(root, 'click', '[data-char]', (_e, b) => {
      avatar.character = b.dataset.char;
      refreshAvatar();
    }),
    on(root, 'click', '[data-color]', (_e, b) => {
      avatar.color = b.dataset.color;
      refreshAvatar();
    }),
    on(root, 'submit', '[data-profile]', async (e, form) => {
      e.preventDefault();
      try {
        const { user: nu } = await api.patch('/api/auth/me', { name: form.name.value, avatar });
        updateLocalUser(nu);
        toast('Perfil salvo.', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    }),
    on(root, 'submit', '[data-password]', async (e, form) => {
      e.preventDefault();
      try {
        await api.post('/api/auth/password', { currentPassword: form.currentPassword.value, newPassword: form.newPassword.value });
        form.reset();
        toast('Senha trocada.', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    }),
    on(root, 'click', '[data-logout]', async () => {
      await logout();
      resetSocket();
      navigate('/');
    }),
  ];
  return () => off.forEach((f) => f());
}
