'use strict';
/**
 * Conjuntos de demonstração. Na primeira execução são gravados no banco
 * (dono: usuário de sistema) e copiados para a biblioteca de cada nova conta.
 */
const db = require('./index');
const { uuid, randomCode } = require('../lib/util');
const { sanitizeGame } = require('../lib/validate');

const SYSTEM_EMAIL = 'demonstracao@jogae.sistema';

let n = 0;
function mc(text, options, correctIndex, extra = {}) {
  const opts = options.map((t, i) => ({ id: `o${++n}${i}`, text: t }));
  return { id: `q${++n}`, type: 'multiple', text, options: opts, correct: opts[correctIndex].id, ...extra };
}
function open(text, answers, extra = {}) {
  return { id: `q${++n}`, type: 'open', text, answers, ...extra };
}

const DEMOS = [
  {
    title: 'Tabuada Turbo',
    subject: 'Matemática',
    description: 'Contas rápidas, frações e geometria básica para aquecer a turma.',
    questions: [
      mc('Quanto é 7 × 8?', ['54', '56', '63', '48'], 1),
      mc('Quanto é 9 × 6?', ['54', '45', '56', '64'], 0),
      open('Quanto é 144 ÷ 12?', ['12', 'doze']),
      mc('Qual é a metade de 250?', ['115', '120', '125', '150'], 2),
      open('Quanto é 15 + 27?', ['42', 'quarenta e dois']),
      mc('Quantos lados tem um hexágono?', ['5', '6', '7', '8'], 1),
      mc('Quanto é 3²?', ['6', '9', '12', '27'], 1),
      mc('Qual destes números é primo?', ['21', '27', '29', '33'], 2),
      mc('Quanto é 25% de 80?', ['20', '25', '30', '40'], 0, { points: 15 }),
      mc('Quanto é 1000 − 375?', ['525', '625', '675', '735'], 1),
      open('Quantos minutos há em 2 horas?', ['120', 'cento e vinte']),
      mc('Qual fração é igual a 0,5?', ['1/4', '1/3', '1/2', '2/3'], 2),
    ],
  },
  {
    title: 'Capitais do Brasil',
    subject: 'Geografia',
    description: 'Do Norte ao Sul: será que a turma conhece todas as capitais?',
    questions: [
      mc('Qual é a capital de Goiás?', ['Anápolis', 'Goiânia', 'Rio Verde', 'Catalão'], 1),
      mc('Qual é a capital do Brasil?', ['Rio de Janeiro', 'São Paulo', 'Brasília', 'Salvador'], 2),
      mc('Qual é a capital da Bahia?', ['Salvador', 'Feira de Santana', 'Ilhéus', 'Recife'], 0),
      mc('Qual é a capital do Amazonas?', ['Belém', 'Manaus', 'Porto Velho', 'Boa Vista'], 1),
      mc('Qual é a capital do Paraná?', ['Londrina', 'Florianópolis', 'Curitiba', 'Maringá'], 2),
      open('Qual é a capital de Pernambuco?', ['Recife']),
      mc('Qual é a capital do Rio Grande do Sul?', ['Porto Alegre', 'Pelotas', 'Caxias do Sul', 'Gramado'], 0),
      mc('Qual é a capital do Pará?', ['Macapá', 'Santarém', 'Belém', 'São Luís'], 2),
      mc('Qual é a capital do Ceará?', ['Natal', 'Fortaleza', 'Teresina', 'João Pessoa'], 1),
      open('Qual é a capital de Minas Gerais?', ['Belo Horizonte', 'BH']),
      mc('Palmas é a capital de qual estado?', ['Tocantins', 'Mato Grosso', 'Maranhão', 'Piauí'], 0, { points: 15 }),
      mc('Qual é a capital de Santa Catarina?', ['Joinville', 'Blumenau', 'Florianópolis', 'Chapecó'], 2),
    ],
  },
  {
    title: 'Planeta e Corpo Humano',
    subject: 'Ciências',
    description: 'Sistema Solar, corpo humano e natureza em perguntas rápidas.',
    questions: [
      mc('Qual planeta fica mais perto do Sol?', ['Vênus', 'Terra', 'Mercúrio', 'Marte'], 2),
      mc('Qual é o maior planeta do Sistema Solar?', ['Saturno', 'Júpiter', 'Netuno', 'Terra'], 1),
      open('Qual órgão bombeia o sangue pelo corpo?', ['coração', 'o coração']),
      mc('Quantos ossos tem o corpo de um adulto?', ['106', '186', '206', '306'], 2, { points: 15 }),
      mc('Que gás as plantas absorvem na fotossíntese?', ['Oxigênio', 'Gás carbônico', 'Hélio', 'Nitrogênio'], 1),
      mc('Em que estado físico a água está no gelo?', ['Sólido', 'Líquido', 'Gasoso', 'Plasma'], 0),
      open('Qual é o maior órgão do corpo humano?', ['pele', 'a pele']),
      mc('Qual destes mamíferos consegue voar?', ['Pinguim', 'Morcego', 'Avestruz', 'Galinha'], 1),
      open('Qual é a fórmula química da água?', ['H2O', 'H₂O']),
      mc('Quantas patas tem um inseto?', ['4', '6', '8', '10'], 1),
      mc('Qual é o satélite natural da Terra?', ['Sol', 'Marte', 'Lua', 'Estrela-d’alva'], 2),
    ],
  },
  {
    title: 'English Fun',
    subject: 'Inglês',
    description: 'Vocabulário do dia a dia em inglês: cores, números, dias e saudações.',
    questions: [
      mc('O que significa “cat”?', ['Cachorro', 'Gato', 'Rato', 'Pato'], 1),
      mc('Como se diz “vermelho” em inglês?', ['Blue', 'Green', 'Red', 'Yellow'], 2),
      mc('“Monday” é qual dia da semana?', ['Domingo', 'Segunda-feira', 'Sexta-feira', 'Sábado'], 1),
      open('Como se diz “obrigado” em inglês?', ['thank you', 'thanks']),
      mc('O que significa “book”?', ['Livro', 'Caderno', 'Bolsa', 'Mesa'], 0),
      open('Como se escreve o número 12 em inglês?', ['twelve']),
      mc('O que significa “apple”?', ['Banana', 'Uva', 'Maçã', 'Laranja'], 2),
      mc('Qual é o plural de “dog”?', ['Doges', 'Dogs', 'Dogies', 'Dog'], 1),
      mc('Qual é o oposto de “big”?', ['Tall', 'Long', 'Small', 'Fast'], 2),
      mc('O que significa “good morning”?', ['Boa noite', 'Boa tarde', 'Bom dia', 'Até logo'], 2),
    ],
  },
];

async function systemUserId() {
  const row = await db.one('SELECT id FROM users WHERE email = $1', [SYSTEM_EMAIL]);
  if (row) return row.id;
  const id = uuid();
  // password_hash '!' nunca corresponde a um hash bcrypt: ninguém consegue entrar nesta conta.
  await db.query(
    `INSERT INTO users (id, name, email, password_hash) VALUES ($1, 'Equipe Jogaê', $2, '!')
     ON CONFLICT (email) DO NOTHING`,
    [id, SYSTEM_EMAIL]
  );
  return (await db.one('SELECT id FROM users WHERE email = $1', [SYSTEM_EMAIL])).id;
}

async function seedDemos() {
  const existing = await db.one('SELECT COUNT(*)::int AS c FROM games WHERE is_demo = TRUE');
  if (existing.c > 0) return;
  const owner = await systemUserId();
  for (const demo of DEMOS) {
    const clean = sanitizeGame(demo);
    await db.query(
      `INSERT INTO games (id, owner_id, title, description, subject, questions, settings, share_code, is_shared, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, TRUE)`,
      [
        uuid(),
        owner,
        clean.title,
        clean.description,
        clean.subject,
        JSON.stringify(clean.questions),
        JSON.stringify(clean.settings),
        randomCode(8),
      ]
    );
  }
  console.log(`[seed] ${DEMOS.length} jogos de demonstração criados.`);
}

async function copyDemoGamesTo(userId) {
  const { insertGame } = require('../routes/games');
  const demos = await db.query('SELECT * FROM games WHERE is_demo = TRUE ORDER BY created_at ASC');
  for (const d of demos) {
    await insertGame(userId, {
      title: d.title,
      description: d.description,
      subject: d.subject,
      cover_image: d.cover_image,
      questions: d.questions,
      settings: d.settings,
    });
  }
}

module.exports = { seedDemos, copyDemoGamesTo, SYSTEM_EMAIL };
