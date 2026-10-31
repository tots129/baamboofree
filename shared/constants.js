'use strict';
/**
 * Constantes compartilhadas entre servidor e navegador.
 * (O esbuild empacota este arquivo CommonJS no frontend.)
 */

const SUBJECTS = [
  'Geral',
  'Matemática',
  'Português',
  'Ciências',
  'História',
  'Geografia',
  'Inglês',
  'Artes',
  'Educação Física',
  'Outros',
];

// Personagens originais do Jogaê! (desenhados em SVG no navegador).
const CHARACTERS = [
  { id: 'tuca', name: 'Tuca', kind: 'Batata' },
  { id: 'bolota', name: 'Bolota', kind: 'Bolinha' },
  { id: 'pingo', name: 'Pingo', kind: 'Gotinha' },
  { id: 'zeze', name: 'Zezé', kind: 'Cubinho' },
  { id: 'nino', name: 'Nino', kind: 'Ovinho' },
  { id: 'lulu', name: 'Lulu', kind: 'Cogumelo' },
  { id: 'rex', name: 'Rex', kind: 'Dino' },
  { id: 'fafa', name: 'Fafá', kind: 'Nuvem' },
];

const COLORS = [
  '#FFB627', // milho
  '#FF5D8F', // chiclete
  '#3DDC97', // menta
  '#4CC9F0', // céu
  '#9B5DE5', // uva
  '#FF7B39', // laranja
  '#F15BB5', // pitaya
  '#00BBF9', // piscina
  '#C5E063', // limão
  '#E63946', // tomate
];

const SPUD_EVENTS = {
  advance: { label: 'Avançar casas', icon: '🚀', description: 'Avança de 2 a 4 casas.', negative: false },
  back: { label: 'Voltar casas', icon: '🌀', description: 'Volta de 2 a 3 casas.', negative: true },
  swap: { label: 'Troca-troca', icon: '🔄', description: 'Troca de lugar com outro participante.', negative: false },
  skip: { label: 'Perder a vez', icon: '😴', description: 'Fica uma rodada sem jogar.', negative: true },
  points: { label: 'Pontos extras', icon: '💎', description: 'Ganha 20 pontos extras.', negative: false },
  shuffle: { label: 'Embaralhar', icon: '🌪️', description: 'Embaralha as posições de todos.', negative: false },
};

const POWERUPS = {
  speed: { label: 'Speed Boost', icon: '⚡', description: 'Na próxima resposta certa, anda 3 casas extras.' },
  shield: { label: 'Shield', icon: '🛡️', description: 'Protege contra o próximo evento negativo.' },
  double: { label: 'Double Points', icon: '✖️2', description: 'Dobra os pontos da próxima resposta certa.' },
  swap: { label: 'Swap', icon: '🔁', description: 'Troca de posição com quem você escolher.' },
  shuffle: { label: 'Shuffle Players', icon: '🎲', description: 'Embaralha as posições de todos agora.' },
};

const LIMITS = {
  titleMax: 120,
  descriptionMax: 600,
  questionTextMax: 400,
  optionTextMax: 160,
  optionsMin: 2,
  optionsMax: 6,
  acceptedAnswersMax: 8,
  questionsMax: 300,
  playerNameMax: 20,
  teamNameMax: 24,
  playersPerRoomMax: 60,
  teamsMin: 2,
  teamsMax: 6,
};

module.exports = { SUBJECTS, CHARACTERS, COLORS, SPUD_EVENTS, POWERUPS, LIMITS };
