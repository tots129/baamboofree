# Jogaê! 🎲

Plataforma de jogos educativos para jogar com a turma, com **dois modos**:

- **Spud Game** — corrida em tabuleiro: cada resposta certa faz o personagem andar. Casas de perigo (vermelhas), roleta de eventos (★) e poderes (🎁): Speed Boost, Shield, Double Points, Swap e Shuffle Players.
- **Classic Quiz** — perguntas no telão, cronômetro, bônus de velocidade e placar ao vivo.

Os dois funcionam **individualmente ou em equipes**, com respostas **pelos celulares** (cada participante entra com um código ou QR Code) ou **pelo apresentador** (sem celulares: o professor marca a resposta de cada equipe na sua vez).

Tudo é gratuito, em português e com personagens e visual próprios.

---

## Recursos

| Área | O que tem |
|---|---|
| Contas | Cadastro, login, logout, perfil com personagem, troca de senha, senhas com hash bcrypt |
| Criador | Título, descrição, matéria, capa, perguntas ilimitadas (múltipla escolha ou resposta aberta), imagens, pontuação e tempo por pergunta, reorganizar (arrastar ou setas), duplicar, excluir, **salvamento automático**, visualizar antes de jogar |
| Biblioteca | Pesquisa por título, filtro por matéria, recentes, jogar, editar, duplicar, compartilhar por link, excluir. Toda conta nova recebe 4 jogos de demonstração |
| Multiplayer | Socket.IO em tempo real, código de 6 caracteres + QR Code, sala de espera, equipes, turnos ou rodadas, **reconexão automática** (o participante volta para onde estava), tela de apresentação separada para o projetor |
| Spud Game | Tabuleiro de 20/30/40 casas, dado ou avanço fixo, penalidade configurável para erro, roleta animada, 5 poderes, eventos e poderes podem ser ligados/desligados antes da partida, perguntas não se repetem até usar todas, animação de chegada, pódio |
| Classic Quiz | Cronômetro configurável, bônus de velocidade, efeitos de acerto/erro, placar, limite de perguntas, resultado final |
| Experiência | Efeitos sonoros (sintetizados no navegador), controle de volume, animações, tela cheia, layout para computador, tablet e celular |
| Segurança | O servidor valida respostas, pontos, turnos, eventos e poderes — nada vindo do navegador é aceito sem conferência. Rotas privadas protegidas, limite de tentativas de login |

---

## Rodar no seu computador

Você precisa do **Node.js 18.18 ou mais novo** (recomendado: 22). Baixe em <https://nodejs.org>.

```bash
npm install      # instala as dependências
npm run dev      # modo desenvolvimento (recompila sozinho ao salvar)
```

Abra <http://localhost:3000>.

**Não precisa instalar PostgreSQL no computador.** Sem `DATABASE_URL`, o projeto usa um PostgreSQL embutido (PGlite) salvo na pasta `data/`. É o mesmo banco da produção, então tudo se comporta igual.

Para testar o multiplayer em casa: abra o painel num navegador e, em outra janela anônima ou no celular (na mesma rede Wi-Fi, usando o IP do computador, ex.: `http://192.168.0.10:3000/jogar`), entre com o código.

### Todos os comandos

| Comando | Para quê |
|---|---|
| `npm install` | Instala as dependências |
| `npm run dev` | Desenvolvimento: compila o frontend a cada alteração e reinicia o servidor |
| `npm run build` | Gera o frontend otimizado em `dist/` (usado no Render) |
| `npm start` | Inicia em produção (rode `npm run build` antes) |
| `npm test` | Roda os testes do motor de jogo e de integração (API, multiplayer, reconexão e persistência) |

Para rodar os testes contra um PostgreSQL de verdade: `DATABASE_URL=postgres://... npm test`.

---

## Enviar para o GitHub

O `.gitignore` já impede que `node_modules`, `dist`, `data` e o arquivo `.env` (com senhas) sejam enviados.

**Pelo terminal:**

```bash
git init
git add .
git commit -m "Jogaê! primeira versão"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/jogae.git
git push -u origin main
```

(Crie antes o repositório vazio em <https://github.com/new>.)

**Sem terminal:** crie o repositório no GitHub, clique em **Add file → Upload files** e arraste todas as pastas e arquivos do projeto (menos `node_modules`, se existir).

---

## Publicar no Render

O projeto já vem com um `render.yaml` (Blueprint) que cria **o site e o banco PostgreSQL juntos**, sem mexer no código.

1. Entre em <https://dashboard.render.com> e conecte sua conta do GitHub.
2. Clique em **New + → Blueprint**.
3. Escolha o repositório `jogae` e confirme. O Render vai criar:
   - `jogae` — Web Service Node.js (build: `npm ci && npm run build`, start: `npm start`)
   - `jogae-db` — banco PostgreSQL, ligado ao site pela variável `DATABASE_URL`
   - `JWT_SECRET` — gerado automaticamente
4. Aguarde o primeiro deploy (alguns minutos). O endereço público aparece no topo da página do serviço, algo como `https://jogae.onrender.com`.

Pronto: os participantes entram em `https://SEU-SITE.onrender.com/jogar`.

### Configuração manual (sem Blueprint)

Se preferir criar à mão: crie um **PostgreSQL** e depois um **Web Service** com:

- Runtime: **Node** · Build Command: `npm ci && npm run build` · Start Command: `npm start`
- Variáveis de ambiente: `NODE_ENV=production`, `JWT_SECRET=` (um texto longo e aleatório) e `DATABASE_URL=` (copie a **Internal Database URL** do banco)

O servidor já usa a porta do Render (`process.env.PORT`), escuta em `0.0.0.0`, funciona com WebSockets e liga SSL no banco automaticamente quando necessário.

### Onde ficam os dados

- **Contas, jogos, perguntas, respostas e histórico de partidas** ficam no PostgreSQL — não somem em reinícios nem em novos deploys.
- **Imagens enviadas** (capas e imagens de perguntas) são reduzidas no navegador e guardadas **no próprio PostgreSQL**, nunca na pasta temporária do servidor. Não é preciso configurar nenhum serviço extra.
- **Partidas ao vivo** ficam na memória do servidor enquanto acontecem. Se o servidor reiniciar no meio de uma partida, ela precisa ser aberta de novo (os jogos e as perguntas continuam salvos).

### Atenção ao plano gratuito do Render

- O **banco PostgreSQL gratuito expira 30 dias depois de criado**; depois disso há 14 dias para mudar para um plano pago, ou o Render apaga o banco e os dados. Para uso contínuo com a turma, mude o banco `jogae-db` para um plano pago antes do prazo (o site pode continuar no plano gratuito).
- O **site gratuito "dorme"** depois de 15 minutos sem acesso e leva cerca de 1 minuto para acordar. Abra o site alguns minutos antes da aula.

Detalhes atualizados em <https://render.com/docs/free>.

---

## Como jogar

1. Entre na sua conta e abra a **Biblioteca**.
2. Clique em **Jogar** num jogo e escolha o modo, como a turma responde, equipes, tempo e regras.
3. Projete o painel (ou clique em **Tela de apresentação** para abrir uma tela só de exibição no projetor e controlar pelo notebook/celular).
4. A turma entra em `/jogar` com o código ou pelo QR Code.
5. Clique em **Começar partida**. Use **Revelar resposta** e **Próxima pergunta** para controlar o ritmo.
6. No fim, o pódio aparece e **Jogar de novo** recomeça com os mesmos participantes.

**Regras do Spud Game:** acertou → anda (dado de 1 a 6 ou número fixo). Errou → fica parado ou volta 1–2 casas (você escolhe). Casa vermelha → volta 2–3 casas. Casa ★ → gira a roleta. Casa 🎁 → ganha um poder (máximo de 3). Poderes são usados antes de responder, na própria vez. O Shield bloqueia o próximo evento negativo. Vence quem chegar primeiro.

---

## Estrutura do projeto

```
jogae/
├── server/                 # Backend (Node.js + Express + Socket.IO)
│   ├── index.js            # Servidor HTTP, API e arquivos do site
│   ├── config.js           # Variáveis de ambiente
│   ├── sockets.js          # Eventos em tempo real (salas, respostas, poderes)
│   ├── db/                 # Conexão (PostgreSQL / PGlite), esquema e jogos de demonstração
│   ├── routes/             # API: contas, jogos, imagens
│   ├── middleware/auth.js  # Sessões (cookie httpOnly + JWT)
│   ├── lib/                # Validação e utilitários
│   └── game/               # Motor das partidas: Room, tabuleiro, configuração
├── shared/constants.js     # Personagens, cores, eventos e poderes (servidor e site)
├── client/                 # Frontend (JavaScript sem framework, empacotado com esbuild)
│   ├── index.html
│   ├── styles/main.css
│   └── src/
│       ├── main.js         # Rotas das páginas
│       ├── pages/          # Início, entrar, biblioteca, criador, perfil, jogar, painel, participante
│       ├── game/           # Tabuleiro, animações, roleta, dado, placar
│       └── lib/            # API, socket, sons, personagens, janelas
├── scripts/                # build.js e dev.js
├── tests/                  # Testes do motor e de integração
├── render.yaml             # Implantação no Render
├── .env.example
└── package.json
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Em produção | Endereço do PostgreSQL. Vazia = banco embutido em `./data` |
| `JWT_SECRET` | Em produção | Segredo das sessões. Sem ele, todos precisam entrar de novo a cada reinício |
| `PORT` | Não | Porta (o Render define sozinho) |
| `DATABASE_SSL` | Não | `auto` (padrão), `true` ou `false` |
| `CORS_ORIGIN` | Não | Só se o site e o servidor estiverem em domínios diferentes |
