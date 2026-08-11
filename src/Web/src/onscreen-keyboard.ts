export const GAME_KEYS = Object.freeze({
  ArrowUp: { key: 'ArrowUp', keyCode: 38 },
  ArrowDown: { key: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { key: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { key: 'ArrowRight', keyCode: 39 },
  Enter: { key: 'Enter', keyCode: 13 },
  Escape: { key: 'Escape', keyCode: 27 },
} as const);

export type GameKeyCode = keyof typeof GAME_KEYS;

export function keyboardEventOptions(code: string): KeyboardEventInit & { keyCode: number; which: number } {
  if (!(code in GAME_KEYS))
    throw new Error(`Unsupported on-screen key: ${code}`);

  const gameCode = code as GameKeyCode;
  const definition = GAME_KEYS[gameCode];

  return {
    bubbles: true,
    cancelable: true,
    code: gameCode,
    key: definition.key,
    keyCode: definition.keyCode,
    which: definition.keyCode,
  };
}

interface HeldKey {
  button: HTMLElement;
  code: GameKeyCode;
}

export function bindOnscreenKeyboard(container: HTMLElement, target: HTMLElement) {
  const heldPointers = new Map<number, HeldKey>();
  const heldKeyCounts = new Map<GameKeyCode, number>();

  function dispatch(type: 'keydown' | 'keyup', code: GameKeyCode): void {
    target.dispatchEvent(new KeyboardEvent(type, keyboardEventOptions(code)));
  }

  function press(pointerId: number, button: HTMLElement): void {
    if (heldPointers.has(pointerId))
      return;

    const code = button.dataset.code;
    if (!code || !(code in GAME_KEYS))
      return;
    const gameCode = code as GameKeyCode;
    const count = heldKeyCounts.get(gameCode) ?? 0;
    heldPointers.set(pointerId, { button, code: gameCode });
    heldKeyCounts.set(gameCode, count + 1);
    button.dataset.pressed = 'true';
    if (count === 0)
      dispatch('keydown', gameCode);
  }

  function release(pointerId: number): void {
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

  function releaseAll(): void {
    for (const pointerId of [...heldPointers.keys()])
      release(pointerId);
  }

  for (const button of container.querySelectorAll<HTMLElement>('[data-code]')) {
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
