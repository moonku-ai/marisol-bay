// Marisol Bay boot: read the URL params, build the game, and either play it or
// stage one deterministic screenshot scene (?shot=chase|street|mission|coast).
//
// Params: ?seed=N fixes the city layout. ?shot=<name> stages that scene instead
// of the title screen and sets window.__shotReady when painted. ?auto skips the
// title screen. ?god makes Rae invulnerable (testing only).
import { createGame } from './game.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;
const shot = params.get('shot');
const auto = params.has('auto');
const god = params.has('god');

const canvas = document.getElementById('scene');
const status = document.getElementById('status');
status.textContent = 'Marisol Bay. Start the story to play.';

const game = createGame(canvas, { seed, auto, god });
window.__marisol = game.G;

if (shot) {
  stageShot(shot, game);
  game.start();
} else {
  game.start();
}
