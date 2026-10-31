// Animações sobrepostas ao tabuleiro: dado, roleta e avisos.
import constants from '../../../shared/constants.js';
import { esc, sleep, prefersReducedMotion } from '../lib/dom.js';
import { sfx } from '../lib/sound.js';

const { SPUD_EVENTS, POWERUPS } = constants;
export { SPUD_EVENTS, POWERUPS };

const PIPS = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [26, 26],
    [50, 50],
    [74, 74],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [26, 26],
    [74, 26],
    [50, 50],
    [26, 74],
    [74, 74],
  ],
  6: [
    [28, 24],
    [72, 24],
    [28, 50],
    [72, 50],
    [28, 76],
    [72, 76],
  ],
};

function diceFace(n) {
  return `<svg viewBox="0 0 100 100" width="100%" height="100%"><rect x="4" y="4" width="92" height="92" rx="20" fill="#fff" stroke="#1A1240" stroke-width="6"/>${PIPS[n]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#1A1240"/>`)
    .join('')}</svg>`;
}

function layer(host) {
  let el = host.querySelector('.fx-layer');
  if (!el) {
    el = document.createElement('div');
    el.className = 'fx-layer';
    host.appendChild(el);
  }
  return el;
}

export async function showDice(host, value, who) {
  const fx = layer(host);
  const box = document.createElement('div');
  box.className = 'fx-card dice-card';
  box.innerHTML = `<div class="dice" aria-label="Dado: ${value}">${diceFace(1)}</div><p>${esc(who)} rolou o dado</p>`;
  fx.appendChild(box);
  const die = box.querySelector('.dice');
  sfx.dice();
  if (!prefersReducedMotion()) {
    for (let i = 0; i < 9; i++) {
      die.innerHTML = diceFace(1 + Math.floor(Math.random() * 6));
      await sleep(70);
    }
  }
  die.innerHTML = diceFace(value);
  die.classList.add('landed');
  box.querySelector('p').textContent = `${who} tirou ${value}!`;
  await sleep(900);
  box.classList.add('out');
  await sleep(250);
  box.remove();
}

/** Roleta animada que para no evento sorteado pelo servidor. */
export async function showRoulette(host, options, event, who) {
  const fx = layer(host);
  const box = document.createElement('div');
  box.className = 'fx-card roulette-card';
  const n = options.length;
  const seg = 360 / n;
  const colors = ['#FFB627', '#FF5D8F', '#3DDC97', '#4CC9F0', '#9B5DE5', '#FF7B39'];
  const slices = options
    .map((key, i) => {
      const a0 = ((i * seg - 90) * Math.PI) / 180;
      const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
      const x0 = 100 + 92 * Math.cos(a0);
      const y0 = 100 + 92 * Math.sin(a0);
      const x1 = 100 + 92 * Math.cos(a1);
      const y1 = 100 + 92 * Math.sin(a1);
      const mid = (((i + 0.5) * seg - 90) * Math.PI) / 180;
      const tx = 100 + 60 * Math.cos(mid);
      const ty = 100 + 60 * Math.sin(mid);
      const large = seg > 180 ? 1 : 0;
      const path = n === 1 ? `<circle cx="100" cy="100" r="92" fill="${colors[0]}"/>` : `<path d="M100 100 L${x0} ${y0} A92 92 0 ${large} 1 ${x1} ${y1} Z" fill="${colors[i % colors.length]}" stroke="#1A1240" stroke-width="3"/>`;
      return `${path}<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central" font-size="26" transform="rotate(${(i + 0.5) * seg} ${tx} ${ty})">${SPUD_EVENTS[key].icon}</text>`;
    })
    .join('');
  box.innerHTML = `
    <p class="roulette-who">${esc(who)} gira a roleta!</p>
    <div class="roulette">
      <div class="roulette-pointer" aria-hidden="true"></div>
      <svg class="wheel" viewBox="0 0 200 200" width="100%" height="100%">${slices}<circle cx="100" cy="100" r="92" fill="none" stroke="#1A1240" stroke-width="6"/><circle cx="100" cy="100" r="14" fill="#fff" stroke="#1A1240" stroke-width="5"/></svg>
    </div>
    <p class="roulette-result" aria-live="polite">&nbsp;</p>`;
  fx.appendChild(box);
  const wheel = box.querySelector('.wheel');
  const idx = Math.max(0, options.indexOf(event));
  // O ponteiro fica no topo: girar para que o centro da fatia escolhida pare lá.
  const target = 360 * 5 + (360 - (idx + 0.5) * seg) + (Math.random() - 0.5) * seg * 0.5;
  const duration = prefersReducedMotion() ? 200 : 2600;
  wheel.style.transition = `transform ${duration}ms cubic-bezier(.12,.67,.2,1)`;
  requestAnimationFrame(() => (wheel.style.transform = `rotate(${target}deg)`));
  if (!prefersReducedMotion()) {
    let t = 0;
    let gap = 50;
    while (t < duration - 200) {
      sfx.rouletteTick();
      await sleep(gap);
      t += gap;
      gap = Math.min(260, gap * 1.09);
    }
  }
  await sleep(Math.max(0, 250));
  const ev = SPUD_EVENTS[event];
  box.querySelector('.roulette-result').textContent = `${ev.icon} ${ev.label}!`;
  box.classList.add('done');
  sfx.reveal();
  await sleep(1300);
  box.classList.add('out');
  await sleep(250);
  box.remove();
}

export async function showBanner(host, text, kind = 'info', ms = 1500) {
  const fx = layer(host);
  const b = document.createElement('div');
  b.className = `fx-banner fx-${kind}`;
  b.textContent = text;
  fx.appendChild(b);
  await sleep(prefersReducedMotion() ? Math.min(ms, 900) : ms);
  b.classList.add('out');
  await sleep(250);
  b.remove();
}

export function confetti(host, count = 80) {
  if (prefersReducedMotion()) return;
  const fx = layer(host);
  const colors = ['#FFB627', '#FF5D8F', '#3DDC97', '#4CC9F0', '#9B5DE5', '#FF7B39'];
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  for (let i = 0; i < count; i++) {
    const s = document.createElement('i');
    s.style.left = `${Math.random() * 100}%`;
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = `${Math.random() * 0.6}s`;
    s.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
    s.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    wrap.appendChild(s);
  }
  fx.appendChild(wrap);
  setTimeout(() => wrap.remove(), 3800);
}
