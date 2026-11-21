// Screenshot scenes behind ?shot=chase|street|mission|coast (with &seed=N).
// Each one plays the real game forward from a fresh start, so the frame is what
// a short game really looks like — and the same seed always gives the same frame.

export const SHOT_NAMES = ['chase', 'street', 'mission', 'coast'];

export function stageShot(name, game) {
  const shot = SHOT_NAMES.includes(name) ? name : 'street';
  game.stageShot(shot);
  return shot;
}
