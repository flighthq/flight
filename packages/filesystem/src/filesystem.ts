import { getWebFileSystemHandle } from '@flighthq/dialog';
import type {
  FileDialogHandle,
  FileEntry,
  FilePermissions,
  FileStat,
  FileSystemBackend,
  FileSystemPathKind,
  FileSystemUsage,
  FileWalkOptions,
  FileWatchEvent,
} from '@flighthq/types';

// Appends text to a file, creating it when missing. Returns false when the host denies access.
export function appendTextFile(path: string, data: string): Promise<boolean> {
  return getFileSystemBackend().appendTextFile(path, data);
}

// True when the file/directory at `path` can be accessed in the given mode. Web returns false for
// 'executable'; 'readable' and 'writable' are best-effort via fileExists / createWritable probe.
export function canAccessFile(path: string, mode: 'readable' | 'writable' | 'executable'): Promise<boolean> {
  return getFileSystemBackend().canAccessFile(path, mode);
}

// Copies a file from `from` to `to`. Returns false when the source is missing or access is denied.
export function copyFile(from: string, to: string): Promise<boolean> {
  return getFileSystemBackend().copy(from, to);
}

// Creates a symbolic link at `linkPath` pointing to `target`. Returns false when the operation is
// unsupported (web/OPFS always returns false — OPFS has no symlinks; native-only capability).
export function createFileSymlink(target: string, linkPath: string): Promise<boolean> {
  return getFileSystemBackend().createFileSymlink(target, linkPath);
}

// Builds the default web backend over the Origin Private File System (OPFS). `path` is treated as a
// '/'-separated relative path within the OPFS root. Every API touch is guarded and wrapped in try/catch;
// when navigator.storage.getDirectory is absent (e.g. jsdom) all ops resolve to sentinels (null/false/[]).
export function createWebFileSystemBackend(): FileSystemBackend {
  return {
    async readTextFile(path) {
      const handle = await getWebFileHandle(path, false);
      if (handle === null) return null;
      try {
        const file = await handle.getFile();
        return await file.text();
      } catch {
        return null;
      }
    },
    async writeTextFile(path, data) {
      return writeWebFile(path, data);
    },
    async readBinaryFile(path) {
      const handle = await getWebFileHandle(path, false);
      if (handle === null) return null;
      try {
        const file = await handle.getFile();
        return new Uint8Array(await file.arrayBuffer());
      } catch {
        return null;
      }
    },
    async readBinaryFileRange(path, offset, length) {
      const handle = await getWebFileHandle(path, false);
      if (handle === null) return null;
      try {
        const file = await handle.getFile();
        if (offset >= file.size) return new Uint8Array(0);
        const slice = file.slice(offset, offset + length);
        return new Uint8Array(await slice.arrayBuffer());
      } catch {
        return null;
      }
    },
    async writeBinaryFile(path, data) {
      // Copy into a fresh buffer; the Readonly<Uint8Array> input must not be mutated and write() needs a
      // BufferSource it can consume.
      return writeWebFile(path, data.slice());
    },
    async fileExists(path) {
      return (await getWebFileHandle(path, false)) !== null;
    },
    async directoryExists(path) {
      const root = await getWebRoot();
      if (root === null) return false;
      return (await getWebDirectoryHandle(root, splitWebPath(path), false)) !== null;
    },
    async removeFile(path) {
      return writeWebRemove(path, false);
    },
    async removeDirectory(path, recursive = false) {
      const root = await getWebRoot();
      if (root === null) return false;
      const segments = splitWebPath(path);
      if (segments.length === 0) return false;
      // Verify the target is actually a directory before removing it.
      const parent = await getWebDirectoryHandle(root, segments.slice(0, -1), false);
      if (parent === null) return false;
      try {
        await parent.removeEntry(segments[segments.length - 1], { recursive });
        return true;
      } catch {
        return false;
      }
    },
    async makeDirectory(path) {
      const root = await getWebRoot();
      if (root === null) return false;
      const created = await getWebDirectoryHandle(root, splitWebPath(path), true);
      return created !== null;
    },
    async readDirectory(path) {
      const root = await getWebRoot();
      if (root === null) return [];
      const dir = await getWebDirectoryHandle(root, splitWebPath(path), false);
      if (dir === null) return [];
      const entries: FileEntry[] = [];
      try {
        const base = normalizeWebPath(path);
        for await (const [name, handle] of asAsyncEntries(dir)) {
          const isDirectory = handle.kind === 'directory';
          entries.push({ name, path: base === '' ? name : `${base}/${name}`, isDirectory });
        }
      } catch {
        return [];
      }
      return entries;
    },
    async readDirectoryRecursive(path, options) {
      const root = await getWebRoot();
      if (root === null) return [];
      const dir = await getWebDirectoryHandle(root, splitWebPath(path), false);
      if (dir === null) return [];
      const base = normalizeWebPath(path);
      const results: FileEntry[] = [];
      try {
        await walkWebDirectory(dir, base, results, 0, options?.maxDepth ?? Infinity);
      } catch {
        return [];
      }
      return results;
    },
    async statFile(path) {
      const fileHandle = await getWebFileHandle(path, false);
      if (fileHandle !== null) {
        try {
          const file = await fileHandle.getFile();
          // OPFS exposes no creation time; fall back to lastModified for files, 0 for directories.
          return {
            size: file.size,
            isDirectory: false,
            modifiedTime: file.lastModified,
            createdTime: file.lastModified,
            isSymlink: false,
          };
        } catch {
          return null;
        }
      }
      const root = await getWebRoot();
      if (root === null) return null;
      const dir = await getWebDirectoryHandle(root, splitWebPath(path), false);
      if (dir === null) return null;
      return { size: 0, isDirectory: true, modifiedTime: 0, createdTime: 0, isSymlink: false };
    },
    async rename(from, to) {
      // OPFS has no native rename; copy then remove the source.
      if (!(await this.copy(from, to))) return false;
      return writeWebRemove(from, false);
    },
    async copy(from, to) {
      const root = await getWebRoot();
      if (root === null) return false;
      const handle = await getWebFileHandle(from, false);
      if (handle === null) return false;
      try {
        const file = await handle.getFile();
        const bytes = new Uint8Array(await file.arrayBuffer());
        return writeWebFile(to, bytes);
      } catch {
        return false;
      }
    },
    async appendTextFile(path, data) {
      const handle = await getWebFileHandle(path, false);
      let existing = '';
      if (handle !== null) {
        try {
          existing = await (await handle.getFile()).text();
        } catch {
          existing = '';
        }
      }
      return writeWebFile(path, existing + data);
    },
    async openFileReadStream(path) {
      const handle = await getWebFileHandle(path, false);
      if (handle === null) return null;
      try {
        const file = await handle.getFile();
        return file.stream() as unknown as ReadableStream<Uint8Array>;
      } catch {
        return null;
      }
    },
    async openFileWriteStream(path) {
      const handle = await getWebFileHandle(path, true);
      if (handle === null || typeof handle.createWritable !== 'function') return null;
      try {
        return (await handle.createWritable()) as unknown as WritableStream<Uint8Array>;
      } catch {
        return null;
      }
    },
    async writeFileAtomic(path, data) {
      // OPFS has no OS-level atomic rename; write to a temp sibling then overwrite the destination.
      // This is best-effort (not crash-safe) but avoids partial-write corruption under normal conditions.
      const tmpPath = path + '.__atomic_tmp__';
      const payload = typeof data === 'string' ? data : data.slice();
      if (!(await writeWebFile(tmpPath, payload))) return false;
      // Copy temp content into the real destination, then remove temp.
      const tmpHandle = await getWebFileHandle(tmpPath, false);
      if (tmpHandle !== null) {
        try {
          const file = await tmpHandle.getFile();
          const bytes = new Uint8Array(await file.arrayBuffer());
          const ok = await writeWebFile(path, bytes);
          await writeWebRemove(tmpPath, false);
          return ok;
        } catch {
          await writeWebRemove(tmpPath, false);
          return false;
        }
      }
      return false;
    },
    async createFileSymlink() {
      // OPFS has no symbolic links; this capability is native-only.
      return false;
    },
    async readFileSymlink() {
      // OPFS has no symbolic links; always returns null on web.
      return null;
    },
    async getFileRealPath() {
      // OPFS paths are already canonical; realpath is not meaningful on web.
      return null;
    },
    async getFilePermissions() {
      // POSIX-style permissions have no OPFS equivalent; always returns null on web.
      return null;
    },
    async setFilePermissions() {
      // OPFS has no file permissions model; always returns false on web.
      return false;
    },
    async canAccessFile(path, mode) {
      if (mode === 'executable') return false;
      if (mode === 'readable') {
        const handle = await getWebFileHandle(path, false);
        if (handle !== null) return true;
        const root = await getWebRoot();
        if (root === null) return false;
        return (await getWebDirectoryHandle(root, splitWebPath(path), false)) !== null;
      }
      // writable: probe whether createWritable succeeds (and immediately abort it).
      const handle = await getWebFileHandle(path, false);
      if (handle === null) return false;
      try {
        const writable = await handle.createWritable();
        await writable.abort();
        return true;
      } catch {
        return false;
      }
    },
    async getFileSystemUsage() {
      if (typeof navigator === 'undefined') return null;
      const storage = navigator.storage;
      if (storage === undefined || typeof storage.estimate !== 'function') return null;
      try {
        const estimate = await storage.estimate();
        return {
          usedBytes: estimate.usage ?? 0,
          quotaBytes: estimate.quota ?? 0,
        };
      } catch {
        return null;
      }
    },
    watch() {
      // OPFS exposes no change notifications; a native host is required to deliver file watch events.
      return () => {};
    },
    getPath() {
      // The web platform has no well-known host directories; native hosts override this.
      return '';
    },
  };
}

// True when a directory exists at `path`. Returns false when missing or access is denied.
// Edge case on the web backend: passing an empty string ('') resolves to the OPFS root, which
// always exists — directoryExists('') returns true on web. Use an explicit non-empty path.
export function directoryExists(path: string): Promise<boolean> {
  return getFileSystemBackend().directoryExists(path);
}

// True when a file exists at `path`. Returns false when the host lacks access.
export function fileExists(path: string): Promise<boolean> {
  return getFileSystemBackend().fileExists(path);
}

// Returns all entries under `rootPath` whose name or path matches the given glob pattern.
// Supports '*' (any chars within a segment), '**' (any depth), and '?' (single char).
// Composes with readDirectoryRecursive; [] sentinel for missing or access denied.
export async function findFiles(rootPath: string, pattern: string): Promise<readonly FileEntry[]> {
  const all = await getFileSystemBackend().readDirectoryRecursive(rootPath);
  if (all.length === 0) return [];
  const re = globToRegExp(pattern);
  return all.filter((entry) => re.test(entry.name) || re.test(entry.path));
}

// Returns the base name of a path (the final segment, with extension). e.g. 'foo/bar.txt' → 'bar.txt'.
export function getFileBaseName(path: string): string {
  const segments = splitWebPath(path);
  return segments.length === 0 ? '' : (segments[segments.length - 1] as string);
}

// Returns the directory portion of a path (all segments before the last). e.g. 'foo/bar.txt' → 'foo'.
export function getFileDirectoryName(path: string): string {
  const segments = splitWebPath(path);
  if (segments.length <= 1) return '';
  return segments.slice(0, -1).join('/');
}

// Returns the file extension including the leading dot, or '' if none. e.g. 'foo/bar.txt' → '.txt'.
export function getFileExtensionName(path: string): string {
  const base = getFileBaseName(path);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
}

// Returns permission attributes for `path`, or null when permissions are not available.
// OPFS has no permission model; web always returns null. Native backends return chmod-style data.
export function getFilePermissions(path: string): Promise<FilePermissions | null> {
  return getFileSystemBackend().getFilePermissions(path);
}

// Resolves a path to its canonical (symlink-free) absolute path, or null when the path is missing,
// access is denied, or symlinks are unsupported (web always returns null).
export function getFileRealPath(path: string): Promise<string | null> {
  return getFileSystemBackend().getFileRealPath(path);
}

// The active file system backend, or a lazily-created web (OPFS) default. There is always a backend.
export function getFileSystemBackend(): FileSystemBackend {
  if (_backend === null) _backend = createWebFileSystemBackend();
  return _backend;
}

// Resolves a well-known host directory to an absolute path, or '' on web / when unavailable.
export function getFileSystemPath(kind: FileSystemPathKind): string {
  return getFileSystemBackend().getPath(kind);
}

// Returns disk or quota usage for the active file system. Web implements over
// navigator.storage.estimate(); native over statvfs. Returns null when unavailable.
export function getFileSystemUsage(): Promise<FileSystemUsage | null> {
  return getFileSystemBackend().getFileSystemUsage();
}

// True when `path` is an absolute path (starts with '/' or a drive letter on Windows e.g. 'C:').
export function isAbsoluteFilePath(path: string): boolean {
  if (path.length === 0) return false;
  if (path[0] === '/') return true;
  // Windows drive letter: e.g. 'C:\' or 'C:/'
  if (path.length >= 2 && /^[A-Za-z]:/.test(path)) return true;
  return false;
}

// Joins path segments with '/', normalizing redundant separators and '.' segments.
// e.g. joinFilePath('foo', 'bar', 'baz.txt') → 'foo/bar/baz.txt'
export function joinFilePath(...segments: readonly string[]): string {
  const parts: string[] = [];
  for (const segment of segments) {
    for (const part of segment.split('/')) {
      if (part === '' || part === '.') continue;
      parts.push(part);
    }
  }
  const prefix = segments.length > 0 && segments[0] !== undefined && segments[0].startsWith('/') ? '/' : '';
  return prefix + parts.join('/');
}

// Creates a directory (and parents) at `path`. Returns false when the host denies access.
export function makeDirectory(path: string): Promise<boolean> {
  return getFileSystemBackend().makeDirectory(path);
}

// Normalizes a path: collapses redundant separators, removes '.' segments, preserves leading '/'.
// e.g. normalizeFilePath('foo//./bar') → 'foo/bar'
export function normalizeFilePath(path: string): string {
  const parts = splitWebPath(path);
  const prefix = path.startsWith('/') ? '/' : '';
  return prefix + parts.join('/');
}

// Opens a ReadableStream over the file at `path`. Returns null when the file is missing, access is
// denied, or streaming is not supported by the active backend. OPFS implements via File.stream().
export function openFileReadStream(path: string): Promise<ReadableStream<Uint8Array> | null> {
  return getFileSystemBackend().openFileReadStream(path);
}

// Opens a WritableStream to the file at `path`, creating it when absent. Returns null when access is
// denied or streaming is not supported. OPFS implements via FileSystemFileHandle.createWritable().
export function openFileWriteStream(path: string): Promise<WritableStream<Uint8Array> | null> {
  return getFileSystemBackend().openFileWriteStream(path);
}

// Reads a file as bytes, or null when missing or access is denied.
export function readBinaryFile(path: string): Promise<Uint8Array | null> {
  return getFileSystemBackend().readBinaryFile(path);
}

// Reads a byte slice of a file at `offset` with `length` bytes. Returns an empty Uint8Array for
// out-of-range access, null for missing or access denied.
export function readBinaryFileRange(path: string, offset: number, length: number): Promise<Uint8Array | null> {
  return getFileSystemBackend().readBinaryFileRange(path, offset, length);
}

// Reads bytes from a FileDialogHandle produced by @flighthq/dialog on web via the File System
// Access API, or falls back to the OPFS backend by name when the native handle is unavailable.
// On native hosts (Electron/Tauri), delegates to readBinaryFile using handle.path.
// Returns null when the handle is unreadable or the path is unavailable.
export async function readDialogHandleBinaryFile(handle: Readonly<FileDialogHandle>): Promise<Uint8Array | null> {
  // On native hosts, path is a real file-system path; delegate to the backend directly.
  if (handle.path !== null) return getFileSystemBackend().readBinaryFile(handle.path);
  // On web: use the live FileSystemFileHandle stashed by the dialog backend, if any.
  const fsHandle = getWebFileSystemHandle(handle);
  if (fsHandle !== null) {
    try {
      const file = await fsHandle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch {
      return null;
    }
  }
  // Fallback: try OPFS by file name (only works if the file was previously written to OPFS).
  if (handle.name === '') return null;
  return getFileSystemBackend().readBinaryFile(handle.name);
}

// Reads text from a FileDialogHandle produced by @flighthq/dialog on web via the File System
// Access API, or falls back to the OPFS backend by name when the native handle is unavailable.
// On native hosts (Electron/Tauri), delegates to readTextFile using handle.path.
// Returns null when the handle is unreadable or the path is unavailable.
export async function readDialogHandleTextFile(handle: Readonly<FileDialogHandle>): Promise<string | null> {
  // On native hosts, path is a real file-system path; delegate to the backend directly.
  if (handle.path !== null) return getFileSystemBackend().readTextFile(handle.path);
  // On web: use the live FileSystemFileHandle stashed by the dialog backend, if any.
  const fsHandle = getWebFileSystemHandle(handle);
  if (fsHandle !== null) {
    try {
      const file = await fsHandle.getFile();
      return await file.text();
    } catch {
      return null;
    }
  }
  // Fallback: try OPFS by file name (only works if the file was previously written to OPFS).
  if (handle.name === '') return null;
  return getFileSystemBackend().readTextFile(handle.name);
}

// Lists directory entries (one level only), or [] when missing or access is denied.
export function readDirectory(path: string): Promise<FileEntry[]> {
  return getFileSystemBackend().readDirectory(path);
}

// Depth-first walk returning all descendants with full relative paths. [] sentinel for missing/denied.
export function readDirectoryRecursive(
  path: string,
  options?: Readonly<FileWalkOptions>,
): Promise<readonly FileEntry[]> {
  return getFileSystemBackend().readDirectoryRecursive(path, options);
}

// Reads the target of a symbolic link at `path`. Returns null when path is not a symlink, is
// missing, or symlinks are unsupported (web/OPFS always returns null).
export function readFileSymlink(path: string): Promise<string | null> {
  return getFileSystemBackend().readFileSymlink(path);
}

// Reads a file as text, or null when missing or access is denied.
export function readTextFile(path: string): Promise<string | null> {
  return getFileSystemBackend().readTextFile(path);
}

// Removes a directory at `path`. When recursive is false (default), fails on non-empty directories.
// Returns false when missing or access is denied.
export function removeDirectory(path: string, recursive?: boolean): Promise<boolean> {
  return getFileSystemBackend().removeDirectory(path, recursive);
}

// Removes a file at `path`. Returns false when missing or access is denied.
// To remove a directory, use removeDirectory.
export function removeFile(path: string): Promise<boolean> {
  return getFileSystemBackend().removeFile(path);
}

// Renames or moves a file from `from` to `to`. Returns false when the source is missing or access is denied.
export function renameFile(from: string, to: string): Promise<boolean> {
  return getFileSystemBackend().rename(from, to);
}

// Sets file permissions for `path`. Returns false when unsupported (web/OPFS always returns false;
// native POSIX backends use chmod). A no-op on platforms without a permissions model.
export function setFilePermissions(path: string, permissions: Readonly<FilePermissions>): Promise<boolean> {
  return getFileSystemBackend().setFilePermissions(path, permissions);
}

// Installs a native host file system backend; pass null to fall back to the web (OPFS) default.
export function setFileSystemBackend(backend: FileSystemBackend | null): void {
  _backend = backend;
}

// Reads metadata for `path`, or null when missing or access is denied.
export function statFile(path: string): Promise<FileStat | null> {
  return getFileSystemBackend().statFile(path);
}

// Watches `path` for create/modify/delete changes, returning an unsubscribe function. On web the
// returned function is a no-op because OPFS exposes no change notifications.
export function watchPath(path: string, listener: (event: Readonly<FileWatchEvent>) => void): () => void {
  return getFileSystemBackend().watch(path, listener);
}

// Writes bytes to a file, creating parent directories. Returns false when the host denies access.
export function writeBinaryFile(path: string, data: Readonly<Uint8Array>): Promise<boolean> {
  return getFileSystemBackend().writeBinaryFile(path, data);
}

// Writes all chunks from an async iterable to `path`, creating the file when absent. Each chunk is
// flushed through the backend's write stream; the whole payload is never held in memory at once.
// Returns false when the file cannot be opened or a chunk write fails.
export async function writeBinaryFileChunks(
  path: string,
  chunks: AsyncIterable<Readonly<Uint8Array>>,
): Promise<boolean> {
  const stream = await getFileSystemBackend().openFileWriteStream(path);
  if (stream === null) return false;
  const writer = stream.getWriter();
  try {
    for await (const chunk of chunks) {
      await writer.write(chunk.slice());
    }
    await writer.close();
    return true;
  } catch {
    await writer.abort();
    return false;
  }
}

// Writes bytes to a FileDialogHandle produced by @flighthq/dialog (typically a save-file handle).
// On web, uses the live writable FileSystemFileHandle stashed by the dialog backend when available.
// On native hosts (Electron/Tauri), delegates to writeBinaryFile using handle.path.
// Returns false when the handle is not writable or the path is unavailable.
export async function writeDialogHandleBinaryFile(
  handle: Readonly<FileDialogHandle>,
  data: Readonly<Uint8Array>,
): Promise<boolean> {
  // On native hosts, path is a real file-system path; delegate to the backend directly.
  if (handle.path !== null) return getFileSystemBackend().writeBinaryFile(handle.path, data);
  // On web: use the live FileSystemFileHandle stashed by the dialog backend, if any.
  const fsHandle = getWebFileSystemHandle(handle);
  if (fsHandle === null) return false;
  try {
    const writable = await fsHandle.createWritable();
    await writable.write(data.slice());
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

// Writes text to a FileDialogHandle produced by @flighthq/dialog (typically a save-file handle).
// On web, uses the live writable FileSystemFileHandle stashed by the dialog backend when available.
// On native hosts (Electron/Tauri), delegates to writeTextFile using handle.path.
// Returns false when the handle is not writable or the path is unavailable.
export async function writeDialogHandleTextFile(handle: Readonly<FileDialogHandle>, data: string): Promise<boolean> {
  // On native hosts, path is a real file-system path; delegate to the backend directly.
  if (handle.path !== null) return getFileSystemBackend().writeTextFile(handle.path, data);
  // On web: use the live FileSystemFileHandle stashed by the dialog backend, if any.
  const fsHandle = getWebFileSystemHandle(handle);
  if (fsHandle === null) return false;
  try {
    const writable = await fsHandle.createWritable();
    await writable.write(data);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

// Atomic write: writes data to a temp sibling and moves it into place in one operation. Avoids
// partial-write corruption under normal conditions. On web (OPFS), the rename is copy+remove
// (not OS-atomic) — documented as best-effort. Returns false when the write or rename fails.
export function writeFileAtomic(path: string, data: Readonly<Uint8Array> | string): Promise<boolean> {
  return getFileSystemBackend().writeFileAtomic(path, data);
}

// Writes text to a file, creating parent directories. Returns false when the host denies access.
export function writeTextFile(path: string, data: string): Promise<boolean> {
  return getFileSystemBackend().writeTextFile(path, data);
}

let _backend: FileSystemBackend | null = null;

// The OPFS root, or null when the API is absent (non-secure context, jsdom). Never throws.
async function getWebRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === 'undefined') return null;
  const storage = navigator.storage;
  if (storage === undefined || typeof storage.getDirectory !== 'function') return null;
  try {
    return await storage.getDirectory();
  } catch {
    return null;
  }
}

async function getWebDirectoryHandle(
  root: FileSystemDirectoryHandle,
  segments: readonly string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  let current = root;
  try {
    for (const segment of segments) {
      current = await current.getDirectoryHandle(segment, { create });
    }
    return current;
  } catch {
    return null;
  }
}

async function getWebFileHandle(path: string, create: boolean): Promise<FileSystemFileHandle | null> {
  const root = await getWebRoot();
  if (root === null) return null;
  const segments = splitWebPath(path);
  if (segments.length === 0) return null;
  const parent = await getWebDirectoryHandle(root, segments.slice(0, -1), create);
  if (parent === null) return null;
  try {
    return await parent.getFileHandle(segments[segments.length - 1], { create });
  } catch {
    return null;
  }
}

// Recursively walks a directory handle, appending FileEntry results into `out`.
// `depth` is the current depth (0 = entries inside the root of the walk); `maxDepth` limits descent.
async function walkWebDirectory(
  dir: FileSystemDirectoryHandle,
  basePath: string,
  out: FileEntry[],
  depth: number,
  maxDepth: number,
): Promise<void> {
  for await (const [name, handle] of asAsyncEntries(dir)) {
    const entryPath = basePath === '' ? name : `${basePath}/${name}`;
    const isDirectory = handle.kind === 'directory';
    out.push({ name, path: entryPath, isDirectory });
    if (isDirectory && depth < maxDepth) {
      await walkWebDirectory(handle as FileSystemDirectoryHandle, entryPath, out, depth + 1, maxDepth);
    }
  }
}

// Removes a path from the OPFS tree. When `isDirectory` is true, only attempts removal via directory
// handle to enforce the file/directory verb split. When false, removes any entry type (files only).
async function writeWebRemove(path: string, isDirectory: boolean): Promise<boolean> {
  const root = await getWebRoot();
  if (root === null) return false;
  const segments = splitWebPath(path);
  if (segments.length === 0) return false;
  try {
    const parent = await getWebDirectoryHandle(root, segments.slice(0, -1), false);
    if (parent === null) return false;
    // For removeFile, verify target is not a directory before removing.
    if (!isDirectory) {
      const fileHandle = await getWebFileHandle(path, false);
      if (fileHandle === null) return false;
    }
    await parent.removeEntry(segments[segments.length - 1], { recursive: false });
    return true;
  } catch {
    return false;
  }
}

async function writeWebFile(path: string, data: string | Uint8Array): Promise<boolean> {
  const handle = await getWebFileHandle(path, true);
  if (handle === null || typeof handle.createWritable !== 'function') return false;
  try {
    const writable = await handle.createWritable();
    // Uint8Array<ArrayBufferLike> and string are both valid chunk inputs, but the union widens past
    // FileSystemWriteChunkType's overloads; cast to the lib.dom chunk type at the write boundary.
    await writable.write(data as FileSystemWriteChunkType);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

function asAsyncEntries(
  dir: FileSystemDirectoryHandle,
): AsyncIterable<[string, FileSystemFileHandle | FileSystemDirectoryHandle]> {
  return (
    dir as unknown as { entries(): AsyncIterable<[string, FileSystemFileHandle | FileSystemDirectoryHandle]> }
  ).entries();
}

// Converts a glob pattern (supporting *, **, and ?) to a RegExp. Each segment is matched case-sensitively.
// '*' matches any characters except '/', '**' matches any characters including '/', '?' matches one char.
function globToRegExp(pattern: string): RegExp {
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i] as string;
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // '**' matches any path including separators.
        re += '.*';
        i++;
        // Skip optional trailing separator after '**'.
        if (pattern[i + 1] === '/') i++;
      } else {
        // '*' matches within one path segment.
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      re += '\\' + ch;
    } else {
      re += ch;
    }
  }
  re += '$';
  return new RegExp(re);
}

function normalizeWebPath(path: string): string {
  return splitWebPath(path).join('/');
}

function splitWebPath(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '' && segment !== '.');
}
