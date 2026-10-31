import constants from '../../../shared/constants.js';
import { html, raw, imageUrl } from './dom.js';

export const SUBJECTS = constants.SUBJECTS;

const STYLE = {
  Geral: { icon: '💡', color: '#FFB627' },
  Matemática: { icon: '➗', color: '#4CC9F0' },
  Português: { icon: '📝', color: '#FF5D8F' },
  Ciências: { icon: '🔬', color: '#3DDC97' },
  História: { icon: '🏛️', color: '#FF7B39' },
  Geografia: { icon: '🌎', color: '#00BBF9' },
  Inglês: { icon: '💬', color: '#9B5DE5' },
  Artes: { icon: '🎨', color: '#F15BB5' },
  'Educação Física': { icon: '⚽', color: '#C5E063' },
  Outros: { icon: '✨', color: '#FFB627' },
};

export function subjectStyle(s) {
  return STYLE[s] || STYLE.Geral;
}

/** Capa do jogo: imagem enviada ou ilustração gerada pela matéria. */
export function coverArt(game, className = 'cover') {
  const st = subjectStyle(game.subject);
  if (game.coverImage) {
    return html`<div class="${className}" style="--c:${st.color}"><img src="${imageUrl(game.coverImage)}" alt="" loading="lazy" /></div>`;
  }
  return html`<div class="${className} cover-art" style="--c:${st.color}" aria-hidden="true">
    <span class="cover-icon">${raw(st.icon)}</span>
    <span class="cover-dots"></span>
  </div>`;
}
