import './style.css';
import { cacheArchive, clearCachedArchive, getCachedArchive } from './archive-store.js';
import { mountGameArchive } from './game-archive.js';

const canvas = document.querySelector('#canvas');
const display = document.querySelector('#display');
const setup = document.querySelector('#setup');
const fullscreenButton = document.querySelector('#fullscreen');
const archiveInput = document.querySelector('#archive-input');
const chooseArchiveButton = document.querySelector('#choose-archive');
const replaceArchiveButton = document.querySelector('#replace-archive');
const startGameButton = document.querySelector('#start-game');
const resolutionSelect = document.querySelector('#resolution');
const archiveDetail = document.querySelector('#archive-detail');
const archiveProgress = document.querySelector('#archive-progress');
const setupError = document.querySelector('#setup-error');
const status = document.querySelector('#status');

const displayContext = display.getContext('2d', { alpha: false });
const staging = document.createElement('canvas');
const stagingContext = staging.getContext('2d', { alpha: false });

let archiveMounted = false;
let settingsLoaded = false;
let mountInProgress = false;
let failedMountNeedsReload = false;
let gameStarted = false;
let releaseStartupDependency = null;
let shownFrameSequence = 0;
let framePixels = null;
let audioContext = null;
let audioProcessor = null;
let audioReadFraction = 0;
let audioMemory = null;
let audioSamples = null;
let audioIndices = null;

function formatBytes(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(unit === 'B' ? 0 : 1)} ${unit}`;
}

function setStatus(message) {
  status.textContent = message;
}

function setError(message = '') {
  setupError.textContent = message;
}

function refreshFullscreenButton() {
  const active = Boolean(document.fullscreenElement);
  fullscreenButton.textContent = active ? 'Exit full screen' : 'Full screen';
  fullscreenButton.setAttribute('aria-pressed', String(active));
}

function fillAudioBuffer(event) {
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

    left[outputIndex] = (audioSamples[firstSample] * (1 - mix) + audioSamples[secondSample] * mix) / 32768;
    right[outputIndex] = (audioSamples[firstSample + 1] * (1 - mix) + audioSamples[secondSample + 1] * mix) / 32768;

    audioReadFraction += rateRatio;
    const consumedFrames = Math.floor(audioReadFraction);
    audioReadFraction -= consumedFrames;
    readIndex = (readIndex + consumedFrames) >>> 0;
  }

  Atomics.store(audioIndices, readPointer >>> 2, readIndex);
}

function startAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    setStatus('Sound is not supported by this browser.');
    return;
  }

  try {
    if (!audioContext) {
      audioContext = new AudioContext({ latencyHint: 'interactive' });
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

function refreshControls() {
  const ready = archiveMounted && settingsLoaded && !mountInProgress;
  startGameButton.disabled = !ready || gameStarted;
  chooseArchiveButton.disabled = mountInProgress;
  replaceArchiveButton.disabled = mountInProgress;
  replaceArchiveButton.hidden = !archiveMounted;
  chooseArchiveButton.hidden = archiveMounted;
}

function showWebFrame() {
  const sequenceBefore = globalThis.Module._nfsWebFrameSequence?.();
  if (sequenceBefore && !(sequenceBefore & 1) && sequenceBefore !== shownFrameSequence) {
    const framePointer = globalThis.Module._nfsWebFrameBuffer();
    const width = globalThis.Module._nfsWebFrameWidth();
    const height = globalThis.Module._nfsWebFrameHeight();
    const size = width * height * 4;

    if (framePointer && size) {
      if (!framePixels || framePixels.length !== size)
        framePixels = new Uint8ClampedArray(size);
      framePixels.set(globalThis.Module.HEAPU8.subarray(framePointer, framePointer + size));

      const sequenceAfter = globalThis.Module._nfsWebFrameSequence();
      if (sequenceBefore === sequenceAfter) {
        if (display.width !== width || display.height !== height) {
          display.width = staging.width = width;
          display.height = staging.height = height;
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

async function mountArchive(record, shouldCache) {
  mountInProgress = true;
  setError();
  archiveProgress.hidden = false;
  archiveProgress.value = 0;
  archiveDetail.textContent = `Reading ${record.name} (${formatBytes(record.blob.size)})…`;
  refreshControls();

  try {
    const result = await mountGameArchive(record.blob, globalThis.Module.FS, (progress) => {
      archiveProgress.value = progress.archiveBytesRead / progress.archiveBytesTotal;
      archiveDetail.textContent = `Expanding ${record.name}: ${progress.mountedFiles} files`;
    });
    if (shouldCache)
      await cacheArchive(record);

    archiveMounted = true;
    archiveProgress.value = 1;
    archiveProgress.hidden = true;
    archiveDetail.textContent = `${record.name}: ${result.mountedFiles} files, ${formatBytes(result.mountedBytes)} ready`;
    setStatus('');
  } catch (error) {
    failedMountNeedsReload = true;
    archiveProgress.hidden = true;
    archiveDetail.textContent = '';
    setError(error instanceof Error ? error.message : String(error));
    if (!shouldCache)
      await clearCachedArchive();
  } finally {
    mountInProgress = false;
    refreshControls();
  }
}

async function loadCachedArchive() {
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

async function handleArchiveSelection(file) {
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

function initializeFileSystems(module) {
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
  locateFile(path) {
    return new URL(`./game/${path}`, document.baseURI).href;
  },
  preRun: [initializeFileSystems],
  print: console.log,
  printErr: console.error,
  setStatus,
  monitorRunDependencies(left) {
    if (!archiveMounted && !mountInProgress)
      setStatus(left ? `Loading WebAssembly… (${left})` : '');
  },
  onRuntimeInitialized() {
    setStatus('');
    requestAnimationFrame(showWebFrame);
  },
  onAbort(reason) {
    setError(`The game stopped: ${reason}`);
    setup.hidden = false;
  },
};

chooseArchiveButton.addEventListener('click', () => archiveInput.click());
replaceArchiveButton.addEventListener('click', () => archiveInput.click());
archiveInput.addEventListener('change', () => {
  void handleArchiveSelection(archiveInput.files?.[0]);
  archiveInput.value = '';
});
startGameButton.addEventListener('click', () => {
  if (!archiveMounted || !settingsLoaded || !releaseStartupDependency)
    return;

  const [width, height] = resolutionSelect.value.split('x').map(Number);
  if (globalThis.Module._nfsWebSetResolution?.(width, height) !== 1) {
    setError('Could not set the selected resolution.');
    return;
  }

  gameStarted = true;
  startAudio();
  setup.hidden = true;
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
    else
      await document.documentElement.requestFullscreen();
  } catch (error) {
    setError(`Could not enter full screen: ${error}`);
  }
});
document.addEventListener('fullscreenchange', refreshFullscreenButton);
window.addEventListener('error', (event) => setError(event.message || 'The game stopped with an error.'));

if (!document.fullscreenEnabled)
  fullscreenButton.hidden = true;
refreshFullscreenButton();

if (!crossOriginIsolated) {
  setError('This site needs Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers for WebAssembly threads.');
  setStatus('Host headers are missing');
} else {
  const runtimeScript = document.createElement('script');
  runtimeScript.src = new URL('./game/nfs2se.js', document.baseURI).href;
  runtimeScript.onerror = () => setError('Could not load the WebAssembly runtime. Run ./compile_nfs web first.');
  document.body.append(runtimeScript);
}
