import './../styles/main.css';
import { html, on, esc, raw } from './lib/dom.js';
import { loadSession, user, onAuthChange } from './lib/auth.js';
import { characterSVG } from './lib/characters.js';
import { volumeControl, bindVolume } from './lib/ui.js';

import * as home from './pages/home.js';
import * as authPage from './pages/auth.js';
import * as library from './pages/library.js';
import * as editor from './pages/editor.js';
import * as profile from './pages/profile.js';
import * as join from './pages/join.js';
import * as player from './pages/player.js';
import * as host from './pages/host.js';
import * as shared from './pages/shared.js';

const routes = [
  { path: /^\/$/, page: home, title: 'Início' },
  { path: /^\/entrar\/?$/, page: authPage, title: 'Entrar' },
  { path: /^\/biblioteca\/?$/, page: library, title: 'Biblioteca', auth: true },
  { path: /^\/criador\/([0-9a-f-]{36})\/?$/i, page: editor, title: 'Criador de jogos', auth: true, keys: ['id'] },
  { path: /^\/perfil\/?$/, page: profile, title: 'Perfil', auth: true },
  { path: /^\/jogar\/?$/, page: join, title: 'Entrar na partida' },
  { path: /^\/jogar\/([A-Za-z0-9]{6})\/?$/, page: join, title: 'Entrar na partida', keys: ['code'] },
  { path: /^\/partida\/([A-Za-z0-9]{6})\/?$/, page: player, title: 'Partida', keys: ['code'], game: true },
  { path: /^\/painel\/([A-Za-z0-9]{6})\/?$/, page: host, title: 'Painel da partida', auth: true, keys: ['code'], game: true },
  { path: /^\/tela\/([A-Za-z0-9]{6})\/?$/, page: host, title: 'Tela da partida', keys: ['code'], game: true, display: true },
  { path: /^\/compartilhado\/([A-Za-z0-9]{8})\/?$/, page: shared, title: 'Jogo compartilhado', keys: ['code'] },
];

const app = document.getElementById('app');
let cleanup = null;
let renderToken = 0;

export function navigate(to, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  render();
}
window.__navigate = navigate;

function navBar() {
  const u = user();
  const path = location.pathname;
  const link = (href, label, extra = '') =>
    html`<a href="${href}" class="nav-link ${path.startsWith(href) ? 'active' : ''} ${extra}">${label}</a>`;
  return html`
    <nav class="topnav" aria-label="Principal">
      <a href="/" class="logo" aria-label="Jogaê! — início"><span class="logo-word">Joga<span class="logo-e">ê</span>!</span></a>
      <button class="icon-btn nav-toggle" aria-label="Abrir menu" data-nav-toggle>☰</button>
      <div class="nav-links">
        ${u ? link('/biblioteca', 'Biblioteca') : ''}
        ${link('/jogar', 'Entrar na partida', 'nav-cta')}
        ${volumeControl()}
        ${
          u
            ? html`<a href="/perfil" class="nav-avatar ${path === '/perfil' ? 'active' : ''}" title="Seu perfil">
                <span class="avatar-chip">${raw(characterSVG(u.avatar.character, u.avatar.color, { size: 34 }))}</span>
                <span class="nav-name">${u.name.split(' ')[0]}</span></a>`
            : html`<a href="/entrar" class="btn btn-small">Entrar</a>`
        }
      </div>
    </nav>`;
}


function shell(routeIsGame) {
  document.body.classList.toggle('game-mode', !!routeIsGame);
  if (routeIsGame) {
    app.innerHTML = '<main id="page" class="page-game"></main>';
  } else {
    app.innerHTML = `${navBar()}<main id="page" class="page" tabindex="-1"></main>
      <footer class="site-foot"><span>Jogaê! — jogos educativos para jogar com a turma.</span></footer>`;
  }
  return document.getElementById('page');
}

async function render() {
  const token = ++renderToken;
  if (cleanup) {
    try {
      cleanup();
    } catch (e) {
      console.error(e);
    }
    cleanup = null;
  }
  const path = location.pathname;
  let match = null;
  let params = {};
  for (const r of routes) {
    const m = path.match(r.path);
    if (m) {
      match = r;
      (r.keys || []).forEach((k, i) => (params[k] = m[i + 1]));
      break;
    }
  }
  if (!match) {
    const page = shell(false);
    page.innerHTML = String(html`<section class="empty-state"><p class="big-emoji">🧭</p><h1>Página não encontrada</h1>
      <p>O endereço pode estar errado ou a página mudou de lugar.</p><a class="btn primary" href="/">Ir para o início</a></section>`);
    document.title = 'Página não encontrada — Jogaê!';
    return;
  }
  if (match.auth && !match.display && !user()) {
    navigate(`/entrar?voltar=${encodeURIComponent(path + location.search)}`, { replace: true });
    return;
  }
  document.title = `${match.title} — Jogaê!`;
  const page = shell(match.game);
  if (!match.game) bindVolume(app);
  const result = await match.page.render(page, { ...params, display: !!match.display, query: new URLSearchParams(location.search) });
  if (token !== renderToken) {
    if (typeof result === 'function') result();
    return;
  }
  cleanup = typeof result === 'function' ? result : null;
  if (!match.game) {
    window.scrollTo(0, 0);
  }
}

// Links internos sem recarregar a página
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  const href = a.getAttribute('href');
  if (!href || !href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/')) return;
  e.preventDefault();
  navigate(href);
});

on(document, 'click', '[data-nav-toggle]', () => document.querySelector('.topnav')?.classList.toggle('open'));

window.addEventListener('popstate', render);

onAuthChange(() => {
  const nav = document.querySelector('.topnav');
  if (nav) {
    nav.outerHTML = String(navBar());
  }
});

loadSession().then(render);

export { esc };
