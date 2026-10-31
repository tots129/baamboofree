'use strict';
/**
 * Gera a pista do Spud Game.
 * Tipos de casa: start, finish, normal, star (roleta), danger (vermelha), gift (power-up).
 */
function generateBoard(length, { eventsEnabled, powerupsEnabled, rng = Math.random }) {
  const L = Math.max(12, Math.min(60, length));
  const tiles = Array.from({ length: L }, () => 'normal');
  tiles[0] = 'start';
  tiles[L - 1] = 'finish';

  // Casas onde especiais podem aparecer (longe da largada e da chegada).
  const candidates = [];
  for (let i = 2; i <= L - 3; i++) candidates.push(i);

  const want = {
    star: eventsEnabled ? Math.round(L * 0.16) : 0,
    danger: Math.round(L * 0.13),
    gift: powerupsEnabled ? Math.round(L * 0.1) : 0,
  };

  // Distribui de forma espaçada: percorre posições embaralhadas respeitando vizinhança.
  const order = candidates.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const sequence = [];
  const kinds = ['danger', 'star', 'gift'];
  let k = 0;
  while (sequence.length < want.star + want.danger + want.gift) {
    const kind = kinds[k % 3];
    k++;
    if (sequence.filter((s) => s === kind).length < want[kind]) sequence.push(kind);
    if (k > 1000) break;
  }

  for (const kind of sequence) {
    const idx = order.findIndex((pos) => {
      if (tiles[pos] !== 'normal') return false;
      // Evita duas casas especiais coladas.
      return tiles[pos - 1] === 'normal' || tiles[pos - 1] === 'start'
        ? tiles[pos + 1] === 'normal' || tiles[pos + 1] === 'finish'
        : false;
    });
    if (idx === -1) break;
    tiles[order[idx]] = kind;
    order.splice(idx, 1);
  }
  return tiles;
}

module.exports = { generateBoard };
