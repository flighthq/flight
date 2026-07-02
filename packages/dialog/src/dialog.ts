import type {
  DialogBackend,
  FileDialogHandle,
  FileDialogStartIn,
  MessageDialogOptions,
  MessageDialogResult,
  OpenDirectoryDialogOptions,
  OpenFileDialogOptions,
  PromptDialogOptions,
  SaveFileDialogOptions,
} from '@flighthq/types';

// Builds the default web backend over file inputs, window dialogs, and the File System Access API
// where available. File pickers fall back to <input type=file> which cannot expose real host paths,
// so handles carry path: null on web. All API surfaces are guarded for jsdom/non-document hosts
// and resolve to sentinels rather than throwing.
export function createWebDialogBackend(): DialogBackend {
  return {
    async confirm(options) {
      if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false;
      try {
        // Coerce to a strict boolean: a real browser returns boolean, but jsdom can return undefined.
        return window.confirm(options.message) === true;
      } catch {
        return false;
      }
    },
    async message(options) {
      // The web platform has no multi-button/checkbox message box; alert() shows the text only and
      // always yields button 0. Native hosts honor buttons, checkboxLabel, defaultId, and cancelId.
      const checkboxChecked = options.checkboxChecked ?? false;
      if (typeof window === 'undefined' || typeof window.alert !== 'function') {
        return { buttonIndex: 0, cancelled: false, checkboxChecked };
      }
      try {
        window.alert(options.message);
      } catch {
        return { buttonIndex: 0, cancelled: false, checkboxChecked };
      }
      return { buttonIndex: 0, cancelled: false, checkboxChecked };
    },
    openDirectory(options) {
      return openWebDirectoryDialog(options);
    },
    openFile(options) {
      return openWebFileDialog(options);
    },
    async prompt(options) {
      if (typeof window === 'undefined' || typeof window.prompt !== 'function') return null;
      try {
        return window.prompt(options.message, options.defaultValue ?? '');
      } catch {
        return null;
      }
    },
    async saveFile(options) {
      return saveWebFile(options);
    },
  };
}

// The active dialog backend, or a lazily-created web default. There is always a backend.
export function getDialogBackend(): DialogBackend {
  if (_backend === null) _backend = createWebDialogBackend();
  return _backend;
}

// Retrieves the underlying web FileSystemDirectoryHandle stashed for a dialog directory handle, if any.
// Used by @flighthq/filesystem or other I/O cells to traverse and read the directory natively.
// Returns null when the handle was produced by the legacy <input webkitdirectory> fallback.
export function getWebDirectorySystemHandle(handle: Readonly<FileDialogHandle>): FileSystemDirectoryHandle | null {
  return _fileSystemDirectoryHandleRegistry.get(handle as FileDialogHandle) ?? null;
}

// Retrieves the underlying web FileSystemFileHandle stashed for a dialog handle, if any.
// Used by @flighthq/filesystem or other I/O cells to access the writable/readable native handle.
// Returns null when the handle was produced by a legacy <input> fallback (no File System Access).
export function getWebFileSystemHandle(handle: Readonly<FileDialogHandle>): FileSystemFileHandle | null {
  return _fileSystemHandleRegistry.get(handle as FileDialogHandle) ?? null;
}

// Installs a native host dialog backend; pass null to fall back to the web default.
export function setDialogBackend(backend: DialogBackend | null): void {
  _backend = backend;
}

// Shows a yes/no confirmation. Returns false on cancel or when the host lacks the surface.
export function showConfirmDialog(options: Readonly<MessageDialogOptions>): Promise<boolean> {
  return getDialogBackend().confirm(options);
}

// Shows an error-severity message box. Returns the pressed button index and final checkbox state
// (buttonIndex 0 on web alert/dismiss). Convenience over showMessageDialog({ kind: 'error' }).
export function showErrorBox(title: string, content: string): Promise<MessageDialogResult> {
  return getDialogBackend().message({ kind: 'error', message: content, title });
}

// Shows an error-severity message dialog. Returns the full result including cancelled flag.
export function showErrorDialog(options: Readonly<MessageDialogOptions>): Promise<MessageDialogResult> {
  return getDialogBackend().message({ ...options, kind: 'error' });
}

// Shows an info-severity message dialog. Returns the full result including cancelled flag.
export function showInfoDialog(options: Readonly<MessageDialogOptions>): Promise<MessageDialogResult> {
  return getDialogBackend().message({ ...options, kind: 'info' });
}

// Shows an informational message. Returns the pressed button index and final checkbox state
// (buttonIndex 0 and the requested checkbox value on web alert/dismiss).
export function showMessageDialog(options: Readonly<MessageDialogOptions>): Promise<MessageDialogResult> {
  return getDialogBackend().message(options);
}

// Shows a directory picker as a first-class call (distinct from showOpenFileDialog({ directory: true })).
// Returns selected directory handles ([] on cancel). On web, path is null in each handle.
export function showOpenDirectoryDialog(options: Readonly<OpenDirectoryDialogOptions>): Promise<FileDialogHandle[]> {
  return getDialogBackend().openDirectory(options);
}

// Shows an open-file picker. Returns selected handles ([] on cancel). On web, path is null in each
// handle — browsers cannot expose real host paths. Use @flighthq/filesystem to read handle contents.
export function showOpenFileDialog(options: Readonly<OpenFileDialogOptions>): Promise<FileDialogHandle[]> {
  return getDialogBackend().openFile(options);
}

// Shows a text prompt. Returns the entered string, or null on cancel / when the host lacks the surface.
// Accepts an options object (title, message, defaultValue, placeholder) aligning it with its siblings.
export function showPromptDialog(options: Readonly<PromptDialogOptions>): Promise<string | null> {
  return getDialogBackend().prompt(options);
}

// Shows a save-file picker. Returns a handle for the chosen destination, or null on cancel.
// On web, uses the File System Access API (showSaveFilePicker) when available, yielding a handle
// whose writable can be opened by @flighthq/filesystem. Falls back to null when the API is absent.
export function showSaveFileDialog(options: Readonly<SaveFileDialogOptions>): Promise<FileDialogHandle | null> {
  return getDialogBackend().saveFile(options);
}

let _backend: DialogBackend | null = null;

// Builds a FileDialogFilter accept list for the File System Access API's 'types' option.
function buildFileSystemAccessTypes(
  filters: OpenFileDialogOptions['filters'],
): { accept: Record<string, string[]>; description: string }[] | undefined {
  if (filters === undefined || filters.length === 0) return undefined;
  const types: { accept: Record<string, string[]>; description: string }[] = [];
  for (const filter of filters) {
    const accept: Record<string, string[]> = {};
    const extensions = filter.extensions.filter((e) => e !== '*').map((e) => (e.startsWith('.') ? e : `.${e}`));
    if (extensions.length > 0) {
      const mime = filter.mimeTypes && filter.mimeTypes.length > 0 ? filter.mimeTypes[0] : 'application/octet-stream';
      accept[mime] = extensions;
    }
    if (filter.mimeTypes) {
      for (const mime of filter.mimeTypes) {
        if (!accept[mime]) accept[mime] = extensions;
      }
    }
    if (Object.keys(accept).length === 0) continue;
    types.push({ accept, description: filter.name });
  }
  return types.length > 0 ? types : undefined;
}

// Builds the accept attribute value for a legacy <input type=file>.
function buildAcceptAttribute(filters: OpenFileDialogOptions['filters']): string {
  if (filters === undefined || filters.length === 0) return '';
  const parts: string[] = [];
  for (const filter of filters) {
    for (const extension of filter.extensions) {
      if (extension === '*') continue;
      parts.push(extension.startsWith('.') ? extension : `.${extension}`);
    }
    if (filter.mimeTypes) {
      for (const mime of filter.mimeTypes) {
        parts.push(mime);
      }
    }
  }
  return parts.join(',');
}

// Maps a FileDialogStartIn value to a File System Access API startIn token.
// The File System Access API only accepts: 'desktop'|'documents'|'downloads'|'music'|'pictures'|'videos'
// Unsupported values ('home', 'temp', 'appData', 'cache') are silently dropped.
function toFileSystemAccessStartIn(startIn: FileDialogStartIn): string | undefined {
  const allowed = new Set(['desktop', 'documents', 'downloads', 'music', 'pictures', 'videos']);
  return allowed.has(startIn) ? startIn : undefined;
}

// Opens a directory picker on web. Prefers the File System Access API showDirectoryPicker when
// available (Chrome/Edge 86+) with a readwrite mode that enables real directory handle I/O.
// Falls back to a webkitdirectory <input> (the legacy path that returns only File objects with
// no writable access), which is non-standard but broadly supported.
function openWebDirectoryDialog(options: Readonly<OpenDirectoryDialogOptions>): Promise<FileDialogHandle[]> {
  // File System Access API path: showDirectoryPicker yields a real FileSystemDirectoryHandle.
  if (
    typeof window !== 'undefined' &&
    typeof (window as WindowWithFileSystemAccess).showDirectoryPicker === 'function'
  ) {
    return openDirectoryPickerAccessApi(options);
  }
  // Legacy fallback: <input webkitdirectory>
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return Promise.resolve([]);
  }
  return new Promise<FileDialogHandle[]>((resolve) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      if (options.multiple === true) input.multiple = true;
      // webkitdirectory is non-standard but the only browser path-less directory picker fallback.
      (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
      input.addEventListener('change', () => {
        const files = input.files;
        if (files === null || files.length === 0) {
          resolve([]);
          return;
        }
        // For directory inputs, each file's webkitRelativePath starts with the directory name.
        // Derive unique directory handles from the top-level directory names.
        const seenDirs = new Set<string>();
        const handles: FileDialogHandle[] = [];
        for (let i = 0; i < files.length; i++) {
          const rel = (files[i] as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
          const dirName = rel.split('/')[0] || files[i].name;
          if (!seenDirs.has(dirName)) {
            seenDirs.add(dirName);
            handles.push({ kind: 'Directory', name: dirName, path: null });
          }
        }
        resolve(handles);
      });
      input.addEventListener('cancel', () => resolve([]));
      input.click();
    } catch {
      resolve([]);
    }
  });
}

// Uses the File System Access API showDirectoryPicker. AbortError (user cancel) → sentinel [].
// SecurityError (permission denied) → sentinel []. Other errors → sentinel [].
// Stores the live FileSystemDirectoryHandle in the registry so @flighthq/filesystem can enumerate
// and read contents through the handle without requiring a path.
async function openDirectoryPickerAccessApi(
  options: Readonly<OpenDirectoryDialogOptions>,
): Promise<FileDialogHandle[]> {
  const win = window as WindowWithFileSystemAccess;
  if (typeof win.showDirectoryPicker !== 'function') return [];
  try {
    const pickerOptions: FileSystemAccessDirectoryPickerOptions = {
      // readwrite gives the most capability; if the user denies write permission the browser degrades.
      mode: 'readwrite',
    };
    if (options.startIn !== undefined) {
      const startIn = toFileSystemAccessStartIn(options.startIn);
      if (startIn !== undefined) pickerOptions.startIn = startIn;
    }
    const nativeHandle = await win.showDirectoryPicker(pickerOptions);
    const handle: FileDialogHandle = { kind: 'Directory', name: nativeHandle.name, path: null };
    // Stash the live FileSystemDirectoryHandle so @flighthq/filesystem can traverse it.
    _fileSystemDirectoryHandleRegistry.set(handle, nativeHandle);
    return [handle];
  } catch {
    // AbortError (cancel) and SecurityError (denied) both resolve to the sentinel.
    return [];
  }
}

// Opens a file picker on web. Uses the File System Access API (showOpenFilePicker) when available,
// stashing the live FileSystemFileHandle in the web handle registry for @flighthq/filesystem to read.
// Falls back to a transient <input type=file> for browsers without the API.
function openWebFileDialog(options: Readonly<OpenFileDialogOptions>): Promise<FileDialogHandle[]> {
  // File System Access API path (Chrome/Edge). Returns real writable handles.
  if (
    typeof window !== 'undefined' &&
    typeof (window as WindowWithFileSystemAccess).showOpenFilePicker === 'function'
  ) {
    return openFileSystemAccessPicker(options);
  }
  // Legacy <input type=file> fallback.
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return Promise.resolve([]);
  }
  return new Promise<FileDialogHandle[]>((resolve) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      if (options.multiple === true) input.multiple = true;
      if (options.directory === true) {
        (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
      }
      const accept = buildAcceptAttribute(options.filters);
      if (accept !== '') input.accept = accept;
      input.addEventListener('change', () => {
        const files = input.files;
        if (files === null || files.length === 0) {
          resolve([]);
          return;
        }
        const handles: FileDialogHandle[] = [];
        for (let i = 0; i < files.length; i++) {
          handles.push({ kind: 'File', name: files[i].name, path: null });
        }
        resolve(handles);
      });
      // A cancelled picker fires no change event in many browsers; the 'cancel' event covers newer ones.
      input.addEventListener('cancel', () => resolve([]));
      input.click();
    } catch {
      resolve([]);
    }
  });
}

// Uses the File System Access API showOpenFilePicker. AbortError (user cancel) → sentinel [].
// SecurityError (permission denied) → sentinel []. Other errors → sentinel [].
async function openFileSystemAccessPicker(options: Readonly<OpenFileDialogOptions>): Promise<FileDialogHandle[]> {
  const win = window as WindowWithFileSystemAccess;
  const showPicker = win.showOpenFilePicker;
  if (typeof showPicker !== 'function') return [];
  try {
    const pickerOptions: FileSystemAccessOpenPickerOptions = {
      multiple: options.multiple ?? false,
    };
    const types = buildFileSystemAccessTypes(options.filters);
    if (types !== undefined) pickerOptions.types = types;
    if (options.startIn !== undefined) {
      const startIn = toFileSystemAccessStartIn(options.startIn);
      if (startIn !== undefined) pickerOptions.startIn = startIn;
    }
    const nativeHandles = await showPicker.call(win, pickerOptions);
    const handles: FileDialogHandle[] = [];
    for (const nativeHandle of nativeHandles) {
      const handle: FileDialogHandle = { kind: 'File', name: nativeHandle.name, path: null };
      // Stash the live FileSystemFileHandle in the registry so @flighthq/filesystem can read it.
      _fileSystemHandleRegistry.set(handle, nativeHandle);
      handles.push(handle);
    }
    return handles;
  } catch {
    // AbortError (cancel) and SecurityError (permission denied) both resolve to the sentinel.
    return [];
  }
}

// Uses the File System Access API showSaveFilePicker. Returns null on cancel or when unavailable.
async function saveWebFile(options: Readonly<SaveFileDialogOptions>): Promise<FileDialogHandle | null> {
  const win = window as WindowWithFileSystemAccess;
  if (typeof win.showSaveFilePicker !== 'function') {
    // The web platform cannot expose or choose a writable host path without this API.
    return null;
  }
  try {
    const pickerOptions: FileSystemAccessSavePickerOptions = {};
    if (options.defaultName !== undefined) {
      pickerOptions.suggestedName = options.defaultName;
    } else if (options.defaultPath !== undefined) {
      // Extract filename portion from the defaultPath for the suggestedName heuristic.
      const parts = options.defaultPath.replace(/\\/g, '/').split('/');
      pickerOptions.suggestedName = parts[parts.length - 1];
    }
    const types = buildFileSystemAccessTypes(options.filters);
    if (types !== undefined) pickerOptions.types = types;
    if (options.startIn !== undefined) {
      const startIn = toFileSystemAccessStartIn(options.startIn);
      if (startIn !== undefined) pickerOptions.startIn = startIn;
    }
    const nativeHandle = await win.showSaveFilePicker(pickerOptions);
    const handle: FileDialogHandle = { kind: 'File', name: nativeHandle.name, path: null };
    // Stash the live FileSystemFileHandle for @flighthq/filesystem to write to.
    _fileSystemHandleRegistry.set(handle, nativeHandle);
    return handle;
  } catch {
    return null;
  }
}

// Registry mapping FileDialogHandle → live web FileSystemDirectoryHandle, enabling @flighthq/filesystem
// to enumerate and read directories without dialog owning the I/O. Populated by showDirectoryPicker path.
// Keys are plain FileDialogHandle objects (reference equality); values are the native handles.
const _fileSystemDirectoryHandleRegistry = new WeakMap<FileDialogHandle, FileSystemDirectoryHandle>();

// Registry mapping FileDialogHandle → live web FileSystemFileHandle, enabling @flighthq/filesystem
// to read from or write to a picked file without dialog owning the I/O. Dialog holds this registry
// because it is the only party that creates and observes the FileSystemFileHandle lifecycle.
// Keys are plain FileDialogHandle objects (reference equality); values are the native handles.
const _fileSystemHandleRegistry = new WeakMap<FileDialogHandle, FileSystemFileHandle>();

// Shows a warning-severity message dialog. Returns the full result including cancelled flag.
export function showWarningDialog(options: Readonly<MessageDialogOptions>): Promise<MessageDialogResult> {
  return getDialogBackend().message({ ...options, kind: 'warning' });
}

// Minimal type stubs for the File System Access API, which is not in all lib.dom.d.ts versions.
interface FileSystemFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream {
  write(data: BufferSource | Blob | string): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemDirectoryHandle {
  readonly kind: 'directory';
  readonly name: string;
}

interface FileSystemAccessOpenPickerOptions {
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
  startIn?: string;
  types?: { accept: Record<string, string[]>; description: string }[];
}

interface FileSystemAccessDirectoryPickerOptions {
  mode?: 'read' | 'readwrite';
  startIn?: string;
}

interface FileSystemAccessSavePickerOptions {
  excludeAcceptAllOption?: boolean;
  startIn?: string;
  suggestedName?: string;
  types?: { accept: Record<string, string[]>; description: string }[];
}

interface WindowWithFileSystemAccess extends Window {
  showDirectoryPicker?(options?: FileSystemAccessDirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker?(options?: FileSystemAccessOpenPickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?(options?: FileSystemAccessSavePickerOptions): Promise<FileSystemFileHandle>;
}
