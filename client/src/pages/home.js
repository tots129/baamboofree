import { html, raw, on } from '../lib/dom.js';
import { user } from '../lib/auth.js';
import { characterSVG } from '../lib/characters.js';
import { navigate } from '../lib/nav.js';
import { prefersReducedMotion } from '../lib/dom.js';

const RACERS = [
  ['tuca', '#FFB627'],
  ['pingo', '#4CC9F0'],
  ['rex', '#3DDC97'],
  ['lulu', '#FF5D8F'],
];

export function render(root) {
  const u = user();
  const tiles = Array.from({ length: 12 }, (_, i) =>
    i === 0 ? 'start' : i === 11 ? 'finish' : [3, 8].includes(i) ? 'star' : i === 6 ? 'danger' : i === 4 ? 'gift' : 'normal'
  );
  root.innerHTML = String(html`
    <section class="hero">
      <div class="hero-copy">
        <h1 class="hero-title">Pergunta certa,<br />casa à frente.</h1>
        <p class="hero-lead">Crie quizzes em minutos e jogue com a turma toda: no telão, nos celulares ou dividindo a sala em equipes.</p>
        <form class="code-entry" data-code-form>
          <label for="hero-code">Recebeu um código?</label>
          <div class="code-row">
            <input id="hero-code" name="code" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="ABC123" inputmode="text" />
            <button class="btn primary" type="submit">Entrar</button>
          </div>
        </form>
        <div class="hero-actions">
          ${u
            ? html`<a class="btn secondary big" href="/biblioteca">Abrir minha biblioteca</a>`
            : html`<a class="btn secondary big" href="/entrar?modo=cadastro">Criar conta grátis</a>
                <a class="btn ghost big" href="/entrar">Já tenho conta</a>`}
        </div>
      </div>
      <div class="hero-board" aria-hidden="true">
        <div class="mini-track">
          ${tiles.map((t, i) => html`<div class="mini-tile tile-${t}" style="--i:${i}">${t === 'star' ? '★' : t === 'danger' ? '!' : t === 'gift' ? '🎁' : t === 'finish' ? '🏁' : ''}</div>`)}
        </div>
        <div class="mini-racers">
          ${RACERS.map(([c, color], i) => html`<div class="mini-racer" data-racer="${i}" style="--lane:${i}">${raw(characterSVG(c, color, { size: 58 }))}</div>`)}
        </div>
      </div>
    </section>

    <section class="modes" aria-labelledby="modes-title">
      <h2 id="modes-title" class="section-title">Dois jeitos de jogar</h2>
      <div class="mode-grid">
        <article class="mode-card mode-spud">
          <div class="mode-art">${raw(characterSVG('rex', '#3DDC97', { size: 88 }))}${raw(characterSVG('tuca', '#FFB627', { size: 72 }))}</div>
          <h3>Spud Game</h3>
          <p>Uma corrida em tabuleiro: cada resposta certa faz seu personagem andar. Casas de perigo, roleta de eventos e poderes como Shield e Swap mudam tudo até a linha de chegada.</p>
        </article>
        <article class="mode-card mode-classic">
          <div class="mode-art"><span class="quiz-bubble">A</span><span class="quiz-bubble b">B</span><span class="quiz-bubble c">C</span></div>
          <h3>Classic Quiz</h3>
          <p>Perguntas no telão, respostas nos celulares ou pelo apresentador. Cronômetro, bônus de velocidade e placar ao vivo — individual ou em equipes.</p>
        </article>
      </div>
    </section>

    <section class="steps" aria-labelledby="steps-title">
      <h2 id="steps-title" class="section-title">Da ideia à partida</h2>
      <ol class="step-list">
        <li><strong>Monte as perguntas</strong><span>Múltipla escolha ou resposta aberta, com imagens e pontuação.</span></li>
        <li><strong>Abra uma sala</strong><span>Escolha o modo e as regras. A turma entra com um código ou QR Code.</span></li>
        <li><strong>Jogue no telão</strong><span>Você controla o ritmo; o placar e o tabuleiro se atualizam na hora.</span></li>
      </ol>
    </section>`);

  const form = root.querySelector('[data-code-form]');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = form.code.value.trim().toUpperCase();
    navigate(code ? `/jogar/${code}` : '/jogar');
  });
  form.code.addEventListener('input', () => (form.code.value = form.code.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));

  // Pequena corrida decorativa no topo da página
  const positions = RACERS.map(() => 0);
  const racers = [...root.querySelectorAll('[data-racer]')];
  const place = () =>
    racers.forEach((el, i) => {
      const p = positions[i];
      const row = Math.floor(p / 4);
      const col = row % 2 === 0 ? p % 4 : 3 - (p % 4);
      el.style.left = `${col * 25}%`;
      el.style.top = `${row * 33.333}%`;
    });
  place();
  if (prefersReducedMotion()) return () => {};
  const timer = setInterval(() => {
    const i = Math.floor(Math.random() * RACERS.length);
    positions[i] = positions[i] >= 11 ? 0 : Math.min(11, positions[i] + 1 + Math.floor(Math.random() * 2));
    racers[i].classList.remove('hop');
    void racers[i].offsetWidth;
    racers[i].classList.add('hop');
    place();
  }, 900);
  return () => clearInterval(timer);
}

export { on };
