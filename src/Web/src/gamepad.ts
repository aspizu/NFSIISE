const SLOT_COUNT = 2;
const AXIS_COUNT = 6;
const STATE_WORDS = 11;
const STANDARD_MAPPING_FLAG = 1;

type GamepadButtonLike = Pick<GamepadButton, 'pressed' | 'value'>;

export interface GamepadLike {
  axes: readonly number[];
  buttons: readonly GamepadButtonLike[];
  connected: boolean;
  index: number;
  mapping: string;
}

interface GamepadState {
  connected: number;
  axes: Int32Array;
  buttons: number;
  dpad: number;
  flags: number;
}

type GamepadModule = Pick<NfsModule, 'HEAPU8' | '_nfsWebGamepadStateBuffer' | '_nfsWebGamepadStateWords'>;

function pressed(button: GamepadButtonLike | undefined): boolean {
  return Boolean(button?.pressed || Number(button?.value) > 0.5);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function axisToInt16(value: number | undefined): number {
  const normalized = clamp(typeof value === 'number' && Number.isFinite(value) ? value : 0, -1, 1);
  return normalized === -1 ? -32768 : Math.round(normalized * 32767);
}

export function triggerToInt16(value: number | undefined): number {
  const normalized = clamp(typeof value === 'number' && Number.isFinite(value) ? value : 0, 0, 1);
  return Math.round(normalized * 65535 - 32768);
}

export function mapGamepad(gamepad: GamepadLike): GamepadState {
  const axes = new Int32Array(AXIS_COUNT);
  const standardMapping = gamepad.mapping === 'standard';
  const sourceAxes = gamepad.axes ?? [];
  const sourceButtons = gamepad.buttons ?? [];
  let buttons = 0;
  let dpad = 0;

  const directAxisCount = standardMapping ? 4 : AXIS_COUNT;
  for (let index = 0; index < directAxisCount; index += 1)
    axes[index] = axisToInt16(sourceAxes[index]);

  if (standardMapping) {
    axes[4] = triggerToInt16(sourceButtons[6]?.value);
    axes[5] = triggerToInt16(sourceButtons[7]?.value);
  }

  for (let index = 0; index < Math.min(sourceButtons.length, 32); index += 1) {
    if (pressed(sourceButtons[index]))
      buttons |= (1 << index);
  }

  if (standardMapping) {
    if (pressed(sourceButtons[15])) dpad |= 1 << 0; // Right
    if (pressed(sourceButtons[14])) dpad |= 1 << 1; // Left
    if (pressed(sourceButtons[13])) dpad |= 1 << 2; // Down
    if (pressed(sourceButtons[12])) dpad |= 1 << 3; // Up
  }

  return {
    connected: 1,
    axes,
    buttons: buttons >>> 0,
    dpad,
    flags: standardMapping ? STANDARD_MAPPING_FLAG : 0,
  };
}

function disconnectedState(): GamepadState {
  return {
    connected: 0,
    axes: new Int32Array(AXIS_COUNT),
    buttons: 0,
    dpad: 0,
    flags: 0,
  };
}

export function createGamepadPoller(
  module: GamepadModule,
  getGamepads: () => ArrayLike<GamepadLike | null> = () => navigator.getGamepads(),
) {
  const statePointer = module._nfsWebGamepadStateBuffer?.() ?? 0;
  const stateWords = module._nfsWebGamepadStateWords?.() ?? 0;
  if (!statePointer || stateWords < STATE_WORDS)
    throw new Error('The WebAssembly gamepad bridge is not available.');

  const slots: Array<number | null> = new Array(SLOT_COUNT).fill(null);
  let memory: SharedArrayBuffer | null = null;
  let words: Int32Array<SharedArrayBuffer> | null = null;

  function refreshMemoryView(): void {
    const nextMemory = module.HEAPU8.buffer;
    if (memory === nextMemory)
      return;
    if (!(nextMemory instanceof SharedArrayBuffer))
      throw new Error('The gamepad bridge needs shared WebAssembly memory.');
    memory = nextMemory;
    words = new Int32Array(memory);
  }

  function writeSlot(slot: number, state: GamepadState): void {
    refreshMemoryView();
    if (!words)
      throw new Error('The gamepad memory view is unavailable.');
    const offset = (statePointer >>> 2) + slot * stateWords;
    const sequence = (Atomics.load(words, offset) + 1) | 1;

    Atomics.store(words, offset, sequence);
    Atomics.store(words, offset + 1, state.connected);
    for (let index = 0; index < AXIS_COUNT; index += 1)
      Atomics.store(words, offset + 2 + index, state.axes[index]!);
    Atomics.store(words, offset + 8, state.buttons | 0);
    Atomics.store(words, offset + 9, state.dpad);
    Atomics.store(words, offset + 10, state.flags);
    Atomics.store(words, offset, sequence + 1);
  }

  function reset(): void {
    slots.fill(null);
    for (let slot = 0; slot < SLOT_COUNT; slot += 1)
      writeSlot(slot, disconnectedState());
  }

  function poll(): void {
    let gamepads: GamepadLike[];
    try {
      gamepads = Array.from(getGamepads() ?? []).filter(
        (gamepad): gamepad is GamepadLike => Boolean(gamepad) && gamepad?.connected !== false,
      );
    } catch {
      gamepads = [];
    }

    const byIndex = new Map(gamepads.map((gamepad) => [gamepad.index, gamepad]));
    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      const currentIndex = slots[slot] ?? null;
      if (currentIndex !== null && !byIndex.has(currentIndex))
        slots[slot] = null;
    }

    for (const gamepad of gamepads) {
      if (slots.includes(gamepad.index))
        continue;
      const emptySlot = slots.indexOf(null);
      if (emptySlot === -1)
        break;
      slots[emptySlot] = gamepad.index;
    }

    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      const currentIndex = slots[slot] ?? null;
      const gamepad = currentIndex === null ? null : byIndex.get(currentIndex);
      writeSlot(slot, gamepad ? mapGamepad(gamepad) : disconnectedState());
    }
  }

  return { poll, reset };
}

export function startGamepadPolling(module: GamepadModule): () => void {
  const poller = createGamepadPoller(module);
  let active = true;
  let animationFrame = 0;

  function tick(): void {
    if (!active)
      return;
    poller.poll();
    animationFrame = requestAnimationFrame(tick);
  }

  function handleVisibilityChange(): void {
    if (document.hidden)
      poller.reset();
    else
      poller.poll();
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('gamepaddisconnected', poller.poll);
  tick();

  return () => {
    active = false;
    cancelAnimationFrame(animationFrame);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('gamepaddisconnected', poller.poll);
    poller.reset();
  };
}
import type { NfsModule } from './emscripten.ts';
