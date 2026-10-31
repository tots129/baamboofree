import { esc, html, on } from './dom.js';
import { getVolume, setVolume, toggleMute, sfx } from './sound.js';

// ---------- Avisos rápidos ----------
export function toast(message, type = 'info', ms = 3200) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// ---------- Janela modal ----------
export function modal({ title, body, actions = [], wide = false, onClose, dismissable = true }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = String(html`
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${title || 'Janela'}">
      ${title ? html`<header class="modal-head"><h2>${title}</h2>${
        dismissable ? html`<button class="icon-btn" data-close aria-label="Fechar">✕</button>` : ''
      }</header>` : ''}
      <div class="modal-body"></div>
      ${actions.length ? html`<footer class="modal-foot"></footer>` : ''}
    </div>`);
  const bodyEl = wrap.querySelector('.modal-body');
  if (typeof body === 'string' || (body && body.toString && !(body instanceof Node))) bodyEl.innerHTML = String(body || '');
  else if (body instanceof Node) bodyEl.appendChild(body);

  const close = (value) => {
    wrap.classList.add('out');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => wrap.remove(), 180);
    if (onClose) onClose(value);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && dismissable) close(null);
  };
  document.addEventListener('keydown', onKey);

  const foot = wrap.querySelector('.modal-foot');
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.className = `btn ${a.variant || ''}`;
    b.textContent = a.label;
    b.type = 'button';
    b.addEventListener('click', async () => {
      if (a.onClick) {
        const r = await a.onClick(close, b);
        if (r === false) return;
      }
      if (!a.keepOpen) close(a.value ?? a.label);
    });
    foot.appendChild(b);
  });

  if (dismissable) {
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap) close(null);
    });
    on(wrap, 'click', '[data-close]', () => close(null));
  }
  document.body.appendChild(wrap);
  requestAnimationFrame(() => {
    const focusable = wrap.querySelector('input, select, textarea, .modal-foot .btn');
    if (focusable) focusable.focus();
  });
  return { el: wrap, body: bodyEl, close };
}

export function confirmDialog({ title, message, confirm = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    modal({
      title,
      body: `<p>${esc(message)}</p>`,
      onClose: (v) => resolve(v === true),
      actions: [
        { label: 'Cancelar', variant: 'ghost', value: false },
        { label: confirm, variant: danger ? 'danger' : 'primary', value: true },
      ],
    });
  });
}

// ---------- Controle de volume ----------
export function volumeControl() {
  const { volume, muted } = getVolume();
  return html`
    <div class="volume" data-volume>
      <button class="icon-btn" data-mute aria-label="${muted ? 'Ligar som' : 'Desligar som'}" title="Som">${muted || volume === 0 ? '🔇' : '🔊'}</button>
      <input type="range" min="0" max="100" value="${Math.round((muted ? 0 : volume) * 100)}" aria-label="Volume" data-volume-range />
    </div>`;
}

export function bindVolume(root) {
  on(root, 'click', '[data-mute]', (_e, btn) => {
    const m = toggleMute();
    btn.textContent = m ? '🔇' : '🔊';
    btn.setAttribute('aria-label', m ? 'Ligar som' : 'Desligar som');
    const range = btn.parentElement.querySelector('[data-volume-range]');
    if (range) range.value = m ? 0 : Math.round(getVolume().volume * 100);
    if (!m) sfx.click();
  });
  on(root, 'input', '[data-volume-range]', (_e, input) => {
    setVolume(Number(input.value) / 100);
    const btn = input.parentElement.querySelector('[data-mute]');
    if (btn) btn.textContent = Number(input.value) === 0 ? '🔇' : '🔊';
  });
  on(root, 'change', '[data-volume-range]', () => sfx.click());
}

export function loadingBlock(text = 'Carregando...') {
  return html`<div class="loading"><div class="spinner" aria-hidden="true"></div><p>${text}</p></div>`;
}

export function errorBlock(message, retryLabel) {
  return html`<div class="empty-state"><p class="big-emoji" aria-hidden="true">😵</p><p>${message}</p>${
    retryLabel ? html`<button class="btn" data-retry>${retryLabel}</button>` : ''
  }</div>`;
}
