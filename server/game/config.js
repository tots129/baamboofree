'use strict';
const { SPUD_EVENTS, POWERUPS, COLORS, CHARACTERS, LIMITS } = require('../../shared/constants');
const { cleanText, clampInt } = require('../lib/util');

const DEFAULT_TEAM_NAMES = ['Equipe Milho', 'Equipe Chiclete', 'Equipe Menta', 'Equipe Céu', 'Equipe Uva', 'Equipe Laranja'];
const TEAM_COLORS = ['#FFB627', '#FF5D8F', '#3DDC97', '#4CC9F0', '#9B5DE5', '#FF7B39'];
const TEAM_CHARACTERS = ['tuca', 'bolota', 'pingo', 'zeze', 'nino', 'rex'];

function bool(v, fallback) {
  return typeof v === 'boolean' ? v : fallback;
}

function sanitizeFlags(input, catalog, fallback = true) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const key of Object.keys(catalog)) out[key] = bool(src[key], fallback);
  return out;
}

function sanitizeTeams(input, count) {
  const list = Array.isArray(input) ? input : [];
  const n = clampInt(count != null ? count : list.length || 2, LIMITS.teamsMin, LIMITS.teamsMax, 2);
  const teams = [];
  for (let i = 0; i < n; i++) {
    const t = list[i] && typeof list[i] === 'object' ? list[i] : {};
    teams.push({
      id: `t${i + 1}`,
      name: cleanText(t.name, LIMITS.teamNameMax) || DEFAULT_TEAM_NAMES[i],
      color: COLORS.includes(t.color) ? t.color : TEAM_COLORS[i],
      character: CHARACTERS.some((c) => c.id === t.character) ? t.character : TEAM_CHARACTERS[i],
    });
  }
  return teams;
}

/**
 * Configuração da partida definida pelo administrador. Tudo é validado aqui;
 * o navegador apenas sugere valores.
 */
function sanitizeRoomConfig(input, gameSettings = {}) {
  const c = input && typeof input === 'object' ? input : {};
  const mode = c.mode === 'classic' ? 'classic' : 'spud';
  const answerSource = c.answerSource === 'presenter' ? 'presenter' : 'devices';
  // No modo apresentador as equipes são definidas pelo administrador.
  const playStyle = answerSource === 'presenter' ? 'teams' : c.playStyle === 'teams' ? 'teams' : 'individual';

  const defaultTime = clampInt(gameSettings.defaultTime, 0, 300, 20);
  const config = {
    mode,
    answerSource,
    playStyle,
    teams: playStyle === 'teams' ? sanitizeTeams(c.teams, c.teamCount) : [],
    timer: c.timer === undefined ? defaultTime : clampInt(c.timer, 0, 300, defaultTime),
    shuffleQuestions: bool(c.shuffleQuestions, true),
  };

  if (mode === 'classic') {
    config.speedBonus = bool(c.speedBonus, true);
    config.questionLimit = clampInt(c.questionLimit, 0, 300, 0); // 0 = todas
    config.turnStyle = answerSource === 'presenter' ? 'turns' : 'rounds';
  } else {
    config.turnStyle = answerSource === 'presenter' ? 'turns' : c.turnStyle === 'turns' ? 'turns' : 'rounds';
    config.boardLength = [20, 30, 40].includes(Number(c.boardLength)) ? Number(c.boardLength) : 30;
    config.movement = c.movement === 'fixed' ? 'fixed' : 'dice';
    config.fixedSteps = clampInt(c.fixedSteps, 1, 6, 3);
    config.wrongPenalty = clampInt(c.wrongPenalty, 0, 2, 0);
    config.events = sanitizeFlags(c.events, SPUD_EVENTS);
    config.powerups = sanitizeFlags(c.powerups, POWERUPS);
    config.startWithPowerup = bool(c.startWithPowerup, false);
  }
  return config;
}

module.exports = { sanitizeRoomConfig, sanitizeTeams };
