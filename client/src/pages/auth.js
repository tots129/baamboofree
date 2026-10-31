import { html, raw, on, $$ } from '../lib/dom.js';
import { login, register, user } from '../lib/auth.js';
import { navigate } from '../lib/nav.js';
import { resetSocket } from '../lib/socket.js';
import { characterSVG, CHARACTERS, COLORS } from '../lib/characters.js';

export function render(root, { query }) {
  const back = query.get('voltar');
  const target = back && back.startsWith('/') && !back.startsWith('//') ? back : '/biblioteca';
  if (user()) {
    navigate(target, { replace: true });
    return;
  }
  let mode = query.get('modo') === 'cadastro' ? 'register' : 'login';
  const avatar = { character: CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id, color: COLORS[Math.floor(Math.random() * 4)] };

  function draw() {
    root.innerHTML = String(html`
      <section class="auth-wrap">
        <div class="auth-card">
          <div class="tabs" role="tablist">
            <button role="tab" class="tab ${mode === 'login' ? 'active' : ''}" aria-selected="${mode === 'login'}" data-mode="login">Entrar</button>
            <button role="tab" class="tab ${mode === 'register' ? 'active' : ''}" aria-selected="${mode === 'register'}" data-mode="register">Criar conta</button>
          </div>
          <form class="form" data-form novalidate>
            ${mode === 'register'
              ? html`
                  <div class="avatar-pick">
                    <button type="button" class="avatar-big" data-avatar-roll title="Trocar personagem">${raw(characterSVG(avatar.character, avatar.color, { size: 96 }))}</button>
                    <p class="hint">Toque no personagem para trocar. Dá para mudar depois no perfil.</p>
                  </div>
                  <label class="field"><span>Seu nome</span><input name="name" autocomplete="name" required minlength="2" maxlength="60" /></label>`
              : ''}
            <label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required /></label>
            <label class="field"><span>Senha</span><input name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required minlength="6" />
              ${mode === 'register' ? html`<small class="hint">Pelo menos 6 caracteres.</small>` : ''}</label>
            <p class="form-error" role="alert" hidden></p>
            <button class="btn primary big block" type="submit">${mode === 'login' ? 'Entrar' : 'Criar minha conta'}</button>
          </form>
        </div>
        <aside class="auth-side">
          <h1>${mode === 'login' ? 'Bom te ver de novo!' : 'Sua turma vai adorar.'}</h1>
          <p>${mode === 'login'
            ? 'Seus jogos ficam salvos na sua conta e você pode abrir uma partida em segundos.'
            : 'Sua conta já começa com quatro jogos prontos para testar: Matemática, Geografia, Ciências e Inglês.'}</p>
          <p class="hint">Participantes não precisam de conta: eles entram só com o código da sala.</p>
        </aside>
      </section>`);
  }

  draw();

  const off = [
    on(root, 'click', '[data-mode]', (_e, b) => {
      mode = b.dataset.mode;
      draw();
    }),
    on(root, 'click', '[data-avatar-roll]', (_e, b) => {
      const i = CHARACTERS.findIndex((c) => c.id === avatar.character);
      avatar.character = CHARACTERS[(i + 1) % CHARACTERS.length].id;
      avatar.color = COLORS[(COLORS.indexOf(avatar.color) + 3) % COLORS.length];
      b.innerHTML = characterSVG(avatar.character, avatar.color, { size: 96 });
    }),
    on(root, 'submit', '[data-form]', async (e, form) => {
      e.preventDefault();
      const err = form.querySelector('.form-error');
      err.hidden = true;
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      const data = Object.fromEntries(new FormData(form));
      try {
        if (mode === 'login') await login(data.email, data.password);
        else await register({ ...data, avatar });
        resetSocket();
        navigate(target, { replace: true });
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        btn.disabled = false;
      }
    }),
  ];
  return () => off.forEach((f) => f());
}

export { $$ };
