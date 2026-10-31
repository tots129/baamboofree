import { html, on, imageUrl } from './dom.js';
import { modal } from './ui.js';

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Visualizar o jogo antes de iniciar: passa pelas perguntas como na tela da partida. */
export function openPreview(game) {
  const questions = (game.questions || []).filter((q) => q.text || q.image);
  let i = 0;
  let showAnswer = false;
  const m = modal({ title: `Visualizar: ${game.title}`, body: '', wide: true });

  function draw() {
    if (!questions.length) {
      m.body.innerHTML = '<div class="empty-state"><p>Este jogo ainda não tem perguntas.</p></div>';
      return;
    }
    const q = questions[i];
    m.body.innerHTML = String(html`
      <div class="preview">
        <div class="preview-bar">
          <span>Pergunta ${i + 1} de ${questions.length}</span>
          <span>${q.points} pts${q.time ? ` · ${q.time}s` : ''}</span>
          ${q.ready ? '' : html`<span class="badge warn">Incompleta — não aparece no jogo</span>`}
        </div>
        <div class="q-card">
          ${q.image ? html`<img class="q-image" src="${imageUrl(q.image)}" alt="" />` : ''}
          <h3 class="q-text">${q.text}</h3>
        </div>
        ${q.type === 'multiple'
          ? html`<div class="options-grid n${q.options.filter((o) => o.text).length}">${q.options
              .filter((o) => o.text)
              .map(
                (o, idx) =>
                  html`<div class="opt opt-${idx} ${showAnswer ? (o.id === q.correct ? 'is-correct' : 'is-dim') : ''}"><span class="opt-letter">${OPTION_LETTERS[idx]}</span><span>${o.text}</span></div>`
              )}</div>`
          : html`<div class="open-answer ${showAnswer ? 'revealed' : ''}">${showAnswer ? `Resposta: ${q.answers.join(' / ') || '—'}` : 'Resposta aberta: os participantes digitam a resposta.'}</div>`}
        <div class="preview-nav">
          <button class="btn" data-prev ${i === 0 ? 'disabled' : ''}>Anterior</button>
          <button class="btn secondary" data-toggle-answer>${showAnswer ? 'Esconder resposta' : 'Mostrar resposta'}</button>
          <button class="btn" data-next ${i === questions.length - 1 ? 'disabled' : ''}>Próxima</button>
        </div>
      </div>`);
  }
  draw();
  on(m.body, 'click', '[data-prev]', () => {
    i = Math.max(0, i - 1);
    showAnswer = false;
    draw();
  });
  on(m.body, 'click', '[data-next]', () => {
    i = Math.min(questions.length - 1, i + 1);
    showAnswer = false;
    draw();
  });
  on(m.body, 'click', '[data-toggle-answer]', () => {
    showAnswer = !showAnswer;
    draw();
  });
}
