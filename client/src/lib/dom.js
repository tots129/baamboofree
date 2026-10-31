// Pequenos utilitários de DOM — sem framework, para manter o app leve no celular.

export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Template literal que escapa automaticamente os valores interpolados. Use raw() para HTML confiável. */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += toHtml(values[i]);
  });
  return new Raw(out);
}

class Raw {
  constructor(v) {
    this.v = v;
  }
  toString() {
    return this.v;
  }
}

export function raw(v) {
  return new Raw(v == null ? '' : String(v));
}

function toHtml(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.v;
  if (Array.isArray(v)) return v.map(toHtml).join('');
  return esc(v);
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function $$(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function setHTML(el, content) {
  el.innerHTML = String(content);
  return el;
}

/** Delegação de eventos: on(root, 'click', '[data-action]', (ev, el) => ...) */
export function on(root, type, selector, handler) {
  const fn = (ev) => {
    const el = ev.target.closest(selector);
    if (el && root.contains(el)) handler(ev, el);
  };
  root.addEventListener(type, fn);
  return () => root.removeEventListener(type, fn);
}

export function debounce(fn, ms) {
  let t;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  d.flush = (...args) => {
    clearTimeout(t);
    return fn(...args);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function imageUrl(id) {
  return id ? `/api/images/${id}` : '';
}

export function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'agora mesmo';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `há ${Math.floor(diff / 86400)} dia${diff >= 172800 ? 's' : ''}`;
  return date.toLocaleDateString('pt-BR');
}
