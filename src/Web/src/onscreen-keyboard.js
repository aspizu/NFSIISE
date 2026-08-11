export const GAME_KEYS = Object.freeze({
  ArrowUp: { key: 'ArrowUp', keyCode: 38 },
  ArrowDown: { key: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { key: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { key: 'ArrowRight', keyCode: 39 },
  Enter: { key: 'Enter', keyCode: 13 },
  Escape: { key: 'Escape', keyCode: 27 },
});

export function keyboardEventOptions(code) {
  const definition = GAME_KEYS[code];
  if (!definition)
    throw new Error(`Unsupported on-screen key: ${code}`);

  return {
    bubbles: true,
    cancelable: true,
    code,
    key: definition.key,
    keyCode: definition.keyCode,
    which: definition.keyCode,
  };
}

export function bindOnscreenKeyboard(container, target) {
  const heldPointers = new Map();
  const heldKeyCounts = new Map();

  function dispatch(type, code) {
    target.dispatchEvent(new KeyboardEvent(type, keyboardEventOptions(code)));
  }

  function press(pointerId, button) {
    if (heldPointers.has(pointerId))
      return;

    const code = button.dataset.code;
    const count = heldKeyCounts.get(code) ?? 0;
    heldPointers.set(pointerId, { button, code });
    heldKeyCounts.set(code, count + 1);
    button.dataset.pressed = 'true';
    if (count === 0)
      dispatch('keydown', code);
  }

  function release(pointerId) {
    const held = heldPointers.get(pointerId);
    if (!held)
      return;

    heldPointers.delete(pointerId);
    const count = (heldKeyCounts.get(held.code) ?? 1) - 1;
    if (count === 0) {
      heldKeyCounts.delete(held.code);
      held.button.dataset.pressed = 'false';
      dispatch('keyup', held.code);
    } else {
      heldKeyCounts.set(held.code, count);
    }
  }

  function releaseAll() {
    for (const pointerId of [...heldPointers.keys()])
      release(pointerId);
  }

  for (const button of container.querySelectorAll('[data-code]')) {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      target.focus({ preventScroll: true });
      button.setPointerCapture?.(event.pointerId);
      press(event.pointerId, button);
    });
    button.addEventListener('pointerup', (event) => release(event.pointerId));
    button.addEventListener('pointercancel', (event) => release(event.pointerId));
    button.addEventListener('lostpointercapture', (event) => release(event.pointerId));
  }

  container.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden)
      releaseAll();
  });

  return { releaseAll };
}
