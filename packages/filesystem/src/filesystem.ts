import type { FileEntry, FileStat, FileSystemBackend, FileSystemPathKind, FileWatchEvent } from '@flighthq/types';

// Appends text to a file, creating it when missing. Returns false when the host denies access.
export function appendTextFile(path: string, data: string): Promise<boolean> {
  return getFileSystemBackend().appendTextFile(path, data);
}

// Copies a file from `from` to `to`. Returns false when the source is missing or access is denied.
export function copyFile(from: string, to: string): Promise<boolean> {
  return getFileSystemBackend().copy(from, to);
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
    async writeBinaryFile(path, data) {
      // Copy into a fresh buffer; the Readonly<Uint8Array> input must not be mutated and write() needs a
      // BufferSource it can consume.
      return writeWebFile(path, data.slice());
    },
    async fileExists(path) {
      return (await getWebFileHandle(path, false)) !== null;
    },
    async removeFile(path) {
      return writeWebRemove(path);
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
      return writeWebRemove(from);
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

// True when a file exists at `path`. Returns false when the host lacks access.
export function fileExists(path: string): Promise<boolean> {
  return getFileSystemBackend().fileExists(path);
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

// Creates a directory (and parents) at `path`. Returns false when the host denies access.
export function makeDirectory(path: string): Promise<boolean> {
  return getFileSystemBackend().makeDirectory(path);
}

// Reads a file as bytes, or null when missing or access is denied.
export function readBinaryFile(path: string): Promise<Uint8Array | null> {
  return getFileSystemBackend().readBinaryFile(path);
}

// Lists directory entries, or [] when missing or access is denied.
export function readDirectory(path: string): Promise<FileEntry[]> {
  return getFileSystemBackend().readDirectory(path);
}

// Reads a file as text, or null when missing or access is denied.
export function readTextFile(path: string): Promise<string | null> {
  return getFileSystemBackend().readTextFile(path);
}

// Removes a file or directory at `path`. Returns false when missing or access is denied.
export function removeFile(path: string): Promise<boolean> {
  return getFileSystemBackend().removeFile(path);
}

// Renames or moves a file from `from` to `to`. Returns false when the source is missing or access is denied.
export function renameFile(from: string, to: string): Promise<boolean> {
  return getFileSystemBackend().rename(from, to);
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

async function writeWebRemove(path: string): Promise<boolean> {
  const root = await getWebRoot();
  if (root === null) return false;
  const segments = splitWebPath(path);
  if (segments.length === 0) return false;
  try {
    const parent = await getWebDirectoryHandle(root, segments.slice(0, -1), false);
    if (parent === null) return false;
    await parent.removeEntry(segments[segments.length - 1], { recursive: true });
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

function normalizeWebPath(path: string): string {
  return splitWebPath(path).join('/');
}

function splitWebPath(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '' && segment !== '.');
}
