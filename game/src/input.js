// Input handling — keyboard + mouse with pointer lock.
// Minimal by design: one source of truth, blur clears every key (no lost-keyup bugs).

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { dx: 0, dy: 0, down: false, clicked: false };
  let locked = false;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onBlur() { keys.clear(); mouse.down = false; }
  function onMouseMove(e) {
    if (!locked) return;
    mouse.dx += e.movementX || 0;
    mouse.dy += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (e.target !== canvas) return; // clicks on buttons/menus are not gunfire
    if (e.button === 0) { mouse.down = true; mouse.clicked = true; }
  }
  function onMouseUp(e) { if (e.target !== canvas) return; if (e.button === 0) mouse.down = false; }
  function onLockChange() { locked = document.pointerLockElement === canvas; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('click', () => { if (!locked) canvas.requestPointerLock?.(); });

  return {
    keys, mouse,
    isLocked() { return locked; },
    has(code) { return keys.has(code); },
    pressed(code) { const hit = keys.has(code); if (hit) keys.delete(code); return hit; },
    consumeMouse() { const d = { dx: mouse.dx, dy: mouse.dy }; mouse.dx = 0; mouse.dy = 0; return d; },
    consumeClick() { const c = mouse.clicked; mouse.clicked = false; return c; },
    requestLock() {
      try {
        const p = canvas.requestPointerLock?.();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch { /* pointer lock needs a user gesture; the game still plays */ }
    },
    releaseLock() { if (locked) document.exitPointerLock?.(); },
  };
}
