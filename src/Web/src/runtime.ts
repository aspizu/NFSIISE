import { cacheArchive, clearCachedArchive, getCachedArchive } from './archive-store.ts';
import { mountGameArchive } from './game-archive.ts';
import { startGamepadPolling } from './gamepad.ts';
import { bindOnscreenKeyboard } from './onscreen-keyboard.ts';
import type { ArchiveRecord } from './archive-store.ts';
import type { NfsModule, NfsModuleConfig } from './emscripten.ts';

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element)
    throw new Error(`Required element is missing: ${selector}`);
  return element;
}

const canvas = requireElement<HTMLCanvasElement>('#canvas');
const display = requireElement<HTMLCanvasElement>('#display');
const setup = requireElement<HTMLElement>('#setup');
const fullscreenButton = requireElement<HTMLButtonElement>('#fullscreen');
const fullscreenEnterIcon = requireElement<SVGElement>('#fullscreen-enter-icon');
const fullscreenExitIcon = requireElement<SVGElement>('#fullscreen-exit-icon');
const archiveInput = requireElement<HTMLInputElement>('#archive-input');
const chooseArchiveButton = requireElement<HTMLButtonElement>('#choose-archive');
const replaceArchiveButton = requireElement<HTMLButtonElement>('#replace-archive');
const startGameButton = requireElement<HTMLButtonElement>('#start-game');
const resolutionSelect = requireElement<HTMLElement>('#resolution');
const scalingSelect = requireElement<HTMLElement>('#scaling');
const onscreenKeyboardEnabled = requireElement<HTMLElement>('#onscreen-keyboard-enabled');
const onscreenKeyboard = requireElement<HTMLElement>('#onscreen-keyboard');
const archiveDetail = requireElement<HTMLElement>('#archive-detail');
const setupError = requireElement<HTMLElement>('#setup-error');
const status = requireElement<HTMLElement>('#status');

function require2dContext(canvasElement: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvasElement.getContext('2d', { alpha: false });
  if (!context)
    throw new Error('This browser does not support the 2D canvas API.');
  return context;
}

const displayContext = require2dContext(display);
const staging = document.createElement('canvas');
const stagingContext = require2dContext(staging);
const onscreenKeyboardController = bindOnscreenKeyboard(onscreenKeyboard, canvas);
const ESCAPE_HOLD_DURATION_MS = 800;

let archiveMounted = false;
let settingsLoaded = false;
let mountInProgress = false;
let failedMountNeedsReload = false;
let gameStarted = false;
let releaseStartupDependency: (() => void) | null = null;
let shownFrameSequence = 0;
let framePixels: Uint8ClampedArray<ArrayBuffer> | null = null;
let frameWidth = 0;
let frameHeight = 0;
let audioContext: AudioContext | null = null;
let audioProcessor: ScriptProcessorNode | null = null;
let audioReadFraction = 0;
let audioMemory: ArrayBufferLike | null = null;
let audioSamples: Int16Array | null = null;
let audioIndices: Uint32Array | null = null;
let escapeHoldTimer: ReturnType<typeof setTimeout> | null = null;

function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(unit === 'B' ? 0 : 1)} ${unit}`;
}

function setStatus(message: string): void {
  status.textContent = message;
}

function setError(message = ''): void {
  setupError.textContent = message;
}

function refreshFullscreenButton(): void {
  const active = Boolean(document.fullscreenElement);
  const label = active ? 'Exit full screen' : 'Enter full screen';
  fullscreenEnterIcon.toggleAttribute('hidden', active);
  fullscreenExitIcon.toggleAttribute('hidden', !active);
  fullscreenButton.setAttribute('aria-label', label);
  fullscreenButton.title = label;
  fullscreenButton.setAttribute('aria-pressed', String(active));
}

function resizeGameSurfaces(): void {
  if (!frameWidth || !frameHeight)
    return;

  const viewportWidth = window.visualViewport?.width ?? document.documentElement.clientWidth;
  const viewportHeight = window.visualViewport?.height ?? document.documentElement.clientHeight;
  const scale = Math.min(viewportWidth / frameWidth, viewportHeight / frameHeight);
  const width = `${frameWidth * scale}px`;
  const height = `${frameHeight * scale}px`;
  canvas.style.width = display.style.width = width;
  canvas.style.height = display.style.height = height;
}

function refreshScalingMethod(): void {
  display.dataset.scaling = scalingSelect.dataset.value ?? 'nearest';
}

function refreshOnscreenKeyboard(): void {
  const visible = gameStarted && onscreenKeyboardEnabled.dataset.state === 'checked';
  onscreenKeyboard.hidden = !visible;
  if (!visible)
    onscreenKeyboardController.releaseAll();
}

function setArchiveProgress(value: number, visible: boolean): void {
  window.dispatchEvent(new CustomEvent('nfs-archive-progress', {
    detail: { value, visible },
  }));
}

function fillAudioBuffer(event: AudioProcessingEvent): void {
  const left = event.outputBuffer.getChannelData(0);
  const right = event.outputBuffer.getChannelData(1);
  left.fill(0);
  right.fill(0);

  const module = globalThis.Module;
  const ringPointer = module._nfsWebAudioBuffer?.();
  const readPointer = module._nfsWebAudioReadIndex?.();
  const writePointer = module._nfsWebAudioWriteIndex?.();
  const capacity = module._nfsWebAudioCapacity?.();
  const sampleRate = module._nfsWebAudioSampleRate?.();
  if (!ringPointer || !readPointer || !writePointer || !capacity || !sampleRate)
    return;

  const memory = module.HEAPU8.buffer;
  if (audioMemory !== memory) {
    audioMemory = memory;
    audioSamples = new Int16Array(memory);
    audioIndices = new Uint32Array(memory);
  }
  if (!audioSamples || !audioIndices || !audioContext)
    return;

  let readIndex = Atomics.load(audioIndices, readPointer >>> 2);
  const rateRatio = sampleRate / audioContext.sampleRate;

  for (let outputIndex = 0; outputIndex < left.length; outputIndex += 1) {
    const writeIndex = Atomics.load(audioIndices, writePointer >>> 2);
    const available = (writeIndex - readIndex) >>> 0;
    if (available < 2)
      break;

    const firstFrame = readIndex % capacity;
    const secondFrame = (firstFrame + 1) % capacity;
    const firstSample = firstFrame * 2 + (ringPointer >>> 1);
    const secondSample = secondFrame * 2 + (ringPointer >>> 1);
    const mix = audioReadFraction;

    left[outputIndex] = (audioSamples[firstSample]! * (1 - mix) + audioSamples[secondSample]! * mix) / 32768;
    right[outputIndex] = (audioSamples[firstSample + 1]! * (1 - mix) + audioSamples[secondSample + 1]! * mix) / 32768;

    audioReadFraction += rateRatio;
    const consumedFrames = Math.floor(audioReadFraction);
    audioReadFraction -= consumedFrames;
    readIndex = (readIndex + consumedFrames) >>> 0;
  }

  Atomics.store(audioIndices, readPointer >>> 2, readIndex);
}

function startAudio(): void {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    setStatus('Sound is not supported by this browser.');
    return;
  }

  try {
    if (!audioContext) {
      audioContext = new AudioContextClass({ latencyHint: 'interactive' });
      audioProcessor = audioContext.createScriptProcessor(1024, 0, 2);
      audioProcessor.onaudioprocess = fillAudioBuffer;
      audioProcessor.connect(audioContext.destination);
    }
    void audioContext.resume().catch((error) => {
      console.error('Could not resume browser audio:', error);
      setStatus('Sound could not start. Reload and press Start game again.');
    });
  } catch (error) {
    console.error('Could not create browser audio:', error);
    setStatus('Sound is not available in this browser.');
  }
}

function refreshControls(): void {
  const ready = archiveMounted && settingsLoaded && !mountInProgress;
  startGameButton.disabled = !ready || gameStarted;
  chooseArchiveButton.disabled = mountInProgress;
  replaceArchiveButton.disabled = mountInProgress;
  replaceArchiveButton.hidden = !archiveMounted;
  chooseArchiveButton.hidden = archiveMounted;
}

function showWebFrame(): void {
  const frameSequence = globalThis.Module._nfsWebFrameSequence;
  const sequenceBefore = frameSequence?.();
  if (sequenceBefore && !(sequenceBefore & 1) && sequenceBefore !== shownFrameSequence) {
    const framePointer = globalThis.Module._nfsWebFrameBuffer();
    const width = globalThis.Module._nfsWebFrameWidth();
    const height = globalThis.Module._nfsWebFrameHeight();
    const size = width * height * 4;

    if (framePointer && size) {
      if (!framePixels || framePixels.length !== size)
        framePixels = new Uint8ClampedArray(size);
      framePixels.set(globalThis.Module.HEAPU8.subarray(framePointer, framePointer + size));

      const sequenceAfter = frameSequence!();
      if (sequenceBefore === sequenceAfter) {
        if (display.width !== width || display.height !== height) {
          display.width = staging.width = width;
          display.height = staging.height = height;
          frameWidth = width;
          frameHeight = height;
          resizeGameSurfaces();
        }
        stagingContext.putImageData(new ImageData(framePixels, width, height), 0, 0);
        displayContext.setTransform(1, 0, 0, -1, 0, height);
        displayContext.drawImage(staging, 0, 0);
        shownFrameSequence = sequenceAfter;
      }
    }
  }
  requestAnimationFrame(showWebFrame);
}

async function mountArchive(record: ArchiveRecord, shouldCache: boolean): Promise<void> {
  mountInProgress = true;
  setError();
  setArchiveProgress(0, true);
  archiveDetail.textContent = `Reading ${record.name} (${formatBytes(record.blob.size)})…`;
  refreshControls();

  try {
    const result = await mountGameArchive(record.blob, globalThis.Module.FS, (progress) => {
      setArchiveProgress(progress.archiveBytesRead / progress.archiveBytesTotal, true);
      archiveDetail.textContent = `Expanding ${record.name}: ${progress.mountedFiles} files`;
    });
    if (shouldCache)
      await cacheArchive(record);

    archiveMounted = true;
    setArchiveProgress(1, false);
    archiveDetail.textContent = formatBytes(result.mountedBytes);
    setStatus('');
  } catch (error) {
    failedMountNeedsReload = true;
    setArchiveProgress(0, false);
    archiveDetail.textContent = '';
    setError(error instanceof Error ? error.message : String(error));
    if (!shouldCache)
      await clearCachedArchive();
  } finally {
    mountInProgress = false;
    refreshControls();
  }
}

async function loadCachedArchive(): Promise<void> {
  try {
    const cached = await getCachedArchive();
    if (cached?.blob instanceof Blob) {
      await mountArchive(cached, false);
      return;
    }
    setStatus('');
  } catch (error) {
    setError(`Could not read the cached ZIP: ${error}`);
  }
  refreshControls();
}

async function handleArchiveSelection(file: File | undefined): Promise<void> {
  if (!file)
    return;
  if (!file.name.toLowerCase().endsWith('.zip')) {
    setError('Choose a .zip file.');
    return;
  }

  const record = {
    blob: file,
    lastModified: file.lastModified,
    name: file.name,
    savedAt: Date.now(),
    size: file.size,
  };

  if (archiveMounted || failedMountNeedsReload) {
    await cacheArchive(record);
    location.reload();
    return;
  }
  await mountArchive(record, true);
}

function initializeFileSystems(module: NfsModule): void {
  const FS = module.FS;
  const startupDependency = 'nfs2se-web-startup';
  module.addRunDependency(startupDependency);
  releaseStartupDependency = () => module.removeRunDependency(startupDependency);

  const settingsPath = '/home/web_user/.nfs2se';
  FS.mkdirTree(settingsPath);
  FS.mount(module.IDBFS, { autoPersist: true }, settingsPath);
  FS.syncfs(true, (error) => {
    if (error)
      console.error('Could not load saved NFSIISE settings:', error);
    settingsLoaded = true;
    refreshControls();
  });

  void loadCachedArchive();
}

globalThis.Module = {
  canvas,
  locateFile(path: string) {
    return new URL(`./game/${path}`, document.baseURI).href;
  },
  preRun: [initializeFileSystems],
  print: console.log,
  printErr: console.error,
  setStatus,
  monitorRunDependencies(left: number) {
    if (!archiveMounted && !mountInProgress)
      setStatus(left ? `Loading WebAssembly… (${left})` : '');
  },
  onRuntimeInitialized() {
    setStatus('');
    startGamepadPolling(globalThis.Module);
    requestAnimationFrame(showWebFrame);
  },
  onAbort(reason: unknown) {
    setError(`The game stopped: ${reason}`);
    onscreenKeyboard.hidden = true;
    onscreenKeyboardController.releaseAll();
    setup.hidden = false;
  },
} as NfsModule & NfsModuleConfig;

chooseArchiveButton.addEventListener('click', () => archiveInput.click());
replaceArchiveButton.addEventListener('click', () => archiveInput.click());
archiveInput.addEventListener('change', () => {
  void handleArchiveSelection(archiveInput.files?.[0]);
  archiveInput.value = '';
});
startGameButton.addEventListener('click', () => {
  if (!archiveMounted || !settingsLoaded || !releaseStartupDependency)
    return;

  const [width = 0, height = 0] = (resolutionSelect.dataset.value ?? '').split('x').map(Number);
  if (globalThis.Module._nfsWebSetResolution?.(width, height) !== 1) {
    setError('Could not set the selected resolution.');
    return;
  }

  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width / pixelRatio}px`;
  canvas.style.height = `${height / pixelRatio}px`;

  gameStarted = true;
  startAudio();
  setup.hidden = true;
  refreshOnscreenKeyboard();
  canvas.focus();
  releaseStartupDependency();
  releaseStartupDependency = null;
  refreshControls();
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
fullscreenButton.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement)
      await document.exitFullscreen();
    else {
      await document.documentElement.requestFullscreen();
      try {
        await navigator.keyboard?.lock(['Escape']);
      } catch (error) {
        console.warn('Could not lock Escape in full screen:', error);
      }
    }
  } catch (error) {
    setError(`Could not enter full screen: ${error}`);
  }
});

function clearEscapeHold(): void {
  if (escapeHoldTimer === null)
    return;
  clearTimeout(escapeHoldTimer);
  escapeHoldTimer = null;
}

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Escape' || event.repeat || !document.fullscreenElement || escapeHoldTimer !== null)
    return;

  escapeHoldTimer = setTimeout(() => {
    escapeHoldTimer = null;
    void document.exitFullscreen().catch((error) => setError(`Could not exit full screen: ${error}`));
  }, ESCAPE_HOLD_DURATION_MS);
});
document.addEventListener('keyup', (event) => {
  if (event.code === 'Escape')
    clearEscapeHold();
});
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    clearEscapeHold();
    navigator.keyboard?.unlock();
  }
  refreshFullscreenButton();
});
window.addEventListener('resize', resizeGameSurfaces);
window.visualViewport?.addEventListener('resize', resizeGameSurfaces);
window.addEventListener('error', (event) => setError(event.message || 'The game stopped with an error.'));
window.addEventListener('nfs-scaling-change', refreshScalingMethod);
window.addEventListener('nfs-onscreen-keyboard-change', refreshOnscreenKeyboard);

if (!document.fullscreenEnabled)
  fullscreenButton.hidden = true;
refreshFullscreenButton();
refreshScalingMethod();

if (!crossOriginIsolated) {
  setError('This site needs Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers for WebAssembly threads.');
  setStatus('Host headers are missing');
} else {
  const runtimeScript = document.createElement('script');
  runtimeScript.src = new URL('./game/nfs2se.js', document.baseURI).href;
  runtimeScript.onerror = () => setError('Could not load the WebAssembly runtime. Run ./compile_nfs web first.');
  document.body.append(runtimeScript);
}
