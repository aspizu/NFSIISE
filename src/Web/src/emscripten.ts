export interface EmscriptenFileSystem {
  createDataFile(parent: string, name: string, contents: Uint8Array, canRead: boolean, canWrite: boolean, canOwn: boolean): void;
  mkdirTree(path: string): void;
  mount(fileSystem: unknown, options: Record<string, unknown>, mountpoint: string): void;
  syncfs(populate: boolean, callback: (error: unknown) => void): void;
}

export interface NfsModule {
  FS: EmscriptenFileSystem;
  HEAPU8: Uint8Array;
  IDBFS: unknown;
  addRunDependency(dependency: string): void;
  removeRunDependency(dependency: string): void;
  _nfsWebAudioBuffer?(): number;
  _nfsWebAudioCapacity?(): number;
  _nfsWebAudioReadIndex?(): number;
  _nfsWebAudioSampleRate?(): number;
  _nfsWebAudioWriteIndex?(): number;
  _nfsWebFrameBuffer(): number;
  _nfsWebFrameHeight(): number;
  _nfsWebFrameSequence?(): number;
  _nfsWebFrameWidth(): number;
  _nfsWebGamepadStateBuffer?(): number;
  _nfsWebGamepadStateWords?(): number;
  _nfsWebSetResolution?(width: number, height: number): number;
}

export interface NfsModuleConfig extends Partial<NfsModule> {
  canvas: HTMLCanvasElement;
  locateFile(path: string): string;
  monitorRunDependencies(left: number): void;
  onAbort(reason: unknown): void;
  onRuntimeInitialized(): void;
  preRun: Array<(module: NfsModule) => void>;
  print: typeof console.log;
  printErr: typeof console.error;
  setStatus(message: string): void;
}

declare global {
  var Module: NfsModule & NfsModuleConfig;

  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }

  interface Navigator {
    readonly keyboard?: {
      lock(keys?: string[]): Promise<void>;
      unlock(): void;
    };
  }
}
