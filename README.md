# 🥔 Quiz Livre

Jogo de perguntas e respostas para sala de aula, no estilo Baamboozle — **grátis, sem cadastro, sem senha e sem nenhuma dependência** (só Node.js 18+).

**Qualquer pessoa que abrir o site pode criar os próprios jogos.** Eles ficam salvos no navegador de cada pessoa (localStorage): ninguém vê, edita ou apaga os jogos dos outros, e nada se perde quando o servidor reinicia.

## Como rodar

```bash
node server.js
```

Abra http://localhost:3000. Para outros dispositivos da mesma rede acessarem: `HOST=0.0.0.0 node server.js` (Windows PowerShell: `$env:HOST="0.0.0.0"; node server.js`). Mude a porta com `PORT=8080`.

## Publicar (GitHub + Render)

1. **GitHub:** crie um repositório e envie o conteúdo desta pasta (`server.js`, `package.json`, `render.yaml`, `README.md`, `.gitignore` e a pasta `public`).
2. **Render:** *New +* → *Web Service* → conecte o repositório. Runtime **Node**, Build Command `npm install`, Start Command `node server.js`, plano **Free**. Não precisa de nenhuma variável de ambiente.
3. Pronto: o link `https://seu-nome.onrender.com` já funciona para todo mundo.

> No plano grátis o Render "dorme" após ~15 min sem acesso; o primeiro acesso depois disso demora cerca de 1 minuto. Como o site é só HTML/JS, também funciona como **Static Site** do Render (Publish Directory: `public`, sem Build Command), que não dorme.

## O que dá para fazer

- **Criar jogos** com quantas perguntas quiser: pergunta, resposta, pontos e imagem opcional (link).
- **Adicionar em massa**: cole uma linha por pergunta no formato `pergunta | resposta | pontos`.
- **Compartilhar**: o botão **🔗 Link** copia um endereço que contém o jogo inteiro; quem abrir escolhe se quer adicioná-lo à própria biblioteca. Também dá para **Exportar / Importar JSON**.
- **Modo Clássico** — times escolhem um número; casas-surpresa com power-ups (bônus, dobro, roubo, troca, bomba).
- **Modo Quiz** — igual, mas só perguntas e pontos.
- **Modo Spud Game** — corrida num tabuleiro com personagens (emoji). Acertou: avança 1–3 casas. Errou: ganha uma letra de **S‑P‑U‑D**; com as 4 letras o time está fora. Vence quem chegar à última casa ou o último sobrevivente. O tabuleiro tem casas especiais (foguete, buraco, troca de lugar, jogar de novo, escudo, batata quente), com frequência configurável.
- **Modo Estudo** — flashcards para revisar.

Como no Baamboozle, **quem decide se a resposta está certa é o professor**: o time responde em voz alta, você clica em "Ver resposta" e marca ✅ ou ❌.

## Cuidados

- Os jogos vivem no navegador: limpar os dados do site, trocar de navegador/aparelho ou usar aba anônima faz eles "sumirem". Use **🔗 Link** ou **⬇️ Exportar** como backup.
- Links de compartilhamento muito grandes (centenas de perguntas) podem ser cortados por alguns aplicativos de mensagem; nesses casos use **Exportar**.

## Estrutura

```
server.js        servidor de arquivos estáticos (módulos nativos)
public/          o app inteiro (index.html, style.css, app.js)
```
