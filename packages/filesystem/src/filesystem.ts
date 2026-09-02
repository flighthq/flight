import { getFileDialogHandleOperations } from '@flighthq/dialog/contract';
import type {
  FileDialogHandle,
  FileEntry,
  FilePermissions,
  FileStat,
  FileSystemPathKind,
  FileSystemUsage,
  FileWalkOptions,
  FileWatchEvent,
  HasStorageFileSystem,
} from '@flighthq/types/contract';

export function appendTextFile(
  host: HasStorageFileSystem,
  path: string,
  data: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const append = host.storage.fileSystem.appendTextFile;
  if (append === undefined) return Promise.resolve(false);
  return signal === undefined ? append(path, data) : append(path, data, signal);
}

export function canAccessFile(
  host: HasStorageFileSystem,
  path: string,
  mode: 'readable' | 'writable' | 'executable',
): Promise<boolean> {
  return host.storage.fileSystem.canAccessFile?.(path, mode) ?? Promise.resolve(false);
}

export function copyFile(host: HasStorageFileSystem, from: string, to: string): Promise<boolean> {
  return host.storage.fileSystem.copy?.(from, to) ?? Promise.resolve(false);
}

// Symlinks are outside the honest host-provider surface until a real provider exists.
export function createFileSymlink(_host: HasStorageFileSystem, _target: string, _linkPath: string): Promise<boolean> {
  return Promise.resolve(false);
}

export function directoryExists(host: HasStorageFileSystem, path: string): Promise<boolean> {
  return host.storage.fileSystem.directoryExists?.(path) ?? Promise.resolve(false);
}

export function fileExists(host: HasStorageFileSystem, path: string): Promise<boolean> {
  return host.storage.fileSystem.fileExists?.(path) ?? Promise.resolve(false);
}

export async function findFiles(
  host: HasStorageFileSystem,
  rootPath: string,
  pattern: string,
  options?: Readonly<FileWalkOptions>,
): Promise<readonly FileEntry[]> {
  const all = await readDirectoryRecursive(host, rootPath, options);
  if (all.length === 0) return [];
  const re = globToRegExp(pattern);
  return all.filter((entry) => re.test(entry.name) || re.test(entry.path));
}

export function getFileBaseName(path: string): string {
  const segments = splitPath(path);
  return segments.length === 0 ? '' : (segments[segments.length - 1] as string);
}

export function getFileDirectoryName(path: string): string {
  const segments = splitPath(path);
  if (segments.length <= 1) return '';
  return segments.slice(0, -1).join('/');
}

export function getFileExtensionName(path: string): string {
  const base = getFileBaseName(path);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
}

// POSIX permissions are outside the honest host-provider surface until a real provider exists.
export function getFilePermissions(_host: HasStorageFileSystem, _path: string): Promise<FilePermissions | null> {
  return Promise.resolve(null);
}

// Real-path resolution is outside the honest host-provider surface until a real provider exists.
export function getFileRealPath(_host: HasStorageFileSystem, _path: string): Promise<string | null> {
  return Promise.resolve(null);
}

// Well-known native paths are outside the honest host-provider surface until a real provider exists.
export function getFileSystemPath(_host: HasStorageFileSystem, _kind: FileSystemPathKind): string {
  return '';
}

export function getFileSystemUsage(host: HasStorageFileSystem): Promise<FileSystemUsage | null> {
  return host.storage.fileSystem.getFileSystemUsage?.() ?? Promise.resolve(null);
}

export function isAbsoluteFilePath(path: string): boolean {
  if (path.length === 0) return false;
  if (path[0] === '/') return true;
  return path.length >= 2 && /^[A-Za-z]:/.test(path);
}

export function joinFilePath(...segments: readonly string[]): string {
  const parts: string[] = [];
  for (const segment of segments) {
    for (const part of segment.split('/')) {
      if (part === '' || part === '.') continue;
      parts.push(part);
    }
  }
  const prefix = segments.length > 0 && segments[0]?.startsWith('/') === true ? '/' : '';
  return prefix + parts.join('/');
}

export function makeDirectory(host: HasStorageFileSystem, path: string): Promise<boolean> {
  return host.storage.fileSystem.makeDirectory?.(path) ?? Promise.resolve(false);
}

export function normalizeFilePath(path: string): string {
  const prefix = path.startsWith('/') ? '/' : '';
  return prefix + splitPath(path).join('/');
}

export function openFileReadStream(
  host: HasStorageFileSystem,
  path: string,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array> | null> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const open = host.storage.fileSystem.openFileReadStream;
  if (open === undefined) return Promise.resolve(null);
  return signal === undefined ? open(path) : open(path, signal);
}

export function openFileWriteStream(
  host: HasStorageFileSystem,
  path: string,
  signal?: AbortSignal,
): Promise<WritableStream<Uint8Array> | null> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const open = host.storage.fileSystem.openFileWriteStream;
  if (open === undefined) return Promise.resolve(null);
  return signal === undefined ? open(path) : open(path, signal);
}

export function readBinaryFile(
  host: HasStorageFileSystem,
  path: string,
  signal?: AbortSignal,
): Promise<Uint8Array | null> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const read = host.storage.fileSystem.readBinaryFile;
  if (read === undefined) return Promise.resolve(null);
  return signal === undefined ? read(path) : read(path, signal);
}

export function readBinaryFileRange(
  host: HasStorageFileSystem,
  path: string,
  offset: number,
  length: number,
  signal?: AbortSignal,
): Promise<Uint8Array | null> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const read = host.storage.fileSystem.readBinaryFileRange;
  if (read === undefined) return Promise.resolve(null);
  return signal === undefined ? read(path, offset, length) : read(path, offset, length, signal);
}

export async function readDialogHandleBinaryFile(
  host: HasStorageFileSystem,
  handle: Readonly<FileDialogHandle>,
  signal?: AbortSignal,
): Promise<Uint8Array | null> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (handle.path !== null) return readBinaryFile(host, handle.path, signal);
  const read = getFileDialogHandleOperations(handle)?.readBinary;
  if (read === undefined) return null;
  return signal === undefined ? read() : read(signal);
}

export async function readDialogHandleTextFile(
  host: HasStorageFileSystem,
  handle: Readonly<FileDialogHandle>,
  signal?: AbortSignal,
): Promise<string | null> {
  signal?.throwIfAborted();
  if (handle.path !== null) return readTextFile(host, handle.path, signal);
  const read = getFileDialogHandleOperations(handle)?.readText;
  if (read === undefined) return null;
  return signal === undefined ? read() : read(signal);
}

export function readDirectory(host: HasStorageFileSystem, path: string, signal?: AbortSignal): Promise<FileEntry[]> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const read = host.storage.fileSystem.readDirectory;
  if (read === undefined) return Promise.resolve([]);
  return signal === undefined ? read(path) : read(path, signal);
}

export function readDirectoryRecursive(
  host: HasStorageFileSystem,
  path: string,
  options?: Readonly<FileWalkOptions>,
): Promise<readonly FileEntry[]> {
  if (options?.signal?.aborted) return Promise.reject(options.signal.reason);
  const read = host.storage.fileSystem.readDirectoryRecursive;
  if (read === undefined) return Promise.resolve([]);
  return options === undefined ? read(path) : read(path, options);
}

// Symlinks are outside the honest host-provider surface until a real provider exists.
export function readFileSymlink(_host: HasStorageFileSystem, _path: string): Promise<string | null> {
  return Promise.resolve(null);
}

export function readTextFile(host: HasStorageFileSystem, path: string, signal?: AbortSignal): Promise<string | null> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const read = host.storage.fileSystem.readTextFile;
  if (read === undefined) return Promise.resolve(null);
  return signal === undefined ? read(path) : read(path, signal);
}

export function removeDirectory(host: HasStorageFileSystem, path: string, recursive?: boolean): Promise<boolean> {
  return host.storage.fileSystem.removeDirectory?.(path, recursive) ?? Promise.resolve(false);
}

export function removeFile(host: HasStorageFileSystem, path: string): Promise<boolean> {
  return host.storage.fileSystem.removeFile?.(path) ?? Promise.resolve(false);
}

export function renameFile(host: HasStorageFileSystem, from: string, to: string): Promise<boolean> {
  return host.storage.fileSystem.rename?.(from, to) ?? Promise.resolve(false);
}

// POSIX permissions are outside the honest host-provider surface until a real provider exists.
export function setFilePermissions(
  _host: HasStorageFileSystem,
  _path: string,
  _permissions: Readonly<FilePermissions>,
): Promise<boolean> {
  return Promise.resolve(false);
}

export function statFile(host: HasStorageFileSystem, path: string): Promise<FileStat | null> {
  return host.storage.fileSystem.statFile?.(path) ?? Promise.resolve(null);
}

// File watching is outside the honest host-provider surface until a real provider exists.
export function watchPath(
  _host: HasStorageFileSystem,
  _path: string,
  _listener: (event: Readonly<FileWatchEvent>) => void,
): () => void {
  return () => {};
}

export function writeBinaryFile(
  host: HasStorageFileSystem,
  path: string,
  data: Readonly<Uint8Array>,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const write = host.storage.fileSystem.writeBinaryFile;
  if (write === undefined) return Promise.resolve(false);
  return signal === undefined ? write(path, data) : write(path, data, signal);
}

export async function writeBinaryFileChunks(
  host: HasStorageFileSystem,
  path: string,
  chunks: AsyncIterable<Readonly<Uint8Array>>,
  signal?: AbortSignal,
): Promise<boolean> {
  signal?.throwIfAborted();
  const stream = await openFileWriteStream(host, path, signal);
  if (stream === null) return false;
  const writer = stream.getWriter();
  if (signal?.aborted) {
    await writer.abort(signal.reason).catch(() => {});
    throw signal.reason;
  }
  let aborted = false;
  let abortPromise: Promise<void> | null = null;
  const onAbort = () => {
    aborted = true;
    abortPromise = writer.abort(signal?.reason).catch(() => {});
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for await (const chunk of chunks) {
      signal?.throwIfAborted();
      await writer.write(chunk.slice());
    }
    signal?.throwIfAborted();
    await writer.close();
    return true;
  } catch {
    if (abortPromise === null) await writer.abort().catch(() => {});
    else await abortPromise;
    if (aborted) throw signal?.reason;
    return false;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function writeDialogHandleBinaryFile(
  host: HasStorageFileSystem,
  handle: Readonly<FileDialogHandle>,
  data: Readonly<Uint8Array>,
  signal?: AbortSignal,
): Promise<boolean> {
  signal?.throwIfAborted();
  if (handle.path !== null) return writeBinaryFile(host, handle.path, data, signal);
  const write = getFileDialogHandleOperations(handle)?.writeBinary;
  if (write === undefined) return false;
  return signal === undefined ? write(data) : write(data, signal);
}

export async function writeDialogHandleTextFile(
  host: HasStorageFileSystem,
  handle: Readonly<FileDialogHandle>,
  data: string,
  signal?: AbortSignal,
): Promise<boolean> {
  signal?.throwIfAborted();
  if (handle.path !== null) return writeTextFile(host, handle.path, data, signal);
  const write = getFileDialogHandleOperations(handle)?.writeText;
  if (write === undefined) return false;
  return signal === undefined ? write(data) : write(data, signal);
}

export function writeFileAtomic(
  host: HasStorageFileSystem,
  path: string,
  data: Readonly<Uint8Array> | string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const write = host.storage.fileSystem.writeFileAtomic;
  if (write === undefined) return Promise.resolve(false);
  return signal === undefined ? write(path, data) : write(path, data, signal);
}

export function writeTextFile(
  host: HasStorageFileSystem,
  path: string,
  data: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const write = host.storage.fileSystem.writeTextFile;
  if (write === undefined) return Promise.resolve(false);
  return signal === undefined ? write(path, data) : write(path, data, signal);
}

function globToRegExp(pattern: string): RegExp {
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i] as string;
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i++;
        if (pattern[i + 1] === '/') i++;
      } else re += '[^/]*';
    } else if (ch === '?') re += '[^/]';
    else if (/[.+^${}()|[\]\\]/.test(ch)) re += '\\' + ch;
    else re += ch;
  }
  return new RegExp(re + '$');
}

function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '' && segment !== '.');
}
