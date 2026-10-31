'use strict';

/* =============================================================================
 * Quiz Livre — front-end (JS puro, sem build)
 * Telas: biblioteca · editor · configuração · jogo Clássico/Quiz · jogo Spud · estudo
 * ========================================================================== */

const app = document.getElementById('app');

const EMOJIS = ['🐸', '🦊', '🐼', '🐙', '🦄', '🐯', '🐵', '🐧', '🐶', '🐱', '🦁', '🐲'];
const SPUD = ['S', 'P', 'U', 'D'];

/* ------------------------------- utilitários ------------------------------- */

/** Cria elementos DOM sem innerHTML (evita XSS com texto digitado pelo usuário). */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '');

function toast(msg, isErr = false) {
  const t = h('div', { class: 'toast' + (isErr ? ' err' : ''), role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2800);
}

const getPass = () => { try { return localStorage.getItem('adminPass') || ''; } catch { return ''; } };
const setPass = (p) => { try { p ? localStorage.setItem('adminPass', p) : localStorage.removeItem('adminPass'); } catch { /* ignora */ } };

async function api(path, opts = {}, retried = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (getPass()) headers['X-Admin-Password'] = getPass();
  const res = await fetch('/api' + path, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    setPass('');
    if (!retried) {
      const p = prompt('Senha de administrador para criar/editar/excluir jogos:');
      if (p) { setPass(p); return api(path, opts, true); }
    }
  }
  if (!res.ok) {
    let msg = 'Algo deu errado.';
    try { msg = (await res.json()).error || msg; } catch { /* ignora */ }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

function view(...nodes) {
  document.querySelectorAll('.overlay, .toast').forEach((n) => n.remove());
  app.replaceChildren(
    h('header', { class: 'topbar' }, h('a', { class: 'brand', href: '#/' }, '🥔 Quiz Livre'), h('span', { class: 'muted' }, 'grátis · sem cadastro')),
    h('main', { class: 'container' }, nodes)
  );
  window.scrollTo(0, 0);
}

/* --------------------------------- rotas ---------------------------------- */

const routes = [
  [/^#\/?$/, renderLibrary],
  [/^#\/new$/, () => renderEditor(null)],
  [/^#\/edit\/([\w-]+)$/, (id) => renderEditor(id)],
  [/^#\/play\/([\w-]+)$/, (id) => renderSetup(id)],
  [/^#\/study\/([\w-]+)$/, (id) => renderStudy(id)],
];

async function route() {
  const hash = location.hash || '#/';
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    try {
      await fn(m[1]);
    } catch (e) {
      view(h('div', { class: 'card empty' }, h('h2', null, 'Ops!'), h('p', null, e.message), h('a', { class: 'btn', href: '#/' }, 'Voltar à biblioteca')));
    }
    return;
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', route);

/* ------------------------------- biblioteca -------------------------------- */

async function renderLibrary() {
  const games = await api('/games');

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', class: 'hidden',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        await api('/games', { method: 'POST', body: data });
        toast('Jogo importado!');
        route();
      } catch (err) {
        toast('Não foi possível importar: ' + err.message, true);
      }
    },
  });

  const cards = games.map((g) =>
    h('article', { class: 'card game-card' },
      h('h3', null, g.title),
      h('div', { class: 'muted' }, `${g.count} pergunta${g.count === 1 ? '' : 's'}`),
      h('div', { class: 'actions' },
        h('a', { class: 'btn primary', href: `#/play/${g.id}` }, '▶ Jogar'),
        h('a', { class: 'btn', href: `#/study/${g.id}` }, '📖 Estudar'),
        h('a', { class: 'btn', href: `#/edit/${g.id}` }, '✏️ Editar'),
        h('button', { class: 'btn small', title: 'Baixar como arquivo JSON', onclick: () => exportGame(g.id, g.title) }, '⬇️ Exportar'),
        h('button', {
          class: 'btn small bad', title: 'Excluir jogo',
          onclick: async () => {
            if (!confirm(`Excluir "${g.title}"? Isso não pode ser desfeito.`)) return;
            await api('/games/' + g.id, { method: 'DELETE' });
            toast('Jogo excluído.');
            route();
          },
        }, '🗑')
      )
    )
  );

  view(
    h('div', { class: 'row spread', style: 'margin-bottom:20px' },
      h('h1', null, 'Meus jogos'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => fileInput.click() }, '⬆️ Importar JSON'),
        h('a', { class: 'btn primary', href: '#/new' }, '+ Novo jogo')
      )
    ),
    fileInput,
    games.length
      ? h('div', { class: 'grid' }, cards)
      : h('div', { class: 'card empty' }, h('h2', null, 'Nenhum jogo ainda'), h('p', { class: 'muted' }, 'Crie seu primeiro conjunto de perguntas.'), h('a', { class: 'btn primary', href: '#/new' }, '+ Novo jogo'))
  );
}

async function exportGame(id, title) {
  const g = await api('/games/' + id);
  const blob = new Blob([JSON.stringify({ title: g.title, questions: g.questions }, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: (title || 'jogo').replace(/[^\w\-]+/g, '_') + '.json' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* --------------------------------- editor ---------------------------------- */

async function renderEditor(id) {
  const draft = id ? await api('/games/' + id) : { title: '', questions: [{ q: '', a: '', points: 10, image: '' }] };
  const list = h('div');
  const counter = h('span', { class: 'muted' });

  function row(item, i) {
    return h('div', { class: 'q-item' },
      h('div', { class: 'num' }, i + 1),
      h('div', null, h('label', null, 'Pergunta'), h('textarea', { value: item.q, placeholder: 'Ex.: Qual é a capital da França?', oninput: (e) => (item.q = e.target.value) })),
      h('div', null, h('label', null, 'Resposta'), h('textarea', { value: item.a, placeholder: 'Ex.: Paris', oninput: (e) => (item.a = e.target.value) })),
      h('div', null, h('label', null, 'Pontos'), h('input', { type: 'number', min: 0, max: 1000, value: item.points, oninput: (e) => (item.points = Number(e.target.value)) })),
      h('button', { class: 'btn small bad del', title: 'Remover pergunta', 'aria-label': `Remover pergunta ${i + 1}`, onclick: () => { draft.questions.splice(i, 1); redraw(); } }, '✕'),
      h('div', { class: 'img-row' }, h('input', { type: 'url', value: item.image || '', placeholder: 'Link de imagem (opcional) — https://…', oninput: (e) => (item.image = e.target.value) }))
    );
  }

  function redraw() {
    list.replaceChildren(...draft.questions.map(row));
    counter.textContent = `${draft.questions.length} pergunta${draft.questions.length === 1 ? '' : 's'}`;
  }

  const titleInput = h('input', { type: 'text', value: draft.title, maxlength: 120, placeholder: 'Ex.: Verbos irregulares — 7º ano', oninput: (e) => (draft.title = e.target.value) });

  const bulk = h('textarea', { rows: 5, placeholder: 'Uma por linha:  pergunta | resposta | pontos (opcional)\nQuanto é 2+2? | 4 | 10\nCapital da Itália? | Roma' });

  function addBulk() {
    let added = 0;
    for (const line of bulk.value.split('\n')) {
      const [q, a, p] = line.split('|').map((s) => s.trim());
      if (!q || !a) continue;
      draft.questions.push({ q, a, points: Number(p) > 0 ? Number(p) : 10, image: '' });
      added++;
    }
    // remove linhas totalmente vazias deixadas pelo formulário inicial
    draft.questions = draft.questions.filter((x) => x.q || x.a || x.image);
    bulk.value = '';
    redraw();
    toast(added ? `${added} pergunta(s) adicionada(s).` : 'Nenhuma linha válida. Use: pergunta | resposta', !added);
  }

  async function save() {
    const questions = draft.questions.filter((x) => x.q.trim() && x.a.trim());
    if (!draft.title.trim()) return toast('Dê um título ao jogo.', true);
    if (!questions.length) return toast('Adicione pelo menos uma pergunta com resposta.', true);
    try {
      await api(id ? '/games/' + id : '/games', { method: id ? 'PUT' : 'POST', body: { title: draft.title, questions } });
      toast('Jogo salvo!');
      location.hash = '#/';
    } catch (e) {
      toast(e.message, true);
    }
  }

  view(
    h('div', { class: 'row spread', style: 'margin-bottom:16px' },
      h('h1', null, id ? 'Editar jogo' : 'Novo jogo'),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/' }, 'Cancelar'), h('button', { class: 'btn primary', onclick: save }, '💾 Salvar'))
    ),
    h('div', { class: 'card', style: 'margin-bottom:16px' }, h('label', null, 'Título do jogo'), titleInput),
    h('div', { class: 'row spread', style: 'margin-bottom:8px' }, h('h2', null, 'Perguntas'), counter),
    list,
    h('div', { class: 'row', style: 'margin:12px 0 24px' },
      h('button', { class: 'btn', onclick: () => { draft.questions.push({ q: '', a: '', points: 10, image: '' }); redraw(); list.lastElementChild?.querySelector('textarea')?.focus(); } }, '+ Adicionar pergunta')
    ),
    h('details', { class: 'card' },
      h('summary', { style: 'cursor:pointer;font-weight:800' }, 'Adicionar várias de uma vez'),
      h('p', { class: 'muted' }, 'Cole uma pergunta por linha, separando pergunta, resposta e pontos com “|”.'),
      bulk,
      h('div', { style: 'margin-top:8px' }, h('button', { class: 'btn', onclick: addBulk }, 'Adicionar linhas'))
    )
  );
  redraw();
}

/* ---------------------------- modal de pergunta ---------------------------- */

/** Mostra a pergunta; o professor confere a resposta e marca Certo/Errado. Resolve true/false. */
function askQuestion(q, team, tag) {
  return new Promise((resolve) => {
    const answer = h('div', { class: 'answer hidden' }, q.a);
    const actions = h('div', { class: 'actions' });
    const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' });
    const done = (ok) => { overlay.remove(); resolve(ok); };

    const check = h('button', {
      class: 'btn primary big',
      onclick: () => {
        answer.classList.remove('hidden');
        actions.replaceChildren(
          h('button', { class: 'btn good big', onclick: () => done(true) }, '✅ Certo'),
          h('button', { class: 'btn bad big', onclick: () => done(false) }, '❌ Errado')
        );
      },
    }, '🔍 Ver resposta');
    actions.append(check);

    const img = safeUrl(q.image);
    overlay.append(
      h('div', { class: 'modal' },
        h('div', { class: 'who' }, `${team.emoji} ${team.name}`, tag ? ` · ${tag}` : ''),
        q.points ? h('span', { class: 'pts' }, `${q.points} pts`) : null,
        img ? h('div', null, h('img', { class: 'q-img', src: img, alt: 'Imagem da pergunta', referrerpolicy: 'no-referrer' })) : null,
        h('div', { class: 'question' }, q.q),
        answer,
        actions
      )
    );
    document.body.append(overlay);
    check.focus();
  });
}

/** Mostra uma mensagem em modal e resolve ao clicar em OK (ou devolve a opção escolhida). */
function modalMessage({ emoji, title, text, options }) {
  return new Promise((resolve) => {
    const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' });
    const finish = (v) => { overlay.remove(); resolve(v); };
    const buttons = options
      ? options.map((o) => h('button', { class: 'btn primary big', onclick: () => finish(o.value) }, o.label))
      : [h('button', { class: 'btn primary big', onclick: () => finish(true) }, 'OK')];
    overlay.append(h('div', { class: 'modal' }, h('div', { class: 'big-emoji' }, emoji), h('h2', null, title), text ? h('p', { class: 'muted' }, text) : null, h('div', { class: 'actions' }, buttons)));
    document.body.append(overlay);
    overlay.querySelector('button').focus();
  });
}

/* ------------------------------ configuração ------------------------------- */

async function renderSetup(id) {
  const game = await api('/games/' + id);
  const cfg = {
    mode: 'classic',
    count: 2,
    names: Array.from({ length: 8 }, (_, i) => `Time ${i + 1}`),
    emojis: EMOJIS.slice(0, 8),
    power: 'mid',
    size: 30,
  };

  const MODES = [
    ['classic', '🎲 Clássico', 'Escolha um número, responda e ganhe pontos. Há casas-surpresa com power-ups: bônus, dobro, roubo, troca e bomba.'],
    ['quiz', '❓ Quiz', 'Só perguntas e pontos — sem power-ups. Simples e direto.'],
    ['spud', '🥔 Spud Game', 'Corrida no tabuleiro com personagens! Acertou, avança. Errou, ganha uma letra de S‑P‑U‑D. Quatro letras e você está fora.'],
  ];

  const modeBox = h('div', { class: 'modes' });
  const optionsBox = h('div', { class: 'card', style: 'margin-top:16px' });
  const teamsBox = h('div');

  function drawModes() {
    modeBox.replaceChildren(...MODES.map(([key, title, desc]) =>
      h('button', { class: 'mode', 'aria-pressed': String(cfg.mode === key), onclick: () => { cfg.mode = key; drawModes(); drawOptions(); } }, h('b', null, title), h('span', { class: 'muted' }, desc))
    ));
  }

  function drawOptions() {
    if (cfg.mode !== 'spud') {
      optionsBox.classList.add('hidden');
      return;
    }
    optionsBox.classList.remove('hidden');
    const sel = (value, opts, set) => h('select', { onchange: (e) => set(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
    optionsBox.replaceChildren(
      h('h3', null, 'Opções do Spud Game'),
      h('div', { class: 'row' },
        h('div', { style: 'flex:1;min-width:200px' }, h('label', null, 'Power-ups no tabuleiro'), sel(cfg.power, [['none', 'Nenhum'], ['low', 'Poucos'], ['mid', 'Normal'], ['high', 'Muitos']], (v) => (cfg.power = v))),
        h('div', { style: 'flex:1;min-width:200px' }, h('label', null, 'Tamanho do tabuleiro'), sel(cfg.size, [[20, '20 casas (rápido)'], [30, '30 casas'], [40, '40 casas (longo)']], (v) => (cfg.size = Number(v))))
      )
    );
  }

  function drawTeams() {
    teamsBox.replaceChildren(...Array.from({ length: cfg.count }, (_, i) =>
      h('div', { class: 'team-setup' },
        h('button', { class: 'btn emoji-btn', title: 'Trocar personagem', 'aria-label': `Trocar personagem do time ${i + 1}`, onclick: (e) => {
          const used = new Set(cfg.emojis.slice(0, cfg.count));
          let next = EMOJIS.indexOf(cfg.emojis[i]);
          do { next = (next + 1) % EMOJIS.length; } while (used.has(EMOJIS[next]));
          cfg.emojis[i] = EMOJIS[next];
          e.currentTarget.textContent = cfg.emojis[i];
        } }, cfg.emojis[i]),
        h('input', { type: 'text', value: cfg.names[i], maxlength: 24, 'aria-label': `Nome do time ${i + 1}`, oninput: (e) => (cfg.names[i] = e.target.value) })
      )
    ));
  }

  const countSel = h('select', { onchange: (e) => { cfg.count = Number(e.target.value); drawTeams(); } },
    [1, 2, 3, 4, 5, 6, 7, 8].map((n) => h('option', { value: n, selected: n === cfg.count }, n === 1 ? '1 time/jogador' : `${n} times`)));

  function start() {
    const teams = Array.from({ length: cfg.count }, (_, i) => ({ name: cfg.names[i].trim() || `Time ${i + 1}`, emoji: cfg.emojis[i] }));
    if (cfg.mode === 'spud') startSpud(game, teams, cfg);
    else startClassic(game, teams, cfg.mode === 'classic', () => renderSetup(id));
  }

  view(
    h('div', { class: 'row spread', style: 'margin-bottom:16px' },
      h('div', null, h('h1', null, game.title), h('div', { class: 'muted' }, `${game.questions.length} perguntas`)),
      h('a', { class: 'btn', href: '#/' }, '← Biblioteca')
    ),
    h('h2', null, '1. Escolha o modo'), modeBox, optionsBox,
    h('h2', { style: 'margin-top:24px' }, '2. Monte os times'),
    h('div', { class: 'card' }, h('label', null, 'Quantidade'), h('div', { style: 'max-width:240px;margin-bottom:12px' }, countSel), teamsBox),
    h('div', { style: 'margin-top:24px' }, h('button', { class: 'btn primary big', onclick: start }, '▶ Começar!'))
  );
  drawModes(); drawOptions(); drawTeams();
}

/* ------------------------------ modo Clássico ------------------------------ */

const CLASSIC_POWERS = [
  { id: 'bonus', emoji: '🎁', title: 'Bônus!', text: 'Seu time ganha +10 pontos.' },
  { id: 'double', emoji: '✨', title: 'Pontos em dobro!', text: 'Seu time dobra a pontuação atual.' },
  { id: 'bomb', emoji: '💣', title: 'Bomba!', text: 'Seu time perde 10 pontos.' },
  { id: 'steal', emoji: '🦹', title: 'Roubo!', text: 'Roube até 10 pontos de outro time.', target: true },
  { id: 'swap', emoji: '🔄', title: 'Troca!', text: 'Troque de pontuação com outro time.', target: true },
];

function startClassic(game, teamsInfo, withPower, restart) {
  const teams = teamsInfo.map((t) => ({ ...t, score: 0 }));
  const tiles = game.questions.map((q) => ({ kind: 'q', q, done: false }));
  if (withPower) {
    const extra = Math.max(2, Math.round(game.questions.length * 0.3));
    for (let i = 0; i < extra; i++) tiles.push({ kind: 'p', power: pick(CLASSIC_POWERS), done: false });
  }
  const board = shuffle(tiles);
  let turn = 0;
  let busy = false;

  function draw() {
    const remaining = board.filter((t) => !t.done).length;
    view(
      h('div', { class: 'row spread' },
        h('h2', null, game.title),
        h('button', { class: 'btn small', onclick: () => confirm('Sair do jogo?') && (location.hash = '#/') }, '✕ Sair')
      ),
      h('div', { class: 'scoreboard' }, teams.map((t, i) =>
        h('div', { class: 'team-chip' + (i === turn ? ' active' : '') }, h('span', { class: 'avatar' }, t.emoji), h('span', { class: 'name' }, t.name), h('span', { class: 'score' }, t.score))
      )),
      remaining
        ? h('div', { class: 'banner' }, `Vez de ${teams[turn].emoji} ${teams[turn].name} — escolha um número!`)
        : null,
      h('div', { class: 'tiles' }, board.map((t, i) =>
        h('button', { class: 'tile', disabled: t.done, 'aria-label': `Casa ${i + 1}`, onclick: () => pickTile(i) }, t.done ? (t.kind === 'p' ? t.power.emoji : '✓') : i + 1)
      ))
    );
  }

  async function pickTile(i) {
    if (busy) return;
    busy = true;
    const tile = board[i];
    const team = teams[turn];
    if (tile.kind === 'q') {
      const ok = await askQuestion(tile.q, team);
      if (ok) {
        team.score += tile.q.points;
        toast(`+${tile.q.points} pontos para ${team.name}!`);
      }
    } else {
      await applyPower(tile.power, team);
    }
    tile.done = true;
    turn = (turn + 1) % teams.length;
    busy = false;
    if (board.every((t) => t.done)) return results();
    draw();
  }

  async function applyPower(p, team) {
    const others = teams.filter((t) => t !== team);
    if (p.target && others.length) {
      const target = await modalMessage({
        emoji: p.emoji, title: p.title, text: p.text + ' Escolha o alvo:',
        options: others.map((t) => ({ label: `${t.emoji} ${t.name} (${t.score})`, value: t })),
      });
      if (p.id === 'steal') {
        const amount = Math.min(10, target.score);
        target.score -= amount;
        team.score += amount;
        toast(`${team.name} roubou ${amount} pontos de ${target.name}!`);
      } else {
        [team.score, target.score] = [target.score, team.score];
        toast(`${team.name} trocou de pontos com ${target.name}!`);
      }
      return;
    }
    await modalMessage({ emoji: p.emoji, title: p.title, text: p.target ? 'Sem alvos disponíveis — nada acontece.' : p.text });
    if (p.id === 'bonus') team.score += 10;
    if (p.id === 'double') team.score *= 2;
    if (p.id === 'bomb') team.score = Math.max(0, team.score - 10);
  }

  function results() {
    const ranking = [...teams].sort((a, b) => b.score - a.score);
    const top = ranking[0].score;
    const winners = ranking.filter((t) => t.score === top);
    view(
      h('div', { class: 'card empty' },
        h('div', { class: 'big-emoji' }, '🏆'),
        h('h1', null, winners.length > 1 ? 'Empate!' : `${winners[0].emoji} ${winners[0].name} venceu!`),
        h('ol', { style: 'display:inline-block;text-align:left;font-size:1.2rem' }, ranking.map((t) => h('li', null, `${t.emoji} ${t.name} — ${t.score} pts`))),
        h('div', { class: 'row', style: 'justify-content:center;margin-top:20px' },
          h('button', { class: 'btn primary big', onclick: restart }, '🔁 Jogar de novo'),
          h('a', { class: 'btn big', href: '#/' }, 'Biblioteca')
        )
      )
    );
  }

  draw();
}

/* -------------------------------- Spud Game -------------------------------- */

const CELL_KINDS = {
  adv: { emoji: '🚀', label: 'Foguete: avance 2 casas' },
  back: { emoji: '🕳️', label: 'Buraco: volte 2 casas' },
  swap: { emoji: '🔄', label: 'Troca: troque de lugar com outro time' },
  extra: { emoji: '🎲', label: 'Jogue de novo' },
  shield: { emoji: '🛡️', label: 'Escudo: bloqueia a próxima letra' },
  spud: { emoji: '🥔', label: 'Batata quente: ganhe uma letra!' },
};

function startSpud(game, teamsInfo, cfg) {
  const N = cfg.size;
  const density = { none: 0, low: 0.1, mid: 0.2, high: 0.3 }[cfg.power];
  const kinds = Object.keys(CELL_KINDS);
  const cells = Array(N).fill(null);
  for (let i = 1; i < N - 1; i++) {
    if (Math.random() < density && !cells[i - 1]) cells[i] = pick(kinds);
  }

  const teams = teamsInfo.map((t) => ({ ...t, pos: 0, letters: 0, shield: false, out: false }));
  let turn = 0;
  let busy = false;
  let deck = [];
  const log = [`Corrida começou! Chegue até a casa ${N} 🏁`];
  const say = (msg) => log.unshift(msg);

  const nextQuestion = () => {
    if (!deck.length) deck = shuffle(game.questions);
    return deck.pop();
  };

  function draw() {
    const cols = window.innerWidth < 640 ? 5 : 10;
    const rows = [];
    for (let r = 0; r < N / cols; r++) {
      const idxs = Array.from({ length: cols }, (_, c) => r * cols + c).filter((i) => i < N);
      rows.push(h('div', { class: 'board-row' + (r % 2 ? ' rev' : '') }, idxs.map(cellEl)));
    }
    const t = teams[turn];
    view(
      h('div', { class: 'row spread' },
        h('h2', null, `🥔 ${game.title}`),
        h('button', { class: 'btn small', onclick: () => confirm('Sair do jogo?') && (location.hash = '#/') }, '✕ Sair')
      ),
      h('div', { class: 'spud-layout' },
        h('div', null,
          h('div', { class: 'board' }, rows),
          h('div', { class: 'legend' }, Object.values(CELL_KINDS).map((k) => h('span', null, `${k.emoji} ${k.label}`)))
        ),
        h('aside', null,
          h('div', { class: 'scoreboard', style: 'flex-direction:column' }, teams.map(teamChip)),
          h('button', { class: 'btn primary big', style: 'width:100%;margin-bottom:16px', disabled: busy, onclick: playTurn }, `🎯 Vez de ${t.emoji} ${t.name}: pergunta!`),
          h('div', { class: 'card' }, h('h3', null, 'Acontecimentos'), h('ul', { class: 'log' }, log.slice(0, 6).map((l) => h('li', null, l))))
        )
      )
    );
  }

  function cellEl(i) {
    const kind = cells[i];
    const here = teams.filter((t) => !t.out && t.pos === i);
    return h('div', { class: 'cell' + (i === 0 ? ' start' : '') + (i === N - 1 ? ' finish' : '') + (kind ? ` kind-${kind}` : ''), title: kind ? CELL_KINDS[kind].label : '' },
      h('small', null, i === 0 ? 'INÍCIO' : i + 1),
      i === N - 1 ? '🏁' : kind ? CELL_KINDS[kind].emoji : null,
      here.length ? h('div', { class: 'tokens' }, here.map((t) => h('span', { class: 'token', title: t.name }, t.emoji))) : null
    );
  }

  function teamChip(t, i) {
    return h('div', { class: 'team-chip' + (i === turn ? ' active' : '') + (t.out ? ' out' : '') },
      h('span', { class: 'avatar' }, t.out ? '☠️' : t.emoji),
      h('div', null,
        h('div', { class: 'name' }, t.name, t.shield ? ' 🛡️' : ''),
        h('div', { class: 'letters', 'aria-label': `${t.letters} letras` }, SPUD.map((l, k) => h('span', { class: k < t.letters ? 'hit' : '' }, l)))
      ),
      h('span', { class: 'score', title: 'Casa atual', 'aria-label': `Casa ${t.pos + 1}` }, `📍${t.pos + 1}`)
    );
  }

  const active = () => teams.filter((t) => !t.out);

  function giveLetter(t) {
    if (t.shield) {
      t.shield = false;
      say(`🛡️ O escudo de ${t.name} bloqueou a letra!`);
      return;
    }
    t.letters++;
    say(`${t.name} ganhou a letra “${SPUD[t.letters - 1]}”.`);
    if (t.letters >= 4) {
      t.out = true;
      say(`☠️ ${t.name} formou S‑P‑U‑D e está fora!`);
    }
  }

  function move(t, steps) {
    t.pos = Math.max(0, Math.min(N - 1, t.pos + steps));
  }

  /** Aplica o efeito da casa onde o time caiu. Devolve true se ganhou jogada extra. */
  function land(t) {
    const kind = cells[t.pos];
    if (!kind || t.pos === N - 1) return false;
    const info = CELL_KINDS[kind];
    say(`${info.emoji} ${t.name} caiu em: ${info.label}.`);
    if (kind === 'adv') move(t, 2);
    else if (kind === 'back') move(t, -2);
    else if (kind === 'shield') t.shield = true;
    else if (kind === 'spud') giveLetter(t);
    else if (kind === 'extra') return true;
    else if (kind === 'swap') {
      const others = active().filter((o) => o !== t);
      if (others.length) {
        const o = pick(others);
        [t.pos, o.pos] = [o.pos, t.pos];
        say(`${t.name} trocou de lugar com ${o.name}!`);
      }
    }
    return false;
  }

  async function playTurn() {
    if (busy) return;
    busy = true;
    draw();
    const t = teams[turn];
    const ok = await askQuestion(nextQuestion(), t, 'Spud Game');
    let extra = false;
    if (ok) {
      const steps = 1 + Math.floor(Math.random() * 3);
      say(`🎲 ${t.name} acertou e avança ${steps} casa${steps > 1 ? 's' : ''}!`);
      move(t, steps);
      extra = land(t);
    } else {
      say(`❌ ${t.name} errou.`);
      giveLetter(t);
    }

    // fim de jogo?
    let winner = null;
    if (t.pos >= N - 1 && !t.out) winner = t;
    else if (teams.length > 1 && active().length === 1) winner = active()[0];
    if (winner || !active().length) {
      busy = false;
      return finish(winner);
    }

    if (extra && !t.out) say(`🎲 ${t.name} joga de novo!`);
    else do { turn = (turn + 1) % teams.length; } while (teams[turn].out);
    busy = false;
    draw();
  }

  function finish(winner) {
    draw();
    modalMessage({
      emoji: winner ? '🏆' : '😵',
      title: winner ? `${winner.emoji} ${winner.name} venceu!` : 'Todos foram eliminados!',
      text: winner ? (winner.pos >= N - 1 ? 'Chegou primeiro ao fim do tabuleiro!' : 'Foi o último a sobreviver!') : 'Que batata quente...',
      options: [{ label: '🔁 Jogar de novo', value: 'again' }, { label: 'Biblioteca', value: 'home' }],
    }).then((v) => {
      if (v === 'again') startSpud(game, teamsInfo, cfg);
      else location.hash = '#/';
    });
  }

  window.addEventListener('resize', onResize);
  function onResize() {
    if (!document.querySelector('.board')) return window.removeEventListener('resize', onResize);
    if (!busy) draw();
  }
  draw();
}

/* --------------------------------- estudo ---------------------------------- */

async function renderStudy(id) {
  const game = await api('/games/' + id);
  let deck = [...game.questions];
  let i = 0;
  let flipped = false;

  const card = h('div', { class: 'card flash', role: 'button', tabindex: '0', onclick: flip, onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), flip()) });
  const counter = h('span', { class: 'muted' });

  function flip() { flipped = !flipped; paint(); }
  function go(d) { i = (i + d + deck.length) % deck.length; flipped = false; paint(); }
  function paint() {
    const q = deck[i];
    card.classList.toggle('back', flipped);
    card.replaceChildren(
      h('div', null,
        !flipped && safeUrl(q.image) ? h('img', { class: 'q-img', src: safeUrl(q.image), alt: '', referrerpolicy: 'no-referrer', style: 'max-width:100%;max-height:200px;display:block;margin:0 auto 12px;border-radius:12px' }) : null,
        flipped ? q.a : q.q
      )
    );
    counter.textContent = `${i + 1} / ${deck.length} · clique no cartão para ${flipped ? 'ver a pergunta' : 'ver a resposta'}`;
  }

  view(
    h('div', { class: 'row spread', style: 'margin-bottom:16px' }, h('h1', null, `📖 ${game.title}`), h('a', { class: 'btn', href: '#/' }, '← Biblioteca')),
    card,
    h('div', { class: 'row spread', style: 'margin-top:16px' },
      h('button', { class: 'btn', onclick: () => go(-1) }, '← Anterior'),
      counter,
      h('button', { class: 'btn', onclick: () => { deck = shuffle(deck); i = 0; flipped = false; paint(); } }, '🔀 Embaralhar'),
      h('button', { class: 'btn primary', onclick: () => go(1) }, 'Próxima →')
    )
  );
  paint();
}

/* ---------------------------------- início --------------------------------- */
route();
