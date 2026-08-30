import { createFileDialogHandle } from '@flighthq/dialog/contract';
import { createEntity } from '@flighthq/entity/contract';
import type {
  DirectoryOpenDialogBackend,
  DirectoryOpenDialogResult,
  EntityRuntimeKey,
  FileDialogFilter,
  FileDialogHandleOperations,
  FileOpenDialogBackend,
  FileOpenDialogResult,
  FileSaveDialogBackend,
  FileSaveDialogResult,
  OpenFileDialogOptions,
  SaveFileDialogOptions,
} from '@flighthq/types/contract';

export { webMessageDialogBackend, webPromptDialogBackend } from '@flighthq/dialog/contract';

export const webDirectoryOpenDialogBackend = createEntity({
  open: openDirectory,
} satisfies Omit<DirectoryOpenDialogBackend, typeof EntityRuntimeKey>);

export const webFileOpenDialogBackend = createEntity({
  open: openFile,
} satisfies Omit<FileOpenDialogBackend, typeof EntityRuntimeKey>);

export const webFileSaveDialogBackend = createEntity({
  save: saveFile,
} satisfies Omit<FileSaveDialogBackend, typeof EntityRuntimeKey>);

async function openDirectory(): Promise<DirectoryOpenDialogResult> {
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

    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    window.addEventListener('focus', onFocus);
    try {
      input.click();
    } catch {
      finish({ outcome: 'file-open-failed' });
    }
  });
}

async function saveFile(options: Readonly<SaveFileDialogOptions>): Promise<FileSaveDialogResult> {
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
    async readBinary() {
      try {
        return new Uint8Array(await file.arrayBuffer());
      } catch {
        return null;
      }
    },
    async readText() {
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
    async readBinary() {
      try {
        const file = await handle.getFile();
        return new Uint8Array(await file.arrayBuffer());
      } catch {
        return null;
      }
    },
    async readText() {
      try {
        return await (await handle.getFile()).text();
      } catch {
        return null;
      }
    },
    async writeBinary(data) {
      return writeFileSystemHandle(handle, data.slice());
    },
    async writeText(data) {
      return writeFileSystemHandle(handle, data);
    },
  };
}

async function writeFileSystemHandle(handle: FileSystemFileHandle, data: Uint8Array | string): Promise<boolean> {
  let writable: FileSystemWritableFileStream | null = null;
  try {
    writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    return true;
  } catch {
    try {
      await writable?.abort?.();
    } catch {
      // The write failure remains authoritative; abort is best-effort teardown of the owned stream.
    }
    return false;
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
  abort?(): Promise<void>;
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
