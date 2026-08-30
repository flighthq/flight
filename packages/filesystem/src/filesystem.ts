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

export function appendTextFile(host: HasStorageFileSystem, path: string, data: string): Promise<boolean> {
  return host.storage.fileSystem.appendTextFile?.(path, data) ?? Promise.resolve(false);
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
): Promise<readonly FileEntry[]> {
  const all = await readDirectoryRecursive(host, rootPath);
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
): Promise<ReadableStream<Uint8Array> | null> {
  return host.storage.fileSystem.openFileReadStream?.(path) ?? Promise.resolve(null);
}

export function openFileWriteStream(
  host: HasStorageFileSystem,
  path: string,
): Promise<WritableStream<Uint8Array> | null> {
  return host.storage.fileSystem.openFileWriteStream?.(path) ?? Promise.resolve(null);
}

export function readBinaryFile(host: HasStorageFileSystem, path: string): Promise<Uint8Array | null> {
  return host.storage.fileSystem.readBinaryFile?.(path) ?? Promise.resolve(null);
}

export function readBinaryFileRange(
  host: HasStorageFileSystem,
  path: string,
  offset: number,
  length: number,
): Promise<Uint8Array | null> {
  return host.storage.fileSystem.readBinaryFileRange?.(path, offset, length) ?? Promise.resolve(null);
}

export async function readDialogHandleBinaryFile(
  host: HasStorageFileSystem,
  handle: Readonly<FileDialogHandle>,
): Promise<Uint8Array | null> {
  if (handle.path !== null) return readBinaryFile(host, handle.path);
  const read = getFileDialogHandleOperations(handle)?.readBinary;
  return read === undefined ? null : read();
}

export async function readDialogHandleTextFile(
  host: HasStorageFileSystem,
  handle: Readonly<FileDialogHandle>,
): Promise<string | null> {
  if (handle.path !== null) return readTextFile(host, handle.path);
  const read = getFileDialogHandleOperations(handle)?.readText;
  return read === undefined ? null : read();
}

export function readDirectory(host: HasStorageFileSystem, path: string): Promise<FileEntry[]> {
  return host.storage.fileSystem.readDirectory?.(path) ?? Promise.resolve([]);
}

export function readDirectoryRecursive(
  host: HasStorageFileSystem,
  path: string,
  options?: Readonly<FileWalkOptions>,
): Promise<readonly FileEntry[]> {
  return host.storage.fileSystem.readDirectoryRecursive?.(path, options) ?? Promise.resolve([]);
}

// Symlinks are outside the honest host-provider surface until a real provider exists.
export function readFileSymlink(_host: HasStorageFileSystem, _path: string): Promise<string | null> {
  return Promise.resolve(null);
}

export function readTextFile(host: HasStorageFileSystem, path: string): Promise<string | null> {
  return host.storage.fileSystem.readTextFile?.(path) ?? Promise.resolve(null);
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
): Promise<boolean> {
  return host.storage.fileSystem.writeBinaryFile?.(path, data) ?? Promise.resolve(false);
}

export async function writeBinaryFileChunks(
  host: HasStorageFileSystem,
  path: string,
  chunks: AsyncIterable<Readonly<Uint8Array>>,
): Promise<boolean> {
  const stream = await openFileWriteStream(host, path);
  if (stream === null) return false;
  const writer = stream.getWriter();
  try {
    for await (const chunk of chunks) await writer.write(chunk.slice());
    await writer.close();
    return true;
  } catch {
    await writer.abort();
    return false;
  }
}

export async function writeDialogHandleBinaryFile(
  host: HasStorageFileSystem,
  handle: Readonly<FileDialogHandle>,
  data: Readonly<Uint8Array>,
): Promise<boolean> {
  if (handle.path !== null) return writeBinaryFile(host, handle.path, data);
  const write = getFileDialogHandleOperations(handle)?.writeBinary;
  return write === undefined ? false : write(data);
}

export async function writeDialogHandleTextFile(
  host: HasStorageFileSystem,
  handle: Readonly<FileDialogHandle>,
  data: string,
): Promise<boolean> {
  if (handle.path !== null) return writeTextFile(host, handle.path, data);
  const write = getFileDialogHandleOperations(handle)?.writeText;
  return write === undefined ? false : write(data);
}

export function writeFileAtomic(
  host: HasStorageFileSystem,
  path: string,
  data: Readonly<Uint8Array> | string,
): Promise<boolean> {
  return host.storage.fileSystem.writeFileAtomic?.(path, data) ?? Promise.resolve(false);
}

export function writeTextFile(host: HasStorageFileSystem, path: string, data: string): Promise<boolean> {
  return host.storage.fileSystem.writeTextFile?.(path, data) ?? Promise.resolve(false);
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
