import constants from '../../../shared/constants.js';
import { html, raw, on, $$ } from './dom.js';
import { modal, toast } from './ui.js';
import { emit } from './socket.js';
import { navigate } from './nav.js';

const { SPUD_EVENTS, POWERUPS } = constants;
const LAST_KEY = 'jogae:ultima-config';

function loadLast() {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || '{}') || {};
  } catch (_) {
    return {};
  }
}

function choice(name, value, current, title, desc, icon = '') {
  return html`<label class="choice">
    <input type="radio" name="${name}" value="${value}" ${current === value ? raw('checked') : ''} />
    <span class="choice-body">${icon ? html`<span class="choice-icon" aria-hidden="true">${raw(icon)}</span>` : ''}<strong>${title}</strong>${desc ? html`<small>${desc}</small>` : ''}</span>
  </label>`;
}

function check(name, checked, label, desc) {
  return html`<label class="check"><input type="checkbox" name="${name}" ${checked ? raw('checked') : ''} /><span><strong>${label}</strong>${desc ? html`<small>${desc}</small>` : ''}</span></label>`;
}

/** Janela para configurar e abrir uma partida ao vivo. */
export function openHostSetup(game, preferredMode) {
  if (!game.readyCount) {
    toast('Este jogo ainda não tem perguntas completas. Termine pelo menos uma no criador.', 'error', 4500);
    return;
  }
  const last = loadLast();
  const c = {
    mode: preferredMode || last.mode || 'spud',
    answerSource: last.answerSource || 'devices',
    playStyle: last.playStyle || 'individual',
    teamCount: last.teamCount || 2,
    timer: last.timer ?? 20,
    shuffleQuestions: last.shuffleQuestions ?? true,
    speedBonus: last.speedBonus ?? true,
    questionLimit: last.questionLimit || 0,
    turnStyle: last.turnStyle || 'rounds',
    boardLength: last.boardLength || 30,
    movement: last.movement || 'dice',
    fixedSteps: last.fixedSteps || 3,
    wrongPenalty: last.wrongPenalty ?? 0,
    events: { ...Object.fromEntries(Object.keys(SPUD_EVENTS).map((k) => [k, true])), ...(last.events || {}) },
    powerups: { ...Object.fromEntries(Object.keys(POWERUPS).map((k) => [k, true])), ...(last.powerups || {}) },
    startWithPowerup: last.startWithPowerup ?? false,
  };

  const body = html`
    <form class="setup" data-setup>
      <p class="setup-game">Jogo: <strong>${game.title}</strong> · ${game.readyCount} pergunta${game.readyCount === 1 ? '' : 's'} pronta${game.readyCount === 1 ? '' : 's'}</p>

      <fieldset><legend>Modo de jogo</legend>
        <div class="choice-row">
          ${choice('mode', 'spud', c.mode, 'Spud Game', 'Corrida no tabuleiro com roleta e poderes', '🏁')}
          ${choice('mode', 'classic', c.mode, 'Classic Quiz', 'Perguntas, cronômetro e placar', '❓')}
        </div>
      </fieldset>

      <fieldset><legend>Como a turma responde</legend>
        <div class="choice-row">
          ${choice('answerSource', 'devices', c.answerSource, 'Pelos celulares', 'Cada um entra com o código da sala', '📱')}
          ${choice('answerSource', 'presenter', c.answerSource, 'Pelo apresentador', 'Sem celulares: você marca a resposta de cada equipe', '🧑‍🏫')}
        </div>
      </fieldset>

      <fieldset data-show="devices"><legend>Participantes</legend>
        <div class="choice-row">
          ${choice('playStyle', 'individual', c.playStyle, 'Individual', 'Cada pessoa joga por si')}
          ${choice('playStyle', 'teams', c.playStyle, 'Em equipes', 'Os participantes escolhem uma equipe')}
        </div>
      </fieldset>

      <div class="grid-2">
        <label class="field" data-show="teams"><span>Número de equipes</span>
          <select name="teamCount">${[2, 3, 4, 5, 6].map((n) => html`<option value="${n}" ${c.teamCount === n ? raw('selected') : ''}>${n} equipes</option>`)}</select>
        </label>
        <label class="field"><span>Tempo para responder</span>
          <select name="timer">${[
            [0, 'Sem limite'],
            [10, '10 segundos'],
            [15, '15 segundos'],
            [20, '20 segundos'],
            [30, '30 segundos'],
            [45, '45 segundos'],
            [60, '1 minuto'],
            [90, '1min30'],
          ].map(([v, l]) => html`<option value="${v}" ${Number(c.timer) === v ? raw('selected') : ''}>${l}</option>`)}</select>
          <small class="hint">Perguntas com tempo próprio usam o tempo definido no criador.</small>
        </label>
      </div>

      <div data-show="classic" class="mode-options">
        <div class="grid-2">
          <label class="field"><span>Quantas perguntas</span>
            <select name="questionLimit">${[0, 5, 10, 15, 20, 30].map((n) => html`<option value="${n}" ${Number(c.questionLimit) === n ? raw('selected') : ''}>${n === 0 ? 'Todas' : `${n} perguntas`}</option>`)}</select>
          </label>
        </div>
        ${check('speedBonus', c.speedBonus, 'Bônus de velocidade', 'Quem responde mais rápido ganha até 50% a mais (só nos celulares, com tempo definido)')}
      </div>

      <div data-show="spud" class="mode-options">
        <fieldset data-show="devices"><legend>Ritmo da corrida</legend>
          <div class="choice-row">
            ${choice('turnStyle', 'rounds', c.turnStyle, 'Rodadas', 'Todos respondem a mesma pergunta ao mesmo tempo')}
            ${choice('turnStyle', 'turns', c.turnStyle, 'Turnos', 'Um participante ou equipe responde por vez')}
          </div>
        </fieldset>
        <div class="grid-3">
          <label class="field"><span>Tamanho da pista</span>
            <select name="boardLength">${[
              [20, 'Curta (20 casas)'],
              [30, 'Média (30 casas)'],
              [40, 'Longa (40 casas)'],
            ].map(([v, l]) => html`<option value="${v}" ${Number(c.boardLength) === v ? raw('selected') : ''}>${l}</option>`)}</select>
          </label>
          <label class="field"><span>Ao acertar</span>
            <select name="movement">
              <option value="dice" ${c.movement === 'dice' ? raw('selected') : ''}>Rola o dado (1 a 6)</option>
              <option value="fixed" ${c.movement === 'fixed' ? raw('selected') : ''}>Anda um número fixo</option>
            </select>
          </label>
          <label class="field" data-show="fixed"><span>Casas por acerto</span>
            <select name="fixedSteps">${[1, 2, 3, 4, 5, 6].map((n) => html`<option value="${n}" ${Number(c.fixedSteps) === n ? raw('selected') : ''}>${n}</option>`)}</select>
          </label>
          <label class="field"><span>Ao errar</span>
            <select name="wrongPenalty">
              <option value="0" ${Number(c.wrongPenalty) === 0 ? raw('selected') : ''}>Fica parado</option>
              <option value="1" ${Number(c.wrongPenalty) === 1 ? raw('selected') : ''}>Volta 1 casa</option>
              <option value="2" ${Number(c.wrongPenalty) === 2 ? raw('selected') : ''}>Volta 2 casas</option>
            </select>
          </label>
        </div>
        <fieldset><legend>Eventos da roleta (casas ★)</legend>
          <div class="check-grid">${Object.entries(SPUD_EVENTS).map(([k, e]) => check(`ev_${k}`, c.events[k], `${e.icon} ${e.label}`, e.description))}</div>
        </fieldset>
        <fieldset><legend>Poderes (casas 🎁)</legend>
          <div class="check-grid">${Object.entries(POWERUPS).map(([k, p]) => check(`pw_${k}`, c.powerups[k], `${p.icon} ${p.label}`, p.description))}</div>
          ${check('startWithPowerup', c.startWithPowerup, 'Começar com um poder', 'Cada participante ganha um poder aleatório na largada')}
        </fieldset>
      </div>

      ${check('shuffleQuestions', c.shuffleQuestions, 'Embaralhar perguntas', 'As perguntas aparecem em ordem aleatória, sem repetir até usar todas')}
      <p class="form-error" role="alert" hidden></p>
    </form>`;

  const m = modal({
    title: 'Abrir partida',
    body,
    wide: true,
    actions: [
      { label: 'Cancelar', variant: 'ghost' },
      {
        label: 'Abrir sala',
        variant: 'primary',
        keepOpen: true,
        onClick: async (close, btn) => {
          const cfg = read();
          try {
            localStorage.setItem(LAST_KEY, JSON.stringify(cfg));
          } catch (_) {
            /* */
          }
          btn.disabled = true;
          btn.textContent = 'Abrindo...';
          try {
            const { code } = await emit('host:create', { gameId: game.id, config: cfg });
            close();
            navigate(`/painel/${code}`);
          } catch (err) {
            const box = m.body.querySelector('.form-error');
            box.textContent = err.message;
            box.hidden = false;
            btn.disabled = false;
            btn.textContent = 'Abrir sala';
          }
        },
      },
    ],
  });

  const form = m.body.querySelector('[data-setup]');
  function read() {
    const f = new FormData(form);
    const cfg = {
      mode: f.get('mode'),
      answerSource: f.get('answerSource'),
      playStyle: f.get('playStyle'),
      teamCount: Number(f.get('teamCount')),
      timer: Number(f.get('timer')),
      shuffleQuestions: f.has('shuffleQuestions'),
      speedBonus: f.has('speedBonus'),
      questionLimit: Number(f.get('questionLimit')),
      turnStyle: f.get('turnStyle'),
      boardLength: Number(f.get('boardLength')),
      movement: f.get('movement'),
      fixedSteps: Number(f.get('fixedSteps')),
      wrongPenalty: Number(f.get('wrongPenalty')),
      startWithPowerup: f.has('startWithPowerup'),
      events: {},
      powerups: {},
    };
    for (const k of Object.keys(SPUD_EVENTS)) cfg.events[k] = f.has(`ev_${k}`);
    for (const k of Object.keys(POWERUPS)) cfg.powerups[k] = f.has(`pw_${k}`);
    if (cfg.answerSource === 'presenter') cfg.playStyle = 'teams';
    return cfg;
  }
  function sync() {
    const cfg = read();
    const flags = {
      spud: cfg.mode === 'spud',
      classic: cfg.mode === 'classic',
      devices: cfg.answerSource === 'devices',
      teams: cfg.playStyle === 'teams' || cfg.answerSource === 'presenter',
      fixed: cfg.movement === 'fixed',
    };
    $$('[data-show]', form).forEach((el) => {
      el.hidden = !el.dataset.show.split(' ').every((k) => flags[k]);
    });
  }
  sync();
  on(form, 'change', 'input, select', sync);
}
