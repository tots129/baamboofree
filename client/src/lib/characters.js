// Personagens originais do Jogaê!, desenhados em SVG e coloridos por jogador/equipe.
import constants from '../../../shared/constants.js';

export const { CHARACTERS, COLORS } = constants;

const INK = '#1A1240';

export function shade(hex, amount) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const f = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  r = Math.round((f - r) * p + r);
  g = Math.round((f - g) * p + g);
  b = Math.round((f - b) * p + b);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function face(cx, cy, s = 1, mood = 'happy') {
  const ex = 11 * s;
  const ey = 0;
  const eye = (x) => `
    <ellipse cx="${x}" cy="${cy + ey}" rx="${6.5 * s}" ry="${7.5 * s}" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
    <circle class="pupil" cx="${x + 1.2 * s}" cy="${cy + ey + 1 * s}" r="${3.4 * s}" fill="${INK}"/>
    <circle cx="${x + 2.4 * s}" cy="${cy + ey - 1.2 * s}" r="${1.2 * s}" fill="#fff"/>`;
  const mouth =
    mood === 'sad'
      ? `<path d="M${cx - 6 * s} ${cy + 15 * s} q${6 * s} ${-6 * s} ${12 * s} 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`
      : `<path d="M${cx - 7 * s} ${cy + 10 * s} q${7 * s} ${9 * s} ${14 * s} 0 z" fill="${INK}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
         <path d="M${cx - 3.5 * s} ${cy + 14.2 * s} q${3.5 * s} ${2.6 * s} ${7 * s} 0" fill="#FF7A9C"/>`;
  return `
    <g class="face">
      ${eye(cx - ex)}${eye(cx + ex)}
      <ellipse cx="${cx - 19 * s}" cy="${cy + 9 * s}" rx="${4.5 * s}" ry="${2.8 * s}" fill="#FF7A9C" opacity=".55"/>
      <ellipse cx="${cx + 19 * s}" cy="${cy + 9 * s}" rx="${4.5 * s}" ry="${2.8 * s}" fill="#FF7A9C" opacity=".55"/>
      ${mouth}
    </g>`;
}

function feet(color, y = 92) {
  const d = shade(color, -0.35);
  return `<ellipse cx="36" cy="${y}" rx="11" ry="6" fill="${d}" stroke="${INK}" stroke-width="3"/>
          <ellipse cx="64" cy="${y}" rx="11" ry="6" fill="${d}" stroke="${INK}" stroke-width="3"/>`;
}

const BODIES = {
  // Batata: forma irregular com pintinhas
  tuca: (c, mood) => `
    ${feet(c)}
    <path d="M50 10 C76 8 92 30 90 55 C88 80 72 92 50 91 C26 90 10 78 11 54 C12 28 26 12 50 10 Z" fill="${c}" stroke="${INK}" stroke-width="4"/>
    <path d="M24 30 C30 20 40 16 50 15" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".45"/>
    <circle cx="70" cy="28" r="3" fill="${shade(c, -0.3)}"/><circle cx="27" cy="70" r="2.6" fill="${shade(c, -0.3)}"/>
    <circle cx="76" cy="72" r="2.2" fill="${shade(c, -0.3)}"/>
    ${face(50, 48, 1, mood)}`,

  // Bolinha com broto
  bolota: (c, mood) => `
    ${feet(c)}
    <path d="M50 16 C50 8 56 2 64 2 C62 10 57 14 50 16 Z" fill="#3DDC97" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M50 16 C48 9 42 5 35 6 C38 13 44 16 50 16 Z" fill="#2BB57A" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="50" cy="54" r="38" fill="${c}" stroke="${INK}" stroke-width="4"/>
    <path d="M24 40 C28 30 36 24 46 22" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".45"/>
    ${face(50, 52, 1, mood)}`,

  // Gotinha
  pingo: (c, mood) => `
    ${feet(c)}
    <path d="M50 4 C62 24 88 42 88 62 C88 82 72 92 50 92 C28 92 12 82 12 62 C12 42 38 24 50 4 Z" fill="${c}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M30 52 C30 42 36 34 42 28" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".5"/>
    ${face(50, 60, 1, mood)}`,

  // Cubinho com antena
  zeze: (c, mood) => `
    ${feet(c)}
    <line x1="50" y1="18" x2="50" y2="4" stroke="${INK}" stroke-width="3"/>
    <circle cx="50" cy="4" r="5" fill="#FF5D8F" stroke="${INK}" stroke-width="3"/>
    <rect x="12" y="18" width="76" height="72" rx="18" fill="${c}" stroke="${INK}" stroke-width="4"/>
    <rect x="20" y="26" width="18" height="6" rx="3" fill="#fff" opacity=".45"/>
    ${face(50, 50, 1, mood)}`,

  // Ovinho de chapéu
  nino: (c, mood) => `
    ${feet(c)}
    <path d="M50 12 C74 12 88 46 88 64 C88 82 72 92 50 92 C28 92 12 82 12 64 C12 46 26 12 50 12 Z" fill="${c}" stroke="${INK}" stroke-width="4"/>
    <ellipse cx="50" cy="16" rx="26" ry="6" fill="${INK}"/>
    <path d="M34 15 C34 2 66 2 66 15 Z" fill="${INK}"/>
    <rect x="34" y="9" width="32" height="4" fill="#FF5D8F"/>
    ${face(50, 56, 1, mood)}`,

  // Cogumelo: chapéu colorido com bolinhas
  lulu: (c, mood) => `
    ${feet('#F3D9B1')}
    <path d="M28 50 L28 82 C28 90 72 90 72 82 L72 50 Z" fill="#FFE8C7" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M6 52 C6 22 28 6 50 6 C72 6 94 22 94 52 C94 58 6 58 6 52 Z" fill="${c}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="30" cy="30" r="7" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
    <circle cx="58" cy="20" r="6" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
    <circle cx="76" cy="40" r="5" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
    ${face(50, 64, 0.8, mood)}`,

  // Dino com espinhos
  rex: (c, mood) => `
    ${feet(c)}
    <path d="M30 18 L36 4 L44 16 L52 2 L60 16 L68 6 L72 20 Z" fill="${shade(c, -0.3)}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M16 56 C16 30 30 14 52 14 C74 14 88 30 88 56 C88 80 74 92 52 92 C30 92 16 80 16 56 Z" fill="${c}" stroke="${INK}" stroke-width="4"/>
    <path d="M30 76 L36 70 L42 76 L48 70 L54 76 L60 70 L66 76" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
    ${face(52, 46, 1, mood)}`,

  // Nuvem fofinha
  fafa: (c, mood) => `
    ${feet(c)}
    <path d="M26 88 C10 88 4 74 10 64 C2 56 6 40 20 38 C20 22 36 12 50 18 C60 6 82 10 84 28 C98 32 100 52 90 60 C98 72 88 88 74 88 Z" fill="${c}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M24 46 C28 38 34 34 40 33" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".5"/>
    ${face(50, 54, 1, mood)}`,
};

/**
 * SVG do personagem.
 * @param {string} id   id do personagem
 * @param {string} color cor principal
 * @param {object} opts { size, mood: 'happy'|'sad', className }
 */
export function characterSVG(id, color = COLORS[0], opts = {}) {
  const body = BODIES[id] || BODIES.tuca;
  const size = opts.size || 64;
  const cls = opts.className ? ` class="${opts.className}"` : '';
  return `<svg${cls} width="${size}" height="${size}" viewBox="-4 -4 108 108" role="img" aria-label="${characterName(id)}" xmlns="http://www.w3.org/2000/svg">${body(
    color,
    opts.mood || 'happy'
  )}</svg>`;
}

export function characterName(id) {
  const c = CHARACTERS.find((x) => x.id === id);
  return c ? c.name : 'Personagem';
}
