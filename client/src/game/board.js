// Tabuleiro do Spud Game: desenha a pista em zigue-zague e anima os personagens.
import { characterSVG } from '../lib/characters.js';
import { esc, sleep, prefersReducedMotion } from '../lib/dom.js';
import { sfx } from '../lib/sound.js';

const TILE_LABEL = {
  start: 'Largada',
  finish: 'Chegada',
  star: 'Roleta',
  danger: 'Perigo',
  gift: 'Poder',
  normal: '',
};
const TILE_ICON = { start: '🚩', finish: '🏁', star: '★', danger: '!', gift: '🎁', normal: '' };

export class Board {
  constructor(container, tiles) {
    this.el = container;
    this.tiles = tiles;
    this.pieces = new Map(); // competitorId -> element
    this.positions = {};
    this.cols = tiles.length <= 20 ? 7 : 10;
    this.render();
    this.onResize = () => this.layoutPieces(false);
    window.addEventListener('resize', this.onResize);
    if (window.ResizeObserver) {
      this.ro = new ResizeObserver(() => this.layoutPieces(false));
      this.ro.observe(this.el);
    }
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    if (this.ro) this.ro.disconnect();
  }

  cell(i) {
    const r = Math.floor(i / this.cols);
    const c = r % 2 === 0 ? i % this.cols : this.cols - 1 - (i % this.cols);
    return { r, c };
  }

  render() {
    const rows = Math.ceil(this.tiles.length / this.cols);
    const parts = this.tiles.map((t, i) => {
      const { r, c } = this.cell(i);
      const next = i < this.tiles.length - 1 ? this.cell(i + 1) : null;
      const dir = next ? (next.r !== r ? 'down' : next.c > c ? 'right' : 'left') : 'none';
      return `<div class="tile tile-${t} dir-${dir}" data-tile="${i}" style="grid-row:${r + 1};grid-column:${c + 1}" title="${esc(
        TILE_LABEL[t] || `Casa ${i}`
      )}">
        <span class="tile-num">${i === 0 || i === this.tiles.length - 1 ? '' : i}</span>
        <span class="tile-icon">${TILE_ICON[t]}</span>
      </div>`;
    });
    this.el.innerHTML = `<div class="track" style="--cols:${this.cols};--rows:${rows}">${parts.join('')}</div><div class="pieces"></div>`;
    this.track = this.el.querySelector('.track');
    this.layer = this.el.querySelector('.pieces');
  }

  /** competitors: [{id, name, character, color, shield, skip}] */
  syncPieces(competitors) {
    const ids = new Set(competitors.map((c) => c.id));
    for (const [id, el] of this.pieces) {
      if (!ids.has(id)) {
        el.remove();
        this.pieces.delete(id);
      }
    }
    competitors.forEach((c) => {
      let el = this.pieces.get(c.id);
      const key = `${c.character}|${c.color}`;
      if (!el) {
        el = document.createElement('div');
        el.className = 'piece';
        el.dataset.id = c.id;
        this.layer.appendChild(el);
        this.pieces.set(c.id, el);
      }
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.innerHTML = `<div class="piece-inner">${characterSVG(c.character, c.color, { size: 64 })}</div><span class="piece-name">${esc(c.name)}</span>`;
      }
      el.classList.toggle('has-shield', !!c.shield);
      el.classList.toggle('is-skipping', c.skip > 0);
      el.style.setProperty('--c', c.color);
      if (this.positions[c.id] === undefined) this.positions[c.id] = c.position || 0;
    });
  }

  tileCenter(i) {
    const tile = this.track.querySelector(`[data-tile="${Math.max(0, Math.min(this.tiles.length - 1, i))}"]`);
    if (!tile) return { x: 0, y: 0, w: 40 };
    const base = this.el.getBoundingClientRect();
    const r = tile.getBoundingClientRect();
    return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2, w: r.width };
  }

  setPositions(positions, animate = true) {
    Object.assign(this.positions, positions);
    this.layoutPieces(animate);
  }

  /** Posiciona todas as peças; várias na mesma casa ficam agrupadas. */
  layoutPieces(animate = true) {
    if (!this.track) return;
    const groups = new Map();
    for (const [id] of this.pieces) {
      const p = this.positions[id] || 0;
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p).push(id);
    }
    const offsets = [
      [[0, 0]],
      [
        [-0.2, 0],
        [0.2, 0],
      ],
      [
        [-0.22, -0.12],
        [0.22, -0.12],
        [0, 0.16],
      ],
      [
        [-0.2, -0.16],
        [0.2, -0.16],
        [-0.2, 0.16],
        [0.2, 0.16],
      ],
    ];
    for (const [pos, ids] of groups) {
      const { x, y, w } = this.tileCenter(pos);
      const n = ids.length;
      const set = offsets[Math.min(n, 4) - 1];
      const scale = n === 1 ? 1 : n === 2 ? 0.8 : 0.66;
      ids.forEach((id, k) => {
        const el = this.pieces.get(id);
        const [ox, oy] = n <= 4 ? set[k] : [((k % 3) - 1) * 0.24, (Math.floor(k / 3) - 1) * 0.2];
        const size = Math.min(w * 0.9, 70) * (n <= 4 ? scale : 0.5);
        el.style.setProperty('--size', `${size}px`);
        el.classList.toggle('no-anim', !animate);
        el.style.transform = `translate(${x + ox * w - size / 2}px, ${y + oy * w - size * 0.62}px)`;
        el.style.zIndex = String(10 + Math.round(y));
      });
    }
  }

  piece(id) {
    return this.pieces.get(id);
  }

  flash(id, cls, ms = 900) {
    const el = this.pieces.get(id);
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  highlightTile(i, cls = 'pulse') {
    const t = this.track.querySelector(`[data-tile="${i}"]`);
    if (!t) return;
    t.classList.remove(cls);
    void t.offsetWidth;
    t.classList.add(cls);
    setTimeout(() => t.classList.remove(cls), 1200);
  }

  setActive(ids) {
    for (const [id, el] of this.pieces) el.classList.toggle('is-active', ids.includes(id));
  }

  /** Anda casa por casa, com pulinhos. */
  async walk(id, from, to) {
    const reduced = prefersReducedMotion();
    const dir = to >= from ? 1 : -1;
    if (reduced || Math.abs(to - from) > 12) {
      this.positions[id] = to;
      this.layoutPieces(true);
      await sleep(350);
      return;
    }
    for (let p = from; p !== to; p += dir) {
      this.positions[id] = p + dir;
      this.layoutPieces(true);
      this.flash(id, 'hop', 260);
      sfx.hop();
      await sleep(240);
    }
    await sleep(120);
  }
}
