import assert from 'node:assert/strict';
import test from 'node:test';
import { bindOnscreenKeyboard, GAME_KEYS, keyboardEventOptions } from './onscreen-keyboard.ts';

test('exposes only the keys needed to navigate and drive', () => {
  assert.deepEqual(Object.keys(GAME_KEYS).sort(), [
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'Enter',
    'Escape',
  ]);
});

test('maps on-screen keys to browser keyboard event fields', () => {
  assert.deepEqual(keyboardEventOptions('ArrowLeft'), {
    bubbles: true,
    cancelable: true,
    code: 'ArrowLeft',
    key: 'ArrowLeft',
    keyCode: 37,
    which: 37,
  });
  assert.equal(keyboardEventOptions('Enter').keyCode, 13);
  assert.equal(keyboardEventOptions('Escape').keyCode, 27);
});

test('rejects keys outside the compact game controls', () => {
  assert.throws(() => keyboardEventOptions('KeyQ'), /Unsupported on-screen key/);
});

test('holds simultaneous touch keys and releases them safely', () => {
  const listeners = new Map<string, (event: PointerEvent) => void>();
  const makeButton = (code: string) => ({
    dataset: { code, pressed: undefined as string | undefined },
    addEventListener(type: string, listener: (event: PointerEvent) => void) {
      listeners.set(`${code}:${type}`, listener);
    },
    setPointerCapture() {},
  });
  const up = makeButton('ArrowUp');
  const left = makeButton('ArrowLeft');
  const container = {
    addEventListener() {},
    querySelectorAll() {
      return [up, left];
    },
  };
  const dispatched: Array<[string, string]> = [];
  const target = {
    dispatchEvent(event: KeyboardEvent) {
      dispatched.push([event.type, event.code]);
    },
    focus() {},
  };

  const originalDocument = globalThis.document;
  const originalKeyboardEvent = globalThis.KeyboardEvent;
  const originalWindow = globalThis.window;
  globalThis.document = { addEventListener() {} } as unknown as Document;
  globalThis.KeyboardEvent = class {
    type: string;
    code = '';

    constructor(type: string, options: KeyboardEventInit) {
      this.type = type;
      Object.assign(this, options);
    }
  } as unknown as typeof KeyboardEvent;
  globalThis.window = { addEventListener() {} } as unknown as Window & typeof globalThis;

  try {
    const keyboard = bindOnscreenKeyboard(container as unknown as HTMLElement, target as unknown as HTMLElement);
    const pointerEvent = (pointerId: number) => ({ pointerId, preventDefault() {} }) as PointerEvent;
    listeners.get('ArrowUp:pointerdown')?.(pointerEvent(1));
    listeners.get('ArrowLeft:pointerdown')?.(pointerEvent(2));
    assert.deepEqual(dispatched, [
      ['keydown', 'ArrowUp'],
      ['keydown', 'ArrowLeft'],
    ]);
    assert.equal(up.dataset.pressed, 'true');
    assert.equal(left.dataset.pressed, 'true');

    keyboard.releaseAll();
    assert.deepEqual(dispatched.slice(2), [
      ['keyup', 'ArrowUp'],
      ['keyup', 'ArrowLeft'],
    ]);
    assert.equal(up.dataset.pressed, 'false');
    assert.equal(left.dataset.pressed, 'false');
  } finally {
    globalThis.document = originalDocument;
    globalThis.KeyboardEvent = originalKeyboardEvent;
    globalThis.window = originalWindow;
  }
});
