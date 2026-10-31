// Reproduz no tabuleiro a sequência de acontecimentos calculada pelo servidor.
import { sleep } from '../lib/dom.js';
import { sfx } from '../lib/sound.js';
import { showDice, showRoulette, showBanner, confetti, POWERUPS, SPUD_EVENTS } from './overlays.js';

export async function runSteps(board, fxHost, resolution, nameOf) {
  const steps = resolution.steps || [];
  const actors = new Set(steps.map((s) => s.competitorId));
  const fast = actors.size > 4; // muitos participantes: animação mais curta
  const bannerMs = fast ? 900 : 1500;
  board.setPositions(resolution.start || {}, false);
  await sleep(50);

  for (const s of steps) {
    const who = nameOf(s.competitorId);
    switch (s.type) {
      case 'doubled':
        sfx.power();
        await showBanner(fxHost, `✖️2 ${who} dobrou os pontos: +${s.points}!`, 'power', bannerMs);
        break;
      case 'dice':
        if (fast) board.flash(s.competitorId, 'bounce', 600);
        else await showDice(fxHost, s.value, who);
        break;
      case 'boost':
        sfx.power();
        await showBanner(fxHost, `⚡ Speed Boost! ${who} anda +${s.extra} casas`, 'power', bannerMs);
        break;
      case 'move':
        if (fast) {
          board.setPositions({ [s.competitorId]: s.to });
          board.flash(s.competitorId, 'hop', 400);
          sfx.hop();
          await sleep(180);
        } else {
          await board.walk(s.competitorId, s.from, s.to);
        }
        break;
      case 'finish':
        sfx.fanfare();
        board.flash(s.competitorId, 'cheer', 2400);
        confetti(fxHost);
        await showBanner(fxHost, `🏁 ${who} cruzou a linha de chegada!`, 'win', 2200);
        break;
      case 'wrong':
        sfx.wrong();
        board.flash(s.competitorId, 'sad', 900);
        if (!fast) await showBanner(fxHost, `❌ ${who} errou e volta ${s.from - s.to} casa${s.from - s.to > 1 ? 's' : ''}`, 'bad', 1100);
        if (fast) board.setPositions({ [s.competitorId]: s.to });
        else await board.walk(s.competitorId, s.from, s.to);
        break;
      case 'miss':
        board.flash(s.competitorId, 'sad', 900);
        if (!fast && actors.size === 1) {
          sfx.wrong();
          await showBanner(fxHost, `😕 ${who} não acertou desta vez`, 'bad', 1100);
        }
        break;
      case 'danger':
        sfx.danger();
        board.highlightTile(s.from, 'pulse-danger');
        board.flash(s.competitorId, 'shake', 700);
        await showBanner(fxHost, `⚠️ Casa de perigo! ${who} volta ${s.amount} casas`, 'bad', bannerMs);
        await board.walk(s.competitorId, s.from, s.to);
        break;
      case 'roulette':
        await showRoulette(fxHost, s.options, s.event, who);
        break;
      case 'gift':
        sfx.power();
        board.flash(s.competitorId, 'bounce', 700);
        await showBanner(fxHost, `🎁 ${who} ganhou ${POWERUPS[s.powerup].icon} ${POWERUPS[s.powerup].label}!`, 'power', bannerMs);
        break;
      case 'gift_full':
        await showBanner(fxHost, `🎁 ${who} já tem 3 poderes guardados`, 'info', bannerMs);
        break;
      case 'shield':
        sfx.shield();
        board.flash(s.competitorId, 'shielded', 1200);
        await showBanner(fxHost, `🛡️ O escudo protegeu ${who}!`, 'power', bannerMs);
        break;
      case 'skip':
        sfx.wrong();
        await showBanner(fxHost, `😴 ${who} vai perder a próxima vez`, 'bad', bannerMs);
        break;
      case 'points':
        sfx.correct();
        await showBanner(fxHost, `💎 ${who} ganhou +${s.points} pontos!`, 'good', bannerMs);
        break;
      case 'swap':
        sfx.swap();
        await showBanner(fxHost, `🔄 ${who} trocou de lugar com ${nameOf(s.targetId)}!`, 'power', bannerMs);
        board.flash(s.competitorId, 'spin', 800);
        board.flash(s.targetId, 'spin', 800);
        break;
      case 'shuffle':
        sfx.swap();
        await showBanner(fxHost, `🌪️ Todo mundo trocou de lugar!`, 'power', bannerMs);
        break;
      case 'power': {
        const p = POWERUPS[s.powerup];
        sfx.power();
        board.flash(s.competitorId, 'bounce', 700);
        await showBanner(fxHost, `${p.icon} ${who} usou ${p.label}!`, 'power', bannerMs);
        break;
      }
      case 'nothing':
        await showBanner(fxHost, `Ninguém para trocar de lugar.`, 'info', 900);
        break;
      default:
        break;
    }
    board.setPositions(s.positions || {});
    if (['swap', 'shuffle'].includes(s.type)) await sleep(600);
  }
}

export { SPUD_EVENTS };
