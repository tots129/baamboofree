# 🥔 Quiz Livre

Jogo de perguntas e respostas para sala de aula, no estilo Baamboozle — **grátis, sem cadastro e sem nenhuma dependência** (só Node.js 18+).

## Como rodar

```bash
node server.js
```

Abra http://localhost:3000. Para outros dispositivos da mesma rede acessarem (celulares, TV da sala):

```bash
HOST=0.0.0.0 node server.js      # Windows (PowerShell):  $env:HOST="0.0.0.0"; node server.js
```

> Não há login: com `HOST=0.0.0.0`, qualquer pessoa na rede consegue editar seus jogos. Use só em rede confiável.

Mude a porta com `PORT=8080 node server.js`.

## Publicar (GitHub + Render)

1. **GitHub:** crie um repositório vazio e, dentro da pasta do projeto:
   ```bash
   git init
   git add .
   git commit -m "Quiz Livre"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/quiz-livre.git
   git push -u origin main
   ```
2. **Render:** *New +* → *Web Service* → conecte o repositório. (O arquivo `render.yaml` já traz as configurações; se preencher na mão: Runtime **Node**, Build `npm install`, Start `node server.js`, plano **Free**.)
3. Em *Environment*, crie **`ADMIN_PASSWORD`** com uma senha sua. Sem ela, qualquer pessoa com o link pode apagar seus jogos. Com ela, todo mundo joga e estuda livremente, mas só quem souber a senha cria, edita ou exclui (o site pergunta a senha na primeira vez).

**Atenção — o plano grátis do Render não guarda arquivos.** O disco é apagado a cada deploy e quando o serviço "dorme", então os jogos criados online somem. Opções:
- **Faça backup com *Exportar JSON*** e reimporte com *Importar JSON* quando precisar (grátis).
- Contrate um **Disco Persistente** no Render, monte em `/var/data` e defina `DATA_DIR=/var/data` (pago).

Variáveis de ambiente: `PORT` (o Render define sozinho), `HOST`, `ADMIN_PASSWORD`, `DATA_DIR`.

## O que dá para fazer

- **Criar jogos** com quantas perguntas quiser: pergunta, resposta, pontos e imagem opcional (link).
- **Adicionar em massa**: cole uma linha por pergunta no formato `pergunta | resposta | pontos`.
- **Importar / exportar** jogos em JSON (para backup ou para passar para outro professor).
- **Modo Clássico** — times escolhem um número; casas-surpresa com power-ups (bônus, dobro, roubo, troca, bomba).
- **Modo Quiz** — igual, mas só perguntas e pontos.
- **Modo Spud Game** — corrida num tabuleiro com personagens (emoji). Acertou: avança 1–3 casas. Errou: ganha uma letra de **S‑P‑U‑D**; com as 4 letras o time está fora. Vence quem chegar à última casa ou o último sobrevivente. O tabuleiro tem casas especiais (foguete, buraco, troca de lugar, jogar de novo, escudo, batata quente), com frequência configurável.
- **Modo Estudo** — flashcards para revisar.

Como no Baamboozle, **quem decide se a resposta está certa é o professor**: o time responde em voz alta, você clica em "Ver resposta" e marca ✅ ou ❌.

## Estrutura

```
server.js        servidor HTTP + API REST (módulos nativos)
public/          interface (index.html, style.css, app.js)
data/games.json  seus jogos (criado automaticamente, com um jogo de exemplo)
```

API: `GET/POST /api/games` · `GET/PUT/DELETE /api/games/:id`.

Faça backup copiando `data/games.json`.
