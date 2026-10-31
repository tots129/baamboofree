import { html, raw, on, debounce, imageUrl, $ } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { toast, confirmDialog, loadingBlock, errorBlock } from '../lib/ui.js';
import { navigate } from '../lib/nav.js';
import { SUBJECTS, coverArt } from '../lib/subjects.js';
import { uploadImage, pickFile } from '../lib/image.js';
import { openHostSetup } from '../lib/hostSetup.js';
import { openShare } from '../lib/share.js';
import { openPreview, OPTION_LETTERS } from '../lib/preview.js';

const rid = () => Math.random().toString(36).slice(2, 10);

function isReady(q) {
  if (!q.text.trim() && !q.image) return false;
  if (q.type === 'multiple') {
    const filled = q.options.filter((o) => o.text.trim());
    return filled.length >= 2 && filled.some((o) => o.id === q.correct);
  }
  return q.answers.some((a) => a.trim());
}

function newQuestion(type, settings) {
  const opts = Array.from({ length: 4 }, () => ({ id: rid(), text: '' }));
  return {
    id: rid(),
    type,
    text: '',
    image: null,
    points: settings.defaultPoints || 10,
    time: null,
    options: type === 'multiple' ? opts : [],
    correct: null,
    answers: type === 'open' ? [''] : [],
  };
}

export function render(root, { id }) {
  let game = null;
  let selected = 0;
  let saveState = 'saved'; // saved | dirty | saving | error
  let saving = false;
  let pending = false;
  let dragFrom = null;

  root.innerHTML = String(loadingBlock('Abrindo o criador...'));

  // ---------------- salvamento automático ----------------
  async function save() {
    if (!game) return;
    if (saving) {
      pending = true;
      return;
    }
    saving = true;
    pending = false;
    setSaveState('saving');
    try {
      const payload = {
        title: game.title,
        description: game.description,
        subject: game.subject,
        cover_image: game.coverImage,
        settings: game.settings,
        questions: game.questions.map(({ ready, ...q }) => q),
      };
      const res = await api.put(`/api/games/${game.id}`, payload);
      game.updatedAt = res.game.updatedAt;
      game.readyCount = res.game.readyCount;
      setSaveState(pending ? 'dirty' : 'saved');
    } catch (err) {
      setSaveState('error', err.message);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => saveDebounced(), 4000);
    }
    saving = false;
    if (pending) save();
  }
  let retryTimer = null;
  const saveDebounced = debounce(save, 700);

  function changed() {
    setSaveState('dirty');
    saveDebounced();
  }

  function setSaveState(s, msg) {
    saveState = s;
    const el = $('[data-save-state]', root);
    if (!el) return;
    el.className = `save-state ${s}`;
    el.textContent =
      s === 'saving' ? 'Salvando...' : s === 'dirty' ? 'Alterações não salvas' : s === 'error' ? `Erro ao salvar — tentando de novo` : 'Tudo salvo';
    if (msg) el.title = msg;
  }

  const beforeUnload = (e) => {
    if (saveState !== 'saved') {
      saveDebounced.flush();
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', beforeUnload);

  // ---------------- desenho ----------------
  function drawAll() {
    root.innerHTML = String(html`
      <div class="editor">
        <header class="editor-top">
          <a href="/biblioteca" class="back-link">← Biblioteca</a>
          <input class="title-input" data-field="title" value="${game.title}" maxlength="120" aria-label="Título do jogo" placeholder="Título do jogo" />
          <span class="save-state saved" data-save-state aria-live="polite">Tudo salvo</span>
          <div class="editor-actions">
            <button class="btn small" data-preview>Visualizar</button>
            <button class="btn small" data-share>Compartilhar</button>
            <button class="btn small" data-duplicate>Duplicar</button>
            <button class="btn primary" data-play>Jogar</button>
          </div>
        </header>
        <div class="editor-grid">
          <aside class="editor-side">
            <details class="panel game-details" ${game.questions.length === 0 ? raw('open') : ''}>
              <summary>Detalhes do jogo</summary>
              <div class="details-body">
                <div class="cover-edit">
                  ${coverArt(game, 'cover')}
                  <div class="cover-buttons">
                    <button class="btn small" data-cover>${game.coverImage ? 'Trocar capa' : 'Adicionar capa'}</button>
                    ${game.coverImage ? html`<button class="btn small ghost" data-cover-remove>Remover</button>` : ''}
                  </div>
                </div>
                <label class="field"><span>Descrição</span><textarea data-field="description" rows="3" maxlength="600" placeholder="Sobre o que é este jogo?">${game.description}</textarea></label>
                <label class="field"><span>Matéria</span><select data-field="subject">${SUBJECTS.map((s) => html`<option ${s === game.subject ? raw('selected') : ''}>${s}</option>`)}</select></label>
                <div class="grid-2">
                  <label class="field"><span>Pontos por pergunta</span><input type="number" min="0" max="1000" data-setting="defaultPoints" value="${game.settings.defaultPoints ?? 10}" /></label>
                  <label class="field"><span>Tempo padrão (s)</span><input type="number" min="0" max="300" data-setting="defaultTime" value="${game.settings.defaultTime ?? 20}" /><small class="hint">0 = sem limite</small></label>
                </div>
                <button class="btn small ghost" data-apply-points>Aplicar pontuação a todas as perguntas</button>
              </div>
            </details>
            <div class="panel">
              <div class="list-head"><h2>Perguntas <span class="count" data-count></span></h2></div>
              <ol class="q-list" data-qlist></ol>
              <div class="add-row">
                <button class="btn small secondary" data-add="multiple">+ Múltipla escolha</button>
                <button class="btn small secondary" data-add="open">+ Resposta aberta</button>
              </div>
            </div>
          </aside>
          <section class="editor-main panel" data-qeditor></section>
        </div>
      </div>`);
    drawList();
    drawEditor();
    setSaveState(saveState);
  }

  function drawList() {
    const list = $('[data-qlist]', root);
    if (!list) return;
    const ready = game.questions.filter(isReady).length;
    $('[data-count]', root).textContent = `${ready}/${game.questions.length} prontas`;
    list.innerHTML = String(
      html`${game.questions.map(
        (q, i) => html`
          <li class="q-item ${i === selected ? 'selected' : ''} ${isReady(q) ? 'ready' : 'draft'}" draggable="true" data-index="${i}">
            <span class="drag" aria-hidden="true" title="Arraste para reorganizar">⋮⋮</span>
            <button class="q-item-main" data-select="${i}">
              <span class="q-num">${i + 1}</span>
              <span class="q-excerpt">${q.text.trim() || (q.image ? '(pergunta com imagem)' : 'Pergunta sem texto')}</span>
              <span class="q-status" title="${isReady(q) ? 'Pronta' : 'Incompleta'}">${isReady(q) ? '✓' : '•'}</span>
            </button>
            <span class="q-move">
              <button class="icon-btn tiny" data-move="${i}" data-dir="-1" aria-label="Mover para cima" ${i === 0 ? raw('disabled') : ''}>▲</button>
              <button class="icon-btn tiny" data-move="${i}" data-dir="1" aria-label="Mover para baixo" ${i === game.questions.length - 1 ? raw('disabled') : ''}>▼</button>
            </span>
          </li>`
      )}`
    );
  }

  function refreshListItem() {
    const q = game.questions[selected];
    const li = root.querySelector(`.q-item[data-index="${selected}"]`);
    if (!q || !li) return drawList();
    li.classList.toggle('ready', isReady(q));
    li.classList.toggle('draft', !isReady(q));
    li.querySelector('.q-excerpt').textContent = q.text.trim() || (q.image ? '(pergunta com imagem)' : 'Pergunta sem texto');
    li.querySelector('.q-status').textContent = isReady(q) ? '✓' : '•';
    const ready = game.questions.filter(isReady).length;
    $('[data-count]', root).textContent = `${ready}/${game.questions.length} prontas`;
    const hint = $('[data-ready-hint]', root);
    if (hint) hint.innerHTML = String(readyHint(q));
  }

  function readyHint(q) {
    if (isReady(q)) return html`<span class="badge ok">Pronta para jogar</span>`;
    const missing = [];
    if (!q.text.trim() && !q.image) missing.push('escreva a pergunta');
    if (q.type === 'multiple') {
      if (q.options.filter((o) => o.text.trim()).length < 2) missing.push('preencha pelo menos 2 alternativas');
      if (!q.options.some((o) => o.id === q.correct && o.text.trim())) missing.push('marque a alternativa correta');
    } else if (!q.answers.some((a) => a.trim())) missing.push('informe a resposta aceita');
    return html`<span class="badge warn">Falta: ${missing.join(', ')}</span>`;
  }

  function drawEditor() {
    const box = $('[data-qeditor]', root);
    if (!box) return;
    const q = game.questions[selected];
    if (!q) {
      box.innerHTML = String(html`<div class="empty-state">
        <p class="big-emoji">✏️</p><h2>Adicione a primeira pergunta</h2>
        <p>Perguntas de múltipla escolha e de resposta aberta funcionam no Classic Quiz e no Spud Game.</p>
        <div class="add-row center"><button class="btn primary" data-add="multiple">+ Múltipla escolha</button><button class="btn" data-add="open">+ Resposta aberta</button></div></div>`);
      return;
    }
    box.innerHTML = String(html`
      <div class="q-editor">
        <div class="q-editor-head">
          <h2>Pergunta ${selected + 1}</h2>
          <span data-ready-hint>${readyHint(q)}</span>
          <div class="q-editor-tools">
            <button class="btn small ghost" data-dup-q>Duplicar</button>
            <button class="btn small ghost danger-text" data-del-q>Excluir</button>
          </div>
        </div>
        <div class="segmented" role="radiogroup" aria-label="Tipo de pergunta">
          <button role="radio" aria-checked="${q.type === 'multiple'}" class="${q.type === 'multiple' ? 'active' : ''}" data-type="multiple">Múltipla escolha</button>
          <button role="radio" aria-checked="${q.type === 'open'}" class="${q.type === 'open' ? 'active' : ''}" data-type="open">Resposta aberta</button>
        </div>
        <label class="field"><span>Pergunta</span>
          <textarea class="q-text-input" data-q="text" rows="3" maxlength="400" placeholder="Ex.: Qual é a capital de Goiás?">${q.text}</textarea>
        </label>
        <div class="q-image-edit">
          ${q.image
            ? html`<img src="${imageUrl(q.image)}" alt="Imagem da pergunta" /><div><button class="btn small" data-q-image>Trocar imagem</button><button class="btn small ghost" data-q-image-remove>Remover</button></div>`
            : html`<button class="btn small" data-q-image>🖼️ Adicionar imagem</button>`}
        </div>
        ${q.type === 'multiple'
          ? html`<fieldset class="options-edit"><legend>Alternativas <small>(marque a correta)</small></legend>
              ${q.options.map(
                (o, i) => html`<div class="option-row ${q.correct === o.id ? 'correct' : ''}">
                  <label class="correct-pick" title="Marcar como correta">
                    <input type="radio" name="correct" value="${o.id}" ${q.correct === o.id ? raw('checked') : ''} data-correct />
                    <span class="opt-letter opt-bg-${i}">${OPTION_LETTERS[i]}</span>
                  </label>
                  <input class="option-input" data-option="${o.id}" value="${o.text}" maxlength="160" placeholder="Alternativa ${OPTION_LETTERS[i]}" />
                  <button class="icon-btn" data-remove-option="${o.id}" aria-label="Remover alternativa" ${q.options.length <= 2 ? raw('disabled') : ''}>✕</button>
                </div>`
              )}
              ${q.options.length < 6 ? html`<button class="btn small ghost" data-add-option>+ Alternativa</button>` : ''}
            </fieldset>`
          : html`<fieldset class="options-edit"><legend>Respostas aceitas <small>(maiúsculas e acentos não importam)</small></legend>
              ${q.answers.map(
                (a, i) => html`<div class="option-row">
                  <input class="option-input" data-answer="${i}" value="${a}" maxlength="160" placeholder="${i === 0 ? 'Resposta correta' : 'Outra forma aceita'}" />
                  <button class="icon-btn" data-remove-answer="${i}" aria-label="Remover resposta" ${q.answers.length <= 1 ? raw('disabled') : ''}>✕</button>
                </div>`
              )}
              ${q.answers.length < 8 ? html`<button class="btn small ghost" data-add-answer>+ Outra forma aceita</button>` : ''}
            </fieldset>`}
        <div class="grid-2">
          <label class="field"><span>Pontos</span><input type="number" min="0" max="1000" data-q="points" value="${q.points}" /></label>
          <label class="field"><span>Tempo desta pergunta</span>
            <select data-q="time">
              <option value="" ${q.time == null ? raw('selected') : ''}>Usar o tempo da partida</option>
              ${[10, 15, 20, 30, 45, 60, 90, 120].map((t) => html`<option value="${t}" ${q.time === t ? raw('selected') : ''}>${t} segundos</option>`)}
            </select>
          </label>
        </div>
      </div>`);
  }

  function current() {
    return game.questions[selected];
  }

  function select(i) {
    selected = Math.max(0, Math.min(game.questions.length - 1, i));
    drawList();
    drawEditor();
  }

  function addQuestion(type) {
    const q = newQuestion(type, game.settings);
    game.questions.splice(selected + 1, 0, q);
    selected = game.questions.length === 1 ? 0 : selected + 1;
    drawList();
    drawEditor();
    changed();
    const t = $('.q-text-input', root);
    if (t) t.focus();
  }

  function move(from, to) {
    if (to < 0 || to >= game.questions.length || from === to) return;
    const [q] = game.questions.splice(from, 1);
    game.questions.splice(to, 0, q);
    if (selected === from) selected = to;
    else if (from < selected && to >= selected) selected--;
    else if (from > selected && to <= selected) selected++;
    drawList();
    drawEditor();
    changed();
  }

  // ---------------- eventos ----------------
  const off = [
    on(root, 'click', '[data-retry]', () => load()),
    on(root, 'input', '[data-field]', (_e, el) => {
      game[el.dataset.field] = el.value;
      changed();
    }),
    on(root, 'change', '[data-field="subject"]', (_e, el) => {
      game.subject = el.value;
      const art = $('.cover-edit .cover', root);
      if (art && !game.coverImage) art.outerHTML = String(coverArt(game, 'cover'));
    }),
    on(root, 'input', '[data-setting]', (_e, el) => {
      game.settings[el.dataset.setting] = Number(el.value) || 0;
      changed();
    }),
    on(root, 'click', '[data-apply-points]', () => {
      const pts = Number(game.settings.defaultPoints) || 10;
      game.questions.forEach((q) => (q.points = pts));
      drawEditor();
      changed();
      toast(`Todas as perguntas agora valem ${pts} pontos.`, 'success');
    }),
    on(root, 'click', '[data-cover]', async () => {
      const file = await pickFile();
      if (!file) return;
      try {
        toast('Enviando imagem...', 'info', 1500);
        game.coverImage = await uploadImage(file);
        drawAll();
        changed();
      } catch (err) {
        toast(err.message, 'error');
      }
    }),
    on(root, 'click', '[data-cover-remove]', () => {
      game.coverImage = null;
      drawAll();
      changed();
    }),
    on(root, 'click', '[data-add]', (_e, b) => addQuestion(b.dataset.add)),
    on(root, 'click', '[data-select]', (_e, b) => select(Number(b.dataset.select))),
    on(root, 'click', '[data-move]', (_e, b) => {
      const i = Number(b.dataset.move);
      move(i, i + Number(b.dataset.dir));
    }),
    on(root, 'click', '[data-type]', (_e, b) => {
      const q = current();
      if (!q || q.type === b.dataset.type) return;
      q.type = b.dataset.type;
      if (q.type === 'multiple' && q.options.length < 2) q.options = Array.from({ length: 4 }, () => ({ id: rid(), text: '' }));
      if (q.type === 'open' && !q.answers.length) {
        const correctOpt = q.options.find((o) => o.id === q.correct);
        q.answers = [correctOpt ? correctOpt.text : ''];
      }
      drawEditor();
      refreshListItem();
      changed();
    }),
    on(root, 'input', '[data-q]', (_e, el) => {
      const q = current();
      const key = el.dataset.q;
      if (key === 'text') q.text = el.value;
      if (key === 'points') q.points = Math.max(0, Math.min(1000, Number(el.value) || 0));
      refreshListItem();
      changed();
    }),
    on(root, 'change', '[data-q="time"]', (_e, el) => {
      current().time = el.value ? Number(el.value) : null;
      changed();
    }),
    on(root, 'input', '[data-option]', (_e, el) => {
      const o = current().options.find((x) => x.id === el.dataset.option);
      if (o) o.text = el.value;
      refreshListItem();
      changed();
    }),
    on(root, 'change', '[data-correct]', (_e, el) => {
      current().correct = el.value;
      root.querySelectorAll('.option-row').forEach((r) => r.classList.toggle('correct', r.querySelector('[data-correct]')?.checked));
      refreshListItem();
      changed();
    }),
    on(root, 'click', '[data-add-option]', () => {
      current().options.push({ id: rid(), text: '' });
      drawEditor();
      changed();
      const inputs = root.querySelectorAll('.option-input');
      inputs[inputs.length - 1]?.focus();
    }),
    on(root, 'click', '[data-remove-option]', (_e, b) => {
      const q = current();
      q.options = q.options.filter((o) => o.id !== b.dataset.removeOption);
      if (!q.options.some((o) => o.id === q.correct)) q.correct = null;
      drawEditor();
      refreshListItem();
      changed();
    }),
    on(root, 'input', '[data-answer]', (_e, el) => {
      current().answers[Number(el.dataset.answer)] = el.value;
      refreshListItem();
      changed();
    }),
    on(root, 'click', '[data-add-answer]', () => {
      current().answers.push('');
      drawEditor();
      changed();
      const inputs = root.querySelectorAll('[data-answer]');
      inputs[inputs.length - 1]?.focus();
    }),
    on(root, 'click', '[data-remove-answer]', (_e, b) => {
      current().answers.splice(Number(b.dataset.removeAnswer), 1);
      drawEditor();
      refreshListItem();
      changed();
    }),
    on(root, 'click', '[data-q-image]', async () => {
      const file = await pickFile();
      if (!file) return;
      try {
        toast('Enviando imagem...', 'info', 1500);
        current().image = await uploadImage(file);
        drawEditor();
        refreshListItem();
        changed();
      } catch (err) {
        toast(err.message, 'error');
      }
    }),
    on(root, 'click', '[data-q-image-remove]', () => {
      current().image = null;
      drawEditor();
      refreshListItem();
      changed();
    }),
    on(root, 'click', '[data-dup-q]', () => {
      const q = JSON.parse(JSON.stringify(current()));
      q.id = rid();
      const idMap = {};
      q.options = q.options.map((o) => {
        const nid = rid();
        idMap[o.id] = nid;
        return { ...o, id: nid };
      });
      q.correct = q.correct ? idMap[q.correct] || null : null;
      game.questions.splice(selected + 1, 0, q);
      select(selected + 1);
      changed();
      toast('Pergunta duplicada.', 'success');
    }),
    on(root, 'click', '[data-del-q]', async () => {
      const ok = await confirmDialog({ title: 'Excluir pergunta?', message: 'Esta pergunta será removida do jogo.', confirm: 'Excluir', danger: true });
      if (!ok) return;
      game.questions.splice(selected, 1);
      selected = Math.min(selected, game.questions.length - 1);
      if (selected < 0) selected = 0;
      drawList();
      drawEditor();
      changed();
    }),
    // Arrastar para reorganizar
    on(root, 'dragstart', '.q-item', (e, li) => {
      dragFrom = Number(li.dataset.index);
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragFrom));
    }),
    on(root, 'dragover', '.q-item', (e, li) => {
      e.preventDefault();
      root.querySelectorAll('.q-item').forEach((x) => x.classList.toggle('drop-target', x === li));
    }),
    on(root, 'drop', '.q-item', (e, li) => {
      e.preventDefault();
      const to = Number(li.dataset.index);
      if (dragFrom != null) move(dragFrom, to);
      dragFrom = null;
    }),
    on(root, 'dragend', '.q-item', () => {
      dragFrom = null;
      root.querySelectorAll('.q-item').forEach((x) => x.classList.remove('dragging', 'drop-target'));
    }),
    // Ações do topo
    on(root, 'click', '[data-preview]', () => {
      openPreview({ ...game, questions: game.questions.map((q) => ({ ...q, ready: isReady(q) })) });
    }),
    on(root, 'click', '[data-share]', async () => {
      await saveDebounced.flush();
      openShare(game, (g) => Object.assign(game, { isShared: g.isShared, shareCode: g.shareCode }));
    }),
    on(root, 'click', '[data-duplicate]', async () => {
      await saveDebounced.flush();
      try {
        const { game: copy } = await api.post(`/api/games/${game.id}/duplicate`);
        toast('Cópia criada. Você está editando a cópia agora.', 'success');
        navigate(`/criador/${copy.id}`);
      } catch (err) {
        toast(err.message, 'error');
      }
    }),
    on(root, 'click', '[data-play]', async () => {
      await saveDebounced.flush();
      openHostSetup({ ...game, readyCount: game.questions.filter(isReady).length });
    }),
  ];

  async function load() {
    try {
      const res = await api.get(`/api/games/${id}`);
      game = res.game;
      game.settings = { defaultTime: 20, defaultPoints: 10, ...(game.settings || {}) };
      game.questions.forEach((q) => {
        q.options = q.options || [];
        q.answers = q.answers || [];
        if (q.type === 'open' && !q.answers.length) q.answers = [''];
      });
      drawAll();
    } catch (err) {
      root.innerHTML = String(errorBlock(err.message, 'Tentar de novo'));
    }
  }
  load();

  return () => {
    off.forEach((f) => f());
    window.removeEventListener('beforeunload', beforeUnload);
    clearTimeout(retryTimer);
    if (saveState !== 'saved') saveDebounced.flush();
  };
}
