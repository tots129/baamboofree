import { html, raw, on, debounce, formatDate } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { toast, confirmDialog, loadingBlock, errorBlock } from '../lib/ui.js';
import { navigate } from '../lib/nav.js';
import { SUBJECTS, coverArt, subjectStyle } from '../lib/subjects.js';
import { openHostSetup } from '../lib/hostSetup.js';
import { openShare } from '../lib/share.js';
import { openPreview } from '../lib/preview.js';

export function render(root) {
  let games = [];
  let recent = [];
  let search = '';
  let subject = '';
  let loading = true;
  let error = null;

  root.innerHTML = String(html`
    <header class="page-head">
      <div>
        <h1>Sua biblioteca</h1>
        <p class="muted">Crie, edite e abra partidas dos seus jogos.</p>
      </div>
      <button class="btn primary big" data-new>+ Novo jogo</button>
    </header>
    <div class="filters">
      <label class="search"><span class="sr-only">Pesquisar por título</span>
        <input type="search" placeholder="Pesquisar por título" data-search autocomplete="off" />
      </label>
      <div class="chips" role="group" aria-label="Filtrar por matéria">
        <button class="chip active" data-subject="">Todas</button>
        ${SUBJECTS.map((s) => html`<button class="chip" data-subject="${s}">${raw(subjectStyle(s).icon)} ${s}</button>`)}
      </div>
    </div>
    <div data-content></div>`);

  const content = root.querySelector('[data-content]');

  function card(g) {
    return html`
      <article class="game-card" data-id="${g.id}">
        <a href="/criador/${g.id}" class="card-cover-link" aria-label="Editar ${g.title}">${coverArt(g, 'cover')}</a>
        <div class="card-body">
          <span class="subject-tag" style="--c:${subjectStyle(g.subject).color}">${g.subject}</span>
          <h3><a href="/criador/${g.id}">${g.title}</a></h3>
          <p class="card-meta">${g.readyCount} de ${g.questionCount} pergunta${g.questionCount === 1 ? '' : 's'} pronta${g.readyCount === 1 ? '' : 's'}${g.isShared ? ' · compartilhado' : ''}</p>
          <p class="card-date">Editado ${formatDate(g.updatedAt)}</p>
        </div>
        <div class="card-actions">
          <button class="btn primary small" data-play="${g.id}">Jogar</button>
          <a class="btn small" href="/criador/${g.id}">Editar</a>
          <div class="menu">
            <button class="icon-btn" data-menu aria-label="Mais ações" aria-haspopup="true">⋯</button>
            <div class="menu-list" role="menu" hidden>
              <button role="menuitem" data-preview="${g.id}">Visualizar</button>
              <button role="menuitem" data-duplicate="${g.id}">Duplicar</button>
              <button role="menuitem" data-share="${g.id}">Compartilhar</button>
              <button role="menuitem" class="danger-text" data-delete="${g.id}">Excluir</button>
            </div>
          </div>
        </div>
      </article>`;
  }

  function draw() {
    if (loading) return (content.innerHTML = String(loadingBlock('Carregando seus jogos...')));
    if (error) return (content.innerHTML = String(errorBlock(error, 'Tentar de novo')));
    const filtering = search || subject;
    if (!games.length) {
      content.innerHTML = String(
        filtering
          ? html`<div class="empty-state"><p class="big-emoji">🔎</p><p>Nenhum jogo encontrado com esse filtro.</p><button class="btn" data-clear>Limpar filtros</button></div>`
          : html`<div class="empty-state"><p class="big-emoji">🧩</p><h2>Sua biblioteca está vazia</h2><p>Comece criando seu primeiro jogo de perguntas.</p><button class="btn primary big" data-new>Criar meu primeiro jogo</button></div>`
      );
      return;
    }
    content.innerHTML = String(html`
      ${!filtering && recent.length
        ? html`<section class="recent"><h2 class="section-title small">Recentes</h2>
            <div class="recent-row">${recent.map(
              (g) => html`<a class="recent-item" href="/criador/${g.id}">${coverArt(g, 'cover cover-mini')}<span><strong>${g.title}</strong><small>${g.lastPlayedAt ? `Jogado ${formatDate(g.lastPlayedAt)}` : `Editado ${formatDate(g.updatedAt)}`}</small></span></a>`
            )}</div></section>`
        : ''}
      <section>
        <h2 class="section-title small">${filtering ? `${games.length} resultado${games.length === 1 ? '' : 's'}` : 'Todos os jogos'}</h2>
        <div class="game-grid">${games.map(card)}</div>
      </section>`);
  }

  async function load() {
    loading = !games.length;
    error = null;
    draw();
    try {
      const qs = new URLSearchParams();
      if (search) qs.set('search', search);
      if (subject) qs.set('subject', subject);
      const data = await api.get(`/api/games?${qs}`);
      games = data.games;
      recent = data.recent;
    } catch (err) {
      error = err.message;
    }
    loading = false;
    draw();
  }

  const find = (id) => games.find((g) => g.id === id);
  const debouncedLoad = debounce(load, 250);

  async function createGame() {
    try {
      const { game } = await api.post('/api/games', { title: 'Novo jogo', subject: subject || 'Geral' });
      navigate(`/criador/${game.id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function closeMenus() {
    root.querySelectorAll('.menu-list').forEach((m) => (m.hidden = true));
  }
  const docClick = (e) => {
    if (!e.target.closest('.menu')) closeMenus();
  };
  document.addEventListener('click', docClick);

  const off = [
    on(root, 'click', '[data-new]', createGame),
    on(root, 'click', '[data-retry]', load),
    on(root, 'click', '[data-clear]', () => {
      search = '';
      subject = '';
      root.querySelector('[data-search]').value = '';
      root.querySelectorAll('[data-subject]').forEach((c) => c.classList.toggle('active', c.dataset.subject === ''));
      load();
    }),
    on(root, 'input', '[data-search]', (_e, input) => {
      search = input.value.trim();
      debouncedLoad();
    }),
    on(root, 'click', '[data-subject]', (_e, chip) => {
      subject = chip.dataset.subject;
      root.querySelectorAll('[data-subject]').forEach((c) => c.classList.toggle('active', c === chip));
      load();
    }),
    on(root, 'click', '[data-menu]', (_e, btn) => {
      const list = btn.nextElementSibling;
      const wasHidden = list.hidden;
      closeMenus();
      list.hidden = !wasHidden;
    }),
    on(root, 'click', '[data-play]', async (_e, b) => {
      const g = find(b.dataset.play);
      if (g) openHostSetup(g);
    }),
    on(root, 'click', '[data-preview]', async (_e, b) => {
      closeMenus();
      try {
        const { game } = await api.get(`/api/games/${b.dataset.preview}`);
        openPreview(game);
      } catch (err) {
        toast(err.message, 'error');
      }
    }),
    on(root, 'click', '[data-duplicate]', async (_e, b) => {
      closeMenus();
      try {
        await api.post(`/api/games/${b.dataset.duplicate}/duplicate`);
        toast('Jogo duplicado.', 'success');
        load();
      } catch (err) {
        toast(err.message, 'error');
      }
    }),
    on(root, 'click', '[data-share]', (_e, b) => {
      closeMenus();
      const g = find(b.dataset.share);
      if (g)
        openShare(g, (updated) => {
          Object.assign(g, updated);
          draw();
        });
    }),
    on(root, 'click', '[data-delete]', async (_e, b) => {
      closeMenus();
      const g = find(b.dataset.delete);
      if (!g) return;
      const ok = await confirmDialog({
        title: 'Excluir jogo?',
        message: `“${g.title}” e todas as suas perguntas serão apagados. Isso não pode ser desfeito.`,
        confirm: 'Excluir',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.del(`/api/games/${g.id}`);
        toast('Jogo excluído.', 'success');
        load();
      } catch (err) {
        toast(err.message, 'error');
      }
    }),
  ];

  load();
  return () => {
    off.forEach((f) => f());
    document.removeEventListener('click', docClick);
    debouncedLoad.cancel();
  };
}
