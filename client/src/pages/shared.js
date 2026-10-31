import { html, on } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { user } from '../lib/auth.js';
import { toast, loadingBlock, errorBlock } from '../lib/ui.js';
import { navigate } from '../lib/nav.js';
import { coverArt, subjectStyle } from '../lib/subjects.js';
import { openPreview } from '../lib/preview.js';

export function render(root, { code }) {
  let game = null;
  root.innerHTML = String(loadingBlock('Abrindo jogo compartilhado...'));

  function draw() {
    const u = user();
    root.innerHTML = String(html`
      <section class="shared">
        ${coverArt(game, 'cover shared-cover')}
        <div class="shared-info">
          <span class="subject-tag" style="--c:${subjectStyle(game.subject).color}">${game.subject}</span>
          <h1>${game.title}</h1>
          <p class="muted">Criado por ${game.ownerName} · ${game.readyCount} pergunta${game.readyCount === 1 ? '' : 's'}</p>
          ${game.description ? html`<p>${game.description}</p>` : ''}
          <div class="hero-actions">
            <button class="btn" data-preview>Visualizar perguntas</button>
            ${game.isMine
              ? html`<a class="btn primary" href="/criador/${game.id}">Abrir no criador</a>`
              : u
                ? html`<button class="btn primary" data-copy>Salvar na minha biblioteca</button>`
                : html`<a class="btn primary" href="/entrar?voltar=${encodeURIComponent(location.pathname)}">Entre para salvar uma cópia</a>`}
          </div>
          <p class="hint">A cópia é sua: dá para editar e jogar nos dois modos sem mudar o original.</p>
        </div>
      </section>`);
  }

  async function load() {
    try {
      const res = await api.get(`/api/shared/${code}`);
      game = res.game;
      document.title = `${game.title} — Jogaê!`;
      draw();
    } catch (err) {
      root.innerHTML = String(errorBlock(err.message));
    }
  }
  load();

  const off = [
    on(root, 'click', '[data-preview]', () => openPreview(game)),
    on(root, 'click', '[data-copy]', async (_e, b) => {
      b.disabled = true;
      try {
        const { game: copy } = await api.post(`/api/shared/${code}/copy`);
        toast('Jogo salvo na sua biblioteca!', 'success');
        navigate(`/criador/${copy.id}`);
      } catch (err) {
        toast(err.message, 'error');
        b.disabled = false;
      }
    }),
  ];
  return () => off.forEach((f) => f());
}
