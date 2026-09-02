import type { FileEntry, FileSystemHostBackend } from '@flighthq/types/contract';

// Stable OPFS provider. Unsupported symlink, permissions, real-path, watch, and well-known-path
// operations are intentionally absent; @flighthq/filesystem owns those documented absence results.
export const webFileSystemBackend: FileSystemHostBackend = {
  async appendTextFile(path, data, signal) {
    signal?.throwIfAborted();
    const handle = await getFileHandle(path, false);
    signal?.throwIfAborted();
    let existing = '';
    if (handle !== null) {
      try {
        const file = await handle.getFile();
        signal?.throwIfAborted();
        existing = await file.text();
      } catch {
        existing = '';
      }
    }
    signal?.throwIfAborted();
    return writeFile(path, existing + data, signal);
  },
  async canAccessFile(path, mode) {
    if (mode === 'executable') return false;
    if (mode === 'readable') {
      const handle = await getFileHandle(path, false);
      if (handle !== null) return true;
      const root = await getRoot();
      return root !== null && (await getDirectoryHandle(root, splitPath(path), false)) !== null;
    }
    const handle = await getFileHandle(path, false);
    if (handle === null) return false;
    try {
      const writable = await handle.createWritable();
      await writable.abort();
      return true;
    } catch {
      return false;
    }
  },
  async copy(from, to) {
    const handle = await getFileHandle(from, false);
    if (handle === null) return false;
    try {
      const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      return writeFile(to, bytes);
    } catch {
      return false;
    }
  },
  async directoryExists(path) {
    const root = await getRoot();
    return root !== null && (await getDirectoryHandle(root, splitPath(path), false)) !== null;
  },
  async fileExists(path) {
    return (await getFileHandle(path, false)) !== null;
  },
  async getFileSystemUsage() {
    if (typeof navigator === 'undefined') return null;
    const storage = navigator.storage;
    if (storage === undefined || typeof storage.estimate !== 'function') return null;
    try {
      const estimate = await storage.estimate();
      return { quotaBytes: estimate.quota ?? 0, usedBytes: estimate.usage ?? 0 };
    } catch {
      return null;
    }
  },
  async makeDirectory(path) {
    const root = await getRoot();
    return root !== null && (await getDirectoryHandle(root, splitPath(path), true)) !== null;
  },
  async openFileReadStream(path, signal) {
    signal?.throwIfAborted();
    const handle = await getFileHandle(path, false);
    signal?.throwIfAborted();
    if (handle === null) return null;
    signal?.throwIfAborted();
    try {
      return (await handle.getFile()).stream() as unknown as ReadableStream<Uint8Array>;
    } catch {
      return null;
    }
  },
  async openFileWriteStream(path, signal) {
    signal?.throwIfAborted();
    const handle = await getFileHandle(path, true);
    signal?.throwIfAborted();
    if (handle === null || typeof handle.createWritable !== 'function') return null;
    signal?.throwIfAborted();
    try {
      return (await handle.createWritable()) as unknown as WritableStream<Uint8Array>;
    } catch {
      return null;
    }
  },
  async readBinaryFile(path, signal) {
    signal?.throwIfAborted();
    const handle = await getFileHandle(path, false);
    signal?.throwIfAborted();
    if (handle === null) return null;
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
  async readBinaryFileRange(path, offset, length, signal) {
    signal?.throwIfAborted();
    const handle = await getFileHandle(path, false);
    signal?.throwIfAborted();
    if (handle === null) return null;
    let file: File;
    try {
      file = await handle.getFile();
    } catch {
      return null;
    }
    signal?.throwIfAborted();
    if (offset >= file.size) return new Uint8Array(0);
    try {
      return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
    } catch {
      return null;
    }
  },
  async readDirectory(path, signal) {
    signal?.throwIfAborted();
    const root = await getRoot();
    signal?.throwIfAborted();
    if (root === null) return [];
    const directory = await getDirectoryHandle(root, splitPath(path), false);
    signal?.throwIfAborted();
    if (directory === null) return [];
    const entries: FileEntry[] = [];
    try {
      const base = normalizePath(path);
      for await (const [name, handle] of asAsyncEntries(directory)) {
        signal?.throwIfAborted();
        entries.push({
          isDirectory: handle.kind === 'directory',
          name,
          path: base === '' ? name : `${base}/${name}`,
        });
      }
      return entries;
    } catch {
      if (signal?.aborted) throw signal.reason;
      return [];
    }
  },
  async readDirectoryRecursive(path, options) {
    options?.signal?.throwIfAborted();
    const root = await getRoot();
    options?.signal?.throwIfAborted();
    if (root === null) return [];
    const directory = await getDirectoryHandle(root, splitPath(path), false);
    options?.signal?.throwIfAborted();
    if (directory === null) return [];
    const entries: FileEntry[] = [];
    try {
      await walkDirectory(directory, normalizePath(path), entries, 0, options?.maxDepth ?? Infinity, options?.signal);
      return entries;
    } catch {
      if (options?.signal?.aborted) throw options.signal.reason;
      return [];
    }
  },
  async readTextFile(path, signal) {
    signal?.throwIfAborted();
    const handle = await getFileHandle(path, false);
    signal?.throwIfAborted();
    if (handle === null) return null;
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
  async removeDirectory(path, recursive = false) {
    const root = await getRoot();
    if (root === null) return false;
    const segments = splitPath(path);
    if (segments.length === 0) return false;
    const parent = await getDirectoryHandle(root, segments.slice(0, -1), false);
    if (parent === null) return false;
    try {
      await parent.removeEntry(segments[segments.length - 1], { recursive });
      return true;
    } catch {
      return false;
    }
  },
  async removeFile(path) {
    return removeFile(path);
  },
  async rename(from, to) {
    const copied = await webFileSystemBackend.copy?.(from, to);
    return copied === true && (await removeFile(from));
  },
  async statFile(path) {
    const fileHandle = await getFileHandle(path, false);
    if (fileHandle !== null) {
      try {
        const file = await fileHandle.getFile();
        return {
          createdTime: file.lastModified,
          isDirectory: false,
          isSymlink: false,
          modifiedTime: file.lastModified,
          size: file.size,
        };
      } catch {
        return null;
      }
    }
    const root = await getRoot();
    if (root === null || (await getDirectoryHandle(root, splitPath(path), false)) === null) return null;
    return { createdTime: 0, isDirectory: true, isSymlink: false, modifiedTime: 0, size: 0 };
  },
  async writeBinaryFile(path, data, signal) {
    signal?.throwIfAborted();
    return writeFile(path, data.slice(), signal);
  },
  async writeFileAtomic(path, data, signal) {
    signal?.throwIfAborted();
    const temporaryPath = path + '.__atomic_tmp__';
    const payload = typeof data === 'string' ? data : data.slice();
    try {
      if (!(await writeFile(temporaryPath, payload, signal))) return false;
      const temporaryHandle = await getFileHandle(temporaryPath, false);
      signal?.throwIfAborted();
      if (temporaryHandle === null) return false;
      const file = await temporaryHandle.getFile();
      signal?.throwIfAborted();
      const bytes = new Uint8Array(await file.arrayBuffer());
      signal?.throwIfAborted();
      return await writeFile(path, bytes, signal);
    } catch {
      if (signal?.aborted) throw signal.reason;
      return false;
    } finally {
      await removeFile(temporaryPath);
    }
  },
  async writeTextFile(path, data, signal) {
    signal?.throwIfAborted();
    return writeFile(path, data, signal);
  },
};

function asAsyncEntries(
  directory: FileSystemDirectoryHandle,
): AsyncIterable<[string, FileSystemFileHandle | FileSystemDirectoryHandle]> {
  return (
    directory as unknown as {
      entries(): AsyncIterable<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
    }
  ).entries();
}

async function getDirectoryHandle(
  root: FileSystemDirectoryHandle,
  segments: readonly string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  let current = root;
  try {
    for (const segment of segments) current = await current.getDirectoryHandle(segment, { create });
    return current;
  } catch {
    return null;
  }
}

async function getFileHandle(path: string, create: boolean): Promise<FileSystemFileHandle | null> {
  const root = await getRoot();
  if (root === null) return null;
  const segments = splitPath(path);
  if (segments.length === 0) return null;
  const parent = await getDirectoryHandle(root, segments.slice(0, -1), create);
  if (parent === null) return null;
  try {
    return await parent.getFileHandle(segments[segments.length - 1], { create });
  } catch {
    return null;
  }
}

async function getRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === 'undefined') return null;
  const storage = navigator.storage;
  if (storage === undefined || typeof storage.getDirectory !== 'function') return null;
  try {
    return await storage.getDirectory();
  } catch {
    return null;
  }
}

function normalizePath(path: string): string {
  return splitPath(path).join('/');
}

async function removeFile(path: string): Promise<boolean> {
  const root = await getRoot();
  if (root === null) return false;
  const segments = splitPath(path);
  if (segments.length === 0) return false;
  try {
    const parent = await getDirectoryHandle(root, segments.slice(0, -1), false);
    if (parent === null || (await getFileHandle(path, false)) === null) return false;
    await parent.removeEntry(segments[segments.length - 1], { recursive: false });
    return true;
  } catch {
    return false;
  }
}

function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '' && segment !== '.');
}

async function walkDirectory(
  directory: FileSystemDirectoryHandle,
  basePath: string,
  out: FileEntry[],
  depth: number,
  maxDepth: number,
  signal?: AbortSignal,
): Promise<void> {
  for await (const [name, handle] of asAsyncEntries(directory)) {
    signal?.throwIfAborted();
    const path = basePath === '' ? name : `${basePath}/${name}`;
    const isDirectory = handle.kind === 'directory';
    out.push({ isDirectory, name, path });
    if (isDirectory && depth < maxDepth) {
      await walkDirectory(handle as FileSystemDirectoryHandle, path, out, depth + 1, maxDepth, signal);
    }
  }
}

async function writeFile(path: string, data: string | Uint8Array, signal?: AbortSignal): Promise<boolean> {
  signal?.throwIfAborted();
  const handle = await getFileHandle(path, true);
  signal?.throwIfAborted();
  if (handle === null || typeof handle.createWritable !== 'function') return false;
  let writable: FileSystemWritableFileStream;
  try {
    writable = await handle.createWritable();
  } catch {
    return false;
  }
  if (signal?.aborted) {
    await writable.abort(signal.reason).catch(() => {});
    throw signal.reason;
  }
  let aborted = false;
  let abortPromise: Promise<void> | null = null;
  const onAbort = () => {
    aborted = true;
    abortPromise = writable.abort(signal?.reason).catch(() => {});
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    await writable.write(data as FileSystemWriteChunkType);
    if (aborted) {
      await abortPromise;
      throw signal?.reason;
    }
    await writable.close();
    return true;
  } catch {
    if (abortPromise === null) await writable.abort().catch(() => {});
    else await abortPromise;
    if (aborted) throw signal?.reason;
    return false;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
