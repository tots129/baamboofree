# Jogaê! 🎲

Site de jogos educativos com **Spud Game** (corrida no tabuleiro) e **Classic Quiz**, multiplayer em tempo real.

## Publicar no Render

Configuração do Web Service:

- **Build Command:** `npm install`
- **Start Command:** `node server.js`

Não precisa de mais nada. (Também funciona com `npm install && npm run build` e `npm start`.)

## Rodar no computador

```
npm install
node server.js
```

Abra http://localhost:3000

## Sobre os dados

Sem configurar nada, os dados ficam na pasta `data`. No Render grátis essa pasta é apagada quando o site reinicia ou "dorme" (15 minutos sem uso), então contas e jogos criados podem sumir.

Para guardar tudo de forma permanente (opcional): crie um PostgreSQL no Render e adicione a variável de ambiente `DATABASE_URL` com a **Internal Database URL** dele.

## Arquivos

- `server.js` — servidor do jogo
- `public/` — o site (páginas, estilos e jogo)
- `package.json` — dependências
