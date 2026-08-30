import type { FileEntry, FileSystemHostBackend } from '@flighthq/types/contract';

// Stable OPFS provider. Unsupported symlink, permissions, real-path, watch, and well-known-path
// operations are intentionally absent; @flighthq/filesystem owns those documented absence results.
export const webFileSystemBackend: FileSystemHostBackend = {
  async appendTextFile(path, data) {
    const handle = await getFileHandle(path, false);
    let existing = '';
    if (handle !== null) {
      try {
        existing = await (await handle.getFile()).text();
      } catch {
        existing = '';
      }
    }
    return writeFile(path, existing + data);
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
  async openFileReadStream(path) {
    const handle = await getFileHandle(path, false);
    if (handle === null) return null;
    try {
      return (await handle.getFile()).stream() as unknown as ReadableStream<Uint8Array>;
    } catch {
      return null;
    }
  },
  async openFileWriteStream(path) {
    const handle = await getFileHandle(path, true);
    if (handle === null || typeof handle.createWritable !== 'function') return null;
    try {
      return (await handle.createWritable()) as unknown as WritableStream<Uint8Array>;
    } catch {
      return null;
    }
  },
  async readBinaryFile(path) {
    const handle = await getFileHandle(path, false);
    if (handle === null) return null;
    try {
      return new Uint8Array(await (await handle.getFile()).arrayBuffer());
    } catch {
      return null;
    }
  },
  async readBinaryFileRange(path, offset, length) {
    const handle = await getFileHandle(path, false);
    if (handle === null) return null;
    try {
      const file = await handle.getFile();
      if (offset >= file.size) return new Uint8Array(0);
      return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
    } catch {
      return null;
    }
  },
  async readDirectory(path) {
    const root = await getRoot();
    if (root === null) return [];
    const directory = await getDirectoryHandle(root, splitPath(path), false);
    if (directory === null) return [];
    const entries: FileEntry[] = [];
    try {
      const base = normalizePath(path);
      for await (const [name, handle] of asAsyncEntries(directory)) {
        entries.push({
          isDirectory: handle.kind === 'directory',
          name,
          path: base === '' ? name : `${base}/${name}`,
        });
      }
      return entries;
    } catch {
      return [];
    }
  },
  async readDirectoryRecursive(path, options) {
    const root = await getRoot();
    if (root === null) return [];
    const directory = await getDirectoryHandle(root, splitPath(path), false);
    if (directory === null) return [];
    const entries: FileEntry[] = [];
    try {
      await walkDirectory(directory, normalizePath(path), entries, 0, options?.maxDepth ?? Infinity);
      return entries;
    } catch {
      return [];
    }
  },
  async readTextFile(path) {
    const handle = await getFileHandle(path, false);
    if (handle === null) return null;
    try {
      return await (await handle.getFile()).text();
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
  async writeBinaryFile(path, data) {
    return writeFile(path, data.slice());
  },
  async writeFileAtomic(path, data) {
    const temporaryPath = path + '.__atomic_tmp__';
    const payload = typeof data === 'string' ? data : data.slice();
    if (!(await writeFile(temporaryPath, payload))) return false;
    const temporaryHandle = await getFileHandle(temporaryPath, false);
    if (temporaryHandle === null) return false;
    try {
      const bytes = new Uint8Array(await (await temporaryHandle.getFile()).arrayBuffer());
      const written = await writeFile(path, bytes);
      await removeFile(temporaryPath);
      return written;
    } catch {
      await removeFile(temporaryPath);
      return false;
    }
  },
  async writeTextFile(path, data) {
    return writeFile(path, data);
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
): Promise<void> {
  for await (const [name, handle] of asAsyncEntries(directory)) {
    const path = basePath === '' ? name : `${basePath}/${name}`;
    const isDirectory = handle.kind === 'directory';
    out.push({ isDirectory, name, path });
    if (isDirectory && depth < maxDepth) {
      await walkDirectory(handle as FileSystemDirectoryHandle, path, out, depth + 1, maxDepth);
    }
  }
}

async function writeFile(path: string, data: string | Uint8Array): Promise<boolean> {
  const handle = await getFileHandle(path, true);
  if (handle === null || typeof handle.createWritable !== 'function') return false;
  try {
    const writable = await handle.createWritable();
    await writable.write(data as FileSystemWriteChunkType);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}
