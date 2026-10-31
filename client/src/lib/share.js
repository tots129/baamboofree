import { html, raw, on } from './dom.js';
import { modal, toast } from './ui.js';
import { api } from './api.js';

export function shareUrl(code) {
  return `${location.origin}/compartilhado/${code}`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** Janela de compartilhamento. onChange(gameSummary) é chamado ao ligar/desligar. */
export function openShare(game, onChange) {
  let state = { isShared: game.isShared, shareCode: game.shareCode };
  const m = modal({ title: 'Compartilhar jogo', body: '' });

  function draw() {
    m.body.innerHTML = String(html`
      <div class="share">
        <label class="switch-row">
          <input type="checkbox" data-toggle ${state.isShared ? raw('checked') : ''} />
          <span class="switch" aria-hidden="true"></span>
          <span><strong>Link público ${state.isShared ? 'ativo' : 'desligado'}</strong>
            <small>Quem tiver o link pode ver as perguntas e salvar uma cópia na própria biblioteca. Seu jogo original continua só seu.</small></span>
        </label>
        ${state.isShared
          ? html`<div class="copy-row">
              <input readonly value="${shareUrl(state.shareCode)}" aria-label="Link do jogo" />
              <button class="btn primary" data-copy>Copiar link</button>
            </div>`
          : ''}
      </div>`);
  }
  draw();

  on(m.body, 'change', '[data-toggle]', async (_e, input) => {
    input.disabled = true;
    try {
      const { game: g } = await api.post(`/api/games/${game.id}/share`, { shared: input.checked });
      state = { isShared: g.isShared, shareCode: g.shareCode };
      if (onChange) onChange(g);
      toast(g.isShared ? 'Link de compartilhamento ativado.' : 'Link desativado.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
    draw();
  });
  on(m.body, 'click', '[data-copy]', async () => {
    if (await copyText(shareUrl(state.shareCode))) toast('Link copiado!', 'success');
  });
}
