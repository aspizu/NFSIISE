import assert from 'node:assert/strict';
import test from 'node:test';
import { axisToInt16, createGamepadPoller, mapGamepad, triggerToInt16 } from './gamepad.js';

function button(value = 0, isPressed = value > 0.5) {
  return { pressed: isPressed, value };
}

function gamepad(index, { axes = [], buttons = [], mapping = 'standard' } = {}) {
  return { axes, buttons, connected: true, index, mapping };
}

function testModule() {
  const buffer = new SharedArrayBuffer(1024);
  return {
    HEAPU8: new Uint8Array(buffer),
    _nfsWebGamepadStateBuffer: () => 64,
    _nfsWebGamepadStateWords: () => 11,
  };
}

function readSlot(module, slot) {
  const words = new Int32Array(module.HEAPU8.buffer);
  const offset = (64 >>> 2) + slot * 11;
  return {
    sequence: Atomics.load(words, offset),
    connected: Atomics.load(words, offset + 1),
    axes: Array.from({ length: 6 }, (_, index) => Atomics.load(words, offset + 2 + index)),
    buttons: Atomics.load(words, offset + 8) >>> 0,
    dpad: Atomics.load(words, offset + 9),
    flags: Atomics.load(words, offset + 10),
  };
}

test('maps the standard gamepad layout to DirectInput values', () => {
  const buttons = Array.from({ length: 17 }, () => button());
  buttons[0] = button(1);
  buttons[6] = button(0.25, false);
  buttons[7] = button(1);
  buttons[12] = button(1);
  buttons[15] = button(1);

  const state = mapGamepad(gamepad(3, {
    axes: [-1, 0.25, 1, -0.5],
    buttons,
  }));

  assert.deepEqual(Array.from(state.axes), [
    axisToInt16(-1),
    axisToInt16(0.25),
    axisToInt16(1),
    axisToInt16(-0.5),
    triggerToInt16(0.25),
    triggerToInt16(1),
  ]);
  assert.equal(state.buttons, (1 | (1 << 7) | (1 << 12) | (1 << 15)) >>> 0);
  assert.equal(state.dpad, (1 << 0) | (1 << 3));
  assert.equal(state.flags, 1);
});

test('keeps two stable slots and clears lost pads', () => {
  const module = testModule();
  let pads = [
    gamepad(4, { axes: [-1] }),
    gamepad(9, { axes: [0.5] }),
  ];
  const poller = createGamepadPoller(module, () => pads);

  poller.poll();
  assert.equal(readSlot(module, 0).axes[0], axisToInt16(-1));
  assert.equal(readSlot(module, 1).axes[0], axisToInt16(0.5));

  pads = [gamepad(9, { axes: [0.75] })];
  poller.poll();
  assert.equal(readSlot(module, 0).connected, 0);
  assert.equal(readSlot(module, 1).axes[0], axisToInt16(0.75));

  pads = [
    gamepad(2, { axes: [-0.25] }),
    gamepad(9, { axes: [1] }),
  ];
  poller.poll();
  assert.equal(readSlot(module, 0).axes[0], axisToInt16(-0.25));
  assert.equal(readSlot(module, 1).axes[0], axisToInt16(1));

  poller.reset();
  assert.equal(readSlot(module, 0).connected, 0);
  assert.equal(readSlot(module, 1).connected, 0);
  assert.equal(readSlot(module, 0).sequence & 1, 0);
});

test('passes through six raw axes and raw buttons for non-standard pads', () => {
  const state = mapGamepad(gamepad(1, {
    axes: [-1, -0.5, 0, 0.5, 1, 2],
    buttons: [button(), button(0.8, false)],
    mapping: '',
  }));

  assert.deepEqual(Array.from(state.axes), [-32768, -16383, 0, 16384, 32767, 32767]);
  assert.equal(state.buttons, 1 << 1);
  assert.equal(state.dpad, 0);
  assert.equal(state.flags, 0);
});
