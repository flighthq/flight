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
  HostFileSystemProvider,
} from '@flighthq/types/contract';

export function appendTextFile(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  path: string,
  data: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const append = hostFileSystem.appendTextFile;
  if (append === undefined) return Promise.resolve(false);
  return signal === undefined ? append(path, data) : append(path, data, signal);
}

export function canAccessFile(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  path: string,
  mode: 'readable' | 'writable' | 'executable',
): Promise<boolean> {
  return hostFileSystem.canAccessFile?.(path, mode) ?? Promise.resolve(false);
}

export function copyFile(hostFileSystem: Readonly<HostFileSystemProvider>, from: string, to: string): Promise<boolean> {
  return hostFileSystem.copy?.(from, to) ?? Promise.resolve(false);
}

// Symlinks are outside the honest host-provider surface until a real provider exists.
export function createFileSymlink(_target: string, _linkPath: string): Promise<boolean> {
  return Promise.resolve(false);
}

export function directoryExists(hostFileSystem: Readonly<HostFileSystemProvider>, path: string): Promise<boolean> {
  return hostFileSystem.directoryExists?.(path) ?? Promise.resolve(false);
}

export function fileExists(hostFileSystem: Readonly<HostFileSystemProvider>, path: string): Promise<boolean> {
  return hostFileSystem.fileExists?.(path) ?? Promise.resolve(false);
}

export async function findFiles(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  rootPath: string,
  pattern: string,
  options?: Readonly<FileWalkOptions>,
): Promise<readonly FileEntry[]> {
  const all = await readDirectoryRecursive(hostFileSystem, rootPath, options);
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
export function getFilePermissions(_path: string): Promise<FilePermissions | null> {
  return Promise.resolve(null);
}

// Real-path resolution is outside the honest host-provider surface until a real provider exists.
export function getFileRealPath(_path: string): Promise<string | null> {
  return Promise.resolve(null);
}

// Well-known native paths are outside the honest host-provider surface until a real provider exists.
export function getFileSystemPath(_kind: FileSystemPathKind): string {
  return '';
}

export function getFileSystemUsage(hostFileSystem: Readonly<HostFileSystemProvider>): Promise<FileSystemUsage | null> {
  return hostFileSystem.getFileSystemUsage?.() ?? Promise.resolve(null);
}

export function isAbsoluteFilePath(path: string): boolean {
  if (path.length === 0) return false;
  if (path[0] === '/') return true;
  return path.length >= 2 && /^[A-Za-z]:/.test(path);
}

// Joins segments into one path and resolves it, so the result is what normalizeFilePath would return
// for the same segments spelled as a single string. The two must agree: a caller who builds a path by
// joining and a caller who normalizes a literal have to get the same answer, or the same file has two
// spellings depending on which entry point produced it.
export function joinFilePath(...segments: readonly string[]): string {
  const absolute = segments.length > 0 && segments[0]?.startsWith('/') === true;
  return formatResolvedPath(resolvePathSegments(segments.join('/'), absolute), absolute);
}

export function makeDirectory(hostFileSystem: Readonly<HostFileSystemProvider>, path: string): Promise<boolean> {
  return hostFileSystem.makeDirectory?.(path) ?? Promise.resolve(false);
}

// Collapses empty and `.` segments and RESOLVES `..` against the segment before it, so a path has one
// spelling. Absolute and relative paths differ at the root, and the difference is deliberate:
//
//   normalizeFilePath('/a/b/../c')   -> '/a/c'
//   normalizeFilePath('/a/../../b')  -> '/b'      root clamps; there is nothing above it
//   normalizeFilePath('a/../../b')   -> '../b'    a leading `..` is KEPT
//
// The relative case is the one worth stating. A relative path can genuinely refer to a parent, so
// dropping the leading `..` would not merely lose information — it would rewrite a path that escapes its
// base into one that appears not to, which is the wrong direction to be wrong in for a caller checking
// containment. Clamping at the root of an ABSOLUTE path is safe for the mirror-image reason: `/..` has
// no referent other than `/`, which is POSIX's own answer.
export function normalizeFilePath(path: string): string {
  const absolute = path.startsWith('/');
  return formatResolvedPath(resolvePathSegments(path, absolute), absolute);
}

export function openFileReadStream(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  path: string,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array> | null> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const open = hostFileSystem.openFileReadStream;
  if (open === undefined) return Promise.resolve(null);
  return signal === undefined ? open(path) : open(path, signal);
}

export function openFileWriteStream(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  path: string,
  signal?: AbortSignal,
): Promise<WritableStream<Uint8Array> | null> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const open = hostFileSystem.openFileWriteStream;
  if (open === undefined) return Promise.resolve(null);
  return signal === undefined ? open(path) : open(path, signal);
}

export function readBinaryFile(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  path: string,
  signal?: AbortSignal,
): Promise<Uint8Array | null> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const read = hostFileSystem.readBinaryFile;
  if (read === undefined) return Promise.resolve(null);
  return signal === undefined ? read(path) : read(path, signal);
}

export function readBinaryFileRange(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  path: string,
  offset: number,
  length: number,
  signal?: AbortSignal,
): Promise<Uint8Array | null> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const read = hostFileSystem.readBinaryFileRange;
  if (read === undefined) return Promise.resolve(null);
  return signal === undefined ? read(path, offset, length) : read(path, offset, length, signal);
}

export async function readDialogHandleBinaryFile(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  handle: Readonly<FileDialogHandle>,
  signal?: AbortSignal,
): Promise<Uint8Array | null> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (handle.path !== null) return readBinaryFile(hostFileSystem, handle.path, signal);
  const read = getFileDialogHandleOperations(handle)?.readBinary;
  if (read === undefined) return null;
  return signal === undefined ? read() : read(signal);
}

export async function readDialogHandleTextFile(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  handle: Readonly<FileDialogHandle>,
  signal?: AbortSignal,
): Promise<string | null> {
  signal?.throwIfAborted();
  if (handle.path !== null) return readTextFile(hostFileSystem, handle.path, signal);
  const read = getFileDialogHandleOperations(handle)?.readText;
  if (read === undefined) return null;
  return signal === undefined ? read() : read(signal);
}

export function readDirectory(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  path: string,
  signal?: AbortSignal,
): Promise<FileEntry[]> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const read = hostFileSystem.readDirectory;
  if (read === undefined) return Promise.resolve([]);
  return signal === undefined ? read(path) : read(path, signal);
}

export function readDirectoryRecursive(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  path: string,
  options?: Readonly<FileWalkOptions>,
): Promise<readonly FileEntry[]> {
  if (options?.signal?.aborted) return Promise.reject(options.signal.reason);
  const read = hostFileSystem.readDirectoryRecursive;
  if (read === undefined) return Promise.resolve([]);
  return options === undefined ? read(path) : read(path, options);
}

// Symlinks are outside the honest host-provider surface until a real provider exists.
export function readFileSymlink(_path: string): Promise<string | null> {
  return Promise.resolve(null);
}

export function readTextFile(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  path: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const read = hostFileSystem.readTextFile;
  if (read === undefined) return Promise.resolve(null);
  return signal === undefined ? read(path) : read(path, signal);
}

export function removeDirectory(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  path: string,
  recursive?: boolean,
): Promise<boolean> {
  return hostFileSystem.removeDirectory?.(path, recursive) ?? Promise.resolve(false);
}

export function removeFile(hostFileSystem: Readonly<HostFileSystemProvider>, path: string): Promise<boolean> {
  return hostFileSystem.removeFile?.(path) ?? Promise.resolve(false);
}

export function renameFile(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  from: string,
  to: string,
): Promise<boolean> {
  return hostFileSystem.rename?.(from, to) ?? Promise.resolve(false);
}

// POSIX permissions are outside the honest host-provider surface until a real provider exists.
export function setFilePermissions(_path: string, _permissions: Readonly<FilePermissions>): Promise<boolean> {
  return Promise.resolve(false);
}

export function statFile(hostFileSystem: Readonly<HostFileSystemProvider>, path: string): Promise<FileStat | null> {
  return hostFileSystem.statFile?.(path) ?? Promise.resolve(null);
}

// File watching is outside the honest host-provider surface until a real provider exists.
export function watchPath(_path: string, _listener: (event: Readonly<FileWatchEvent>) => void): () => void {
  return () => {};
}

export function writeBinaryFile(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  path: string,
  data: Readonly<Uint8Array>,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const write = hostFileSystem.writeBinaryFile;
  if (write === undefined) return Promise.resolve(false);
  return signal === undefined ? write(path, data) : write(path, data, signal);
}

export async function writeBinaryFileChunks(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  path: string,
  chunks: AsyncIterable<Readonly<Uint8Array>>,
  signal?: AbortSignal,
): Promise<boolean> {
  signal?.throwIfAborted();
  const stream = await openFileWriteStream(hostFileSystem, path, signal);
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
  hostFileSystem: Readonly<HostFileSystemProvider>,
  handle: Readonly<FileDialogHandle>,
  data: Readonly<Uint8Array>,
  signal?: AbortSignal,
): Promise<boolean> {
  signal?.throwIfAborted();
  if (handle.path !== null) return writeBinaryFile(hostFileSystem, handle.path, data, signal);
  const write = getFileDialogHandleOperations(handle)?.writeBinary;
  if (write === undefined) return false;
  return signal === undefined ? write(data) : write(data, signal);
}

export async function writeDialogHandleTextFile(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  handle: Readonly<FileDialogHandle>,
  data: string,
  signal?: AbortSignal,
): Promise<boolean> {
  signal?.throwIfAborted();
  if (handle.path !== null) return writeTextFile(hostFileSystem, handle.path, data, signal);
  const write = getFileDialogHandleOperations(handle)?.writeText;
  if (write === undefined) return false;
  return signal === undefined ? write(data) : write(data, signal);
}

export function writeFileAtomic(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  path: string,
  data: Readonly<Uint8Array> | string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const write = hostFileSystem.writeFileAtomic;
  if (write === undefined) return Promise.resolve(false);
  return signal === undefined ? write(path, data) : write(path, data, signal);
}

export function writeTextFile(
  hostFileSystem: Readonly<HostFileSystemProvider>,
  path: string,
  data: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const write = hostFileSystem.writeTextFile;
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

// A relative path that resolves to nothing is `.`, not the empty string: `a/..` names the directory the
// path started from, and returning '' would hand the caller a falsy value that concatenates wrongly and
// reads as "no path" rather than "here". This matches POSIX, and it is the answer for the `..`
// cancellations this resolution newly makes reachable. An absolute path that resolves to nothing is `/`.
function formatResolvedPath(segments: readonly string[], absolute: boolean): string {
  if (absolute) return '/' + segments.join('/');
  return segments.length === 0 ? '.' : segments.join('/');
}

// Drops empty and `.` segments and applies each `..` to the segment before it. A `..` with nothing to
// apply to is dropped when `absolute` (root clamps) and kept when relative (it still refers to a
// parent). Only a LEADING run of `..` can survive in a relative path, because any `..` after a real
// segment consumes that segment instead.
function resolvePathSegments(path: string, absolute: boolean): string[] {
  const out: string[] = [];
  for (const segment of splitPath(path)) {
    if (segment !== '..') {
      out.push(segment);
      continue;
    }
    const previous = out[out.length - 1];
    if (previous !== undefined && previous !== '..') {
      out.pop();
      continue;
    }
    if (!absolute) out.push('..');
  }
  return out;
}
