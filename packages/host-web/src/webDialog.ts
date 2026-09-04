import { createFileDialogHandle } from '@flighthq/dialog/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CapturePhotoDialogOptions,
  CaptureVideoDialogOptions,
  DialogImage,
  DialogVideo,
  DirectoryOpenDialogBackend,
  DirectoryOpenDialogResult,
  EntityConstruction,
  EntityRuntimeKey,
  FileDialogFilter,
  FileDialogHandleOperations,
  FileOpenDialogBackend,
  FileOpenDialogResult,
  FileSaveDialogBackend,
  FileSaveDialogResult,
  ImageOpenDialogBackend,
  ImageOpenDialogResult,
  OpenDirectoryDialogOptions,
  OpenFileDialogOptions,
  OpenImageDialogOptions,
  PhotoCaptureDialogBackend,
  PhotoCaptureDialogResult,
  SaveFileDialogOptions,
  VideoCaptureDialogBackend,
  VideoCaptureDialogResult,
} from '@flighthq/types/contract';

export { webMessageDialogBackend, webPromptDialogBackend } from '@flighthq/dialog/contract';

export const webDirectoryOpenDialogBackend = (() => {
  const out = allocateEntity<DirectoryOpenDialogBackend>();
  out.open = openDirectory;
  return finishEntity(out);
})();

export const webFileOpenDialogBackend = (() => {
  const out = allocateEntity<FileOpenDialogBackend>();
  out.open = openFile;
  return finishEntity(out);
})();

export const webFileSaveDialogBackend = (() => {
  const out = allocateEntity<FileSaveDialogBackend>();
  out.save = saveFile;
  return finishEntity(out);
})();

export const webImageOpenDialogBackend = (() => {
  const out = allocateEntity<ImageOpenDialogBackend>();
  out.open = openImage;
  return finishEntity(out);
})();

export const webPhotoCaptureDialogBackend = (() => {
  const out = allocateEntity<PhotoCaptureDialogBackend>();
  out.capture = capturePhoto;
  return finishEntity(out);
})();

export const webVideoCaptureDialogBackend = (() => {
  const out = allocateEntity<VideoCaptureDialogBackend>();
  out.capture = captureVideo;
  return finishEntity(out);
})();

async function openDirectory(options: Readonly<OpenDirectoryDialogOptions> = {}): Promise<DirectoryOpenDialogResult> {
  if (options.signal?.aborted) return { outcome: 'cancelled' };
  if (typeof window === 'undefined') return { outcome: 'runtime-unavailable' };
  const picker = (window as WindowWithFileSystemAccess).showDirectoryPicker;
  if (typeof picker !== 'function') return { outcome: 'runtime-unavailable' };
  try {
    const nativeHandle = await picker.call(window, { mode: 'read' });
    return {
      handle: createFileDialogHandle('Directory', nativeHandle.name, null),
      outcome: 'selected',
    };
  } catch (error) {
    return { outcome: classifyPickerFailure(error, 'directory-open-failed') };
  }
}

function openFile(options: Readonly<OpenFileDialogOptions>): Promise<FileOpenDialogResult> {
  if (options.signal?.aborted) return Promise.resolve({ outcome: 'cancelled' });
  if (typeof window !== 'undefined') {
    const picker = (window as WindowWithFileSystemAccess).showOpenFilePicker;
    if (typeof picker === 'function') return openFileSystemAccessPicker(window, picker, options);
  }
  return openLegacyFilePicker(options);
}

async function openFileSystemAccessPicker(
  win: Window,
  picker: NonNullable<WindowWithFileSystemAccess['showOpenFilePicker']>,
  options: Readonly<OpenFileDialogOptions>,
): Promise<FileOpenDialogResult> {
  if (options.signal?.aborted) return { outcome: 'cancelled' };
  try {
    const pickerOptions: FileSystemAccessOpenPickerOptions = { multiple: options.multiple ?? false };
    const types = buildFileSystemAccessTypes(options.filters);
    if (types !== undefined) pickerOptions.types = types;
    const nativeHandles = await picker.call(win, pickerOptions);
    if (nativeHandles.length === 0) return { outcome: 'file-open-failed' };
    const handles = nativeHandles.map((nativeHandle) =>
      createFileDialogHandle('File', nativeHandle.name, null, fileSystemHandleOperations(nativeHandle)),
    );
    return {
      handles: handles as [(typeof handles)[number], ...(typeof handles)[number][]],
      outcome: 'selected',
    };
  } catch (error) {
    return { outcome: classifyPickerFailure(error, 'file-open-failed') };
  }
}

function openLegacyFilePicker(options: Readonly<OpenFileDialogOptions>): Promise<FileOpenDialogResult> {
  if (options.signal?.aborted) return Promise.resolve({ outcome: 'cancelled' });
  if (
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function' ||
    typeof window === 'undefined' ||
    typeof window.addEventListener !== 'function'
  ) {
    return Promise.resolve({ outcome: 'runtime-unavailable' });
  }
  return new Promise<FileOpenDialogResult>((resolve) => {
    let focusTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = options.multiple === true;
    const accept = buildAcceptAttribute(options.filters);
    if (accept !== '') input.accept = accept;

    const cleanup = () => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      window.removeEventListener('focus', onFocus);
      options.signal?.removeEventListener('abort', onAbort);
      if (focusTimer !== null) clearTimeout(focusTimer);
      focusTimer = null;
    };
    const finish = (result: FileOpenDialogResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const selectedResult = (): FileOpenDialogResult | null => {
      const files = input.files;
      if (files === null || files.length === 0) return null;
      const handles = Array.from(files, (file) =>
        createFileDialogHandle('File', file.name, null, retainedFileOperations(file)),
      );
      return {
        handles: handles as [(typeof handles)[number], ...(typeof handles)[number][]],
        outcome: 'selected',
      };
    };
    function onChange() {
      finish(selectedResult() ?? { outcome: 'cancelled' });
    }
    function onCancel() {
      finish({ outcome: 'cancelled' });
    }
    function onFocus() {
      if (focusTimer !== null) clearTimeout(focusTimer);
      // Browsers normally dispatch focus before change. One task lets change win while still making
      // the no-event cancellation path deterministic.
      focusTimer = setTimeout(() => finish(selectedResult() ?? { outcome: 'cancelled' }), 0);
    }
    function onAbort() {
      finish({ outcome: 'cancelled' });
    }

    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    window.addEventListener('focus', onFocus);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      input.click();
    } catch {
      finish({ outcome: 'file-open-failed' });
    }
  });
}

async function saveFile(options: Readonly<SaveFileDialogOptions>): Promise<FileSaveDialogResult> {
  if (options.signal?.aborted) return { outcome: 'cancelled' };
  if (typeof window === 'undefined') return { outcome: 'runtime-unavailable' };
  const picker = (window as WindowWithFileSystemAccess).showSaveFilePicker;
  if (typeof picker !== 'function') return { outcome: 'runtime-unavailable' };
  try {
    const pickerOptions: FileSystemAccessSavePickerOptions = {};
    if (options.defaultName !== undefined) pickerOptions.suggestedName = options.defaultName;
    const types = buildFileSystemAccessTypes(options.filters);
    if (types !== undefined) pickerOptions.types = types;
    const nativeHandle = await picker.call(window, pickerOptions);
    return {
      handle: createFileDialogHandle('File', nativeHandle.name, null, fileSystemHandleOperations(nativeHandle)),
      outcome: 'selected',
    };
  } catch (error) {
    return { outcome: classifyPickerFailure(error, 'file-save-failed') };
  }
}

async function openImage(options: Readonly<OpenImageDialogOptions> = {}): Promise<ImageOpenDialogResult> {
  const picked = await pickMediaFile('image/*', undefined, options.signal, 'image-open-failed');
  if ('outcome' in picked) return picked;
  const dataUrl = await readDataUrl(picked.file, options.signal);
  if (dataUrl === 'cancelled') return { outcome: 'cancelled' };
  if (dataUrl === null) return { outcome: 'image-open-failed' };
  const image = await decodeImage(dataUrl, picked.file.type, options.signal);
  if (image === 'cancelled') return { outcome: 'cancelled' };
  return image === null ? { outcome: 'image-open-failed' } : { image, outcome: 'selected' };
}

async function capturePhoto(options: Readonly<CapturePhotoDialogOptions> = {}): Promise<PhotoCaptureDialogResult> {
  const picked = await pickMediaFile(
    'image/*',
    options.facingMode ?? 'environment',
    options.signal,
    'photo-capture-failed',
  );
  if ('outcome' in picked) return picked;
  const dataUrl = await readDataUrl(picked.file, options.signal);
  if (dataUrl === 'cancelled') return { outcome: 'cancelled' };
  if (dataUrl === null) return { outcome: 'photo-capture-failed' };
  const photo = await decodeImage(dataUrl, picked.file.type, options.signal);
  if (photo === 'cancelled') return { outcome: 'cancelled' };
  return photo === null ? { outcome: 'photo-capture-failed' } : { outcome: 'selected', photo };
}

async function captureVideo(options: Readonly<CaptureVideoDialogOptions> = {}): Promise<VideoCaptureDialogResult> {
  const picked = await pickMediaFile(
    'video/*',
    options.facingMode ?? 'environment',
    options.signal,
    'video-capture-failed',
  );
  if ('outcome' in picked) return picked;
  const dataUrl = await readDataUrl(picked.file, options.signal);
  if (dataUrl === 'cancelled') return { outcome: 'cancelled' };
  if (dataUrl === null) return { outcome: 'video-capture-failed' };
  const video = await decodeVideo(dataUrl, picked.file.type, options.signal);
  if (video === 'cancelled') return { outcome: 'cancelled' };
  return video === null ? { outcome: 'video-capture-failed' } : { outcome: 'selected', video };
}

type MediaPickerFailure = 'image-open-failed' | 'photo-capture-failed' | 'video-capture-failed';

function pickMediaFile<Failure extends MediaPickerFailure>(
  accept: string,
  capture: string | undefined,
  signal: AbortSignal | undefined,
  failure: Failure,
): Promise<
  { readonly file: File } | { readonly outcome: 'cancelled' | 'runtime-unavailable' | 'security-denied' | Failure }
> {
  if (signal?.aborted) return Promise.resolve({ outcome: 'cancelled' });
  if (
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function' ||
    typeof FileReader === 'undefined'
  ) {
    return Promise.resolve({ outcome: 'runtime-unavailable' });
  }
  return new Promise((resolve) => {
    let settled = false;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture !== undefined) input.capture = capture;

    const cleanup = () => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (
      result:
        | { readonly file: File }
        | { readonly outcome: 'cancelled' | 'runtime-unavailable' | 'security-denied' | Failure },
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    function onChange() {
      const file = input.files?.[0];
      finish(file === undefined ? { outcome: 'cancelled' } : { file });
    }
    function onCancel() {
      finish({ outcome: 'cancelled' });
    }
    function onAbort() {
      finish({ outcome: 'cancelled' });
    }

    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      input.click();
    } catch (error) {
      finish({ outcome: classifyPickerFailure(error, failure) });
    }
  });
}

function readDataUrl(file: File, signal?: AbortSignal): Promise<string | 'cancelled' | null> {
  if (signal?.aborted) return Promise.resolve('cancelled');
  if (typeof FileReader === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let reader: FileReader;
    try {
      reader = new FileReader();
    } catch {
      resolve(null);
      return;
    }
    let settled = false;
    const cleanup = () => {
      reader.removeEventListener('load', onLoad);
      reader.removeEventListener('error', onError);
      reader.removeEventListener('abort', onReaderAbort);
      signal?.removeEventListener('abort', onSignalAbort);
    };
    const finish = (result: string | 'cancelled' | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    function onLoad() {
      finish(typeof reader.result === 'string' ? reader.result : null);
    }
    function onError() {
      finish(null);
    }
    function onReaderAbort() {
      finish('cancelled');
    }
    function onSignalAbort() {
      reader.abort();
      finish('cancelled');
    }

    reader.addEventListener('load', onLoad);
    reader.addEventListener('error', onError);
    reader.addEventListener('abort', onReaderAbort);
    signal?.addEventListener('abort', onSignalAbort, { once: true });
    try {
      reader.readAsDataURL(file);
    } catch {
      finish(null);
    }
  });
}

function decodeImage(
  dataUrl: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<DialogImage | 'cancelled' | null> {
  if (signal?.aborted) return Promise.resolve('cancelled');
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    let image: HTMLImageElement;
    try {
      image = document.createElement('img');
    } catch {
      resolve(null);
      return;
    }
    let settled = false;
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (result: DialogImage | 'cancelled' | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    function onAbort() {
      finish('cancelled');
    }

    image.onload = () => {
      const { naturalHeight: height, naturalWidth: width } = image;
      finish(
        Number.isFinite(height) && height > 0 && Number.isFinite(width) && width > 0
          ? { dataUrl, height, mimeType, width }
          : null,
      );
    };
    image.onerror = () => finish(null);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      image.src = dataUrl;
    } catch {
      finish(null);
    }
  });
}

function decodeVideo(
  dataUrl: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<DialogVideo | 'cancelled' | null> {
  if (signal?.aborted) return Promise.resolve('cancelled');
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    let video: HTMLVideoElement;
    try {
      video = document.createElement('video');
    } catch {
      resolve(null);
      return;
    }
    let settled = false;
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      video.removeAttribute('src');
    };
    const finish = (result: DialogVideo | 'cancelled' | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    function onLoadedMetadata() {
      const { duration } = video;
      finish(Number.isFinite(duration) && duration > 0 ? { dataUrl, duration, mimeType } : null);
    }
    function onError() {
      finish(null);
    }
    function onAbort() {
      finish('cancelled');
    }

    video.preload = 'metadata';
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      video.src = dataUrl;
      video.load();
    } catch {
      finish(null);
    }
  });
}

function buildFileSystemAccessTypes(
  filters: readonly FileDialogFilter[] | undefined,
): FileSystemAccessPickerType[] | undefined {
  if (filters === undefined || filters.length === 0) return undefined;
  const types: FileSystemAccessPickerType[] = [];
  for (const filter of filters) {
    const accept: Record<string, string[]> = {};
    for (const [mimeType, extensions] of Object.entries(filter.accept)) {
      const normalized = normalizeExtensions(extensions);
      if (normalized.length > 0) accept[mimeType] = normalized;
    }
    if (Object.keys(accept).length > 0) types.push({ accept, description: filter.name });
  }
  return types.length > 0 ? types : undefined;
}

function buildAcceptAttribute(filters: readonly FileDialogFilter[] | undefined): string {
  if (filters === undefined) return '';
  const parts = new Set<string>();
  for (const filter of filters) {
    for (const [mimeType, extensions] of Object.entries(filter.accept)) {
      if (mimeType !== '') parts.add(mimeType);
      for (const extension of normalizeExtensions(extensions)) parts.add(extension);
    }
  }
  return [...parts].join(',');
}

function normalizeExtensions(extensions: readonly string[]): string[] {
  return extensions
    .filter((extension) => extension !== '' && extension !== '*')
    .map((extension) => (extension.startsWith('.') ? extension : `.${extension}`));
}

function classifyPickerFailure<Failure extends string>(
  error: unknown,
  failure: Failure,
): 'cancelled' | 'security-denied' | Failure {
  const name = errorName(error);
  if (name === 'AbortError') return 'cancelled';
  if (name === 'SecurityError' || name === 'NotAllowedError') return 'security-denied';
  return failure;
}

function errorName(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('name' in error)) return null;
  return typeof error.name === 'string' ? error.name : null;
}

function retainedFileOperations(file: File): FileDialogHandleOperations {
  return {
    async readBinary(signal) {
      signal?.throwIfAborted();
      try {
        return new Uint8Array(await file.arrayBuffer());
      } catch {
        return null;
      }
    },
    async readText(signal) {
      signal?.throwIfAborted();
      try {
        return await file.text();
      } catch {
        return null;
      }
    },
  };
}

function fileSystemHandleOperations(handle: FileSystemFileHandle): FileDialogHandleOperations {
  return {
    async readBinary(signal) {
      signal?.throwIfAborted();
      let file: File;
      try {
        file = await handle.getFile();
      } catch {
        return null;
      }
      signal?.throwIfAborted();
      try {
        return new Uint8Array(await file.arrayBuffer());
      } catch {
        return null;
      }
    },
    async readText(signal) {
      signal?.throwIfAborted();
      let file: File;
      try {
        file = await handle.getFile();
      } catch {
        return null;
      }
      signal?.throwIfAborted();
      try {
        return await file.text();
      } catch {
        return null;
      }
    },
    async writeBinary(data, signal) {
      signal?.throwIfAborted();
      return writeFileSystemHandle(handle, data.slice(), signal);
    },
    async writeText(data, signal) {
      signal?.throwIfAborted();
      return writeFileSystemHandle(handle, data, signal);
    },
  };
}

async function writeFileSystemHandle(
  handle: FileSystemFileHandle,
  data: Uint8Array | string,
  signal?: AbortSignal,
): Promise<boolean> {
  signal?.throwIfAborted();
  let writable: FileSystemWritableFileStream | null = null;
  try {
    writable = await handle.createWritable();
  } catch {
    return false;
  }
  if (signal?.aborted) {
    await writable.abort?.(signal.reason).catch(() => {});
    throw signal.reason;
  }
  let aborted = false;
  let abortPromise: Promise<void> | null = null;
  const onAbort = () => {
    aborted = true;
    abortPromise = writable?.abort?.(signal?.reason).catch(() => {}) ?? Promise.resolve();
  };
  if (writable.abort !== undefined) signal?.addEventListener('abort', onAbort, { once: true });
  try {
    await writable.write(data);
    if (aborted) {
      await abortPromise;
      throw signal?.reason;
    }
    await writable.close();
    return true;
  } catch {
    if (abortPromise === null) await writable.abort?.().catch(() => {});
    else await abortPromise;
    if (aborted) throw signal?.reason;
    return false;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

interface FileSystemFileHandle {
  readonly kind: 'file';
  readonly name: string;
  createWritable(): Promise<FileSystemWritableFileStream>;
  getFile(): Promise<File>;
}

interface FileSystemDirectoryHandle {
  readonly kind: 'directory';
  readonly name: string;
}

interface FileSystemWritableFileStream {
  abort?(reason?: unknown): Promise<void>;
  close(): Promise<void>;
  write(data: Uint8Array | string): Promise<void>;
}

interface FileSystemAccessPickerType {
  accept: Record<string, string[]>;
  description: string;
}

interface FileSystemAccessOpenPickerOptions {
  multiple?: boolean;
  types?: FileSystemAccessPickerType[];
}

interface FileSystemAccessDirectoryPickerOptions {
  mode?: 'read' | 'readwrite';
}

interface FileSystemAccessSavePickerOptions {
  suggestedName?: string;
  types?: FileSystemAccessPickerType[];
}

interface WindowWithFileSystemAccess extends Window {
  showDirectoryPicker?(options?: FileSystemAccessDirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker?(options?: FileSystemAccessOpenPickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?(options?: FileSystemAccessSavePickerOptions): Promise<FileSystemFileHandle>;
}
