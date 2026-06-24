import { setDialogBackend } from '@flighthq/dialog';
import type {
  FileDialogHandle,
  FileEntry,
  FilePermissions,
  FileStat,
  FileSystemBackend,
  FileSystemUsage,
} from '@flighthq/types';

import {
  appendTextFile,
  canAccessFile,
  copyFile,
  createFileSymlink,
  createWebFileSystemBackend,
  directoryExists,
  fileExists,
  findFiles,
  getFileBaseName,
  getFileDirectoryName,
  getFileExtensionName,
  getFilePermissions,
  getFileRealPath,
  getFileSystemBackend,
  getFileSystemPath,
  getFileSystemUsage,
  isAbsoluteFilePath,
  joinFilePath,
  makeDirectory,
  normalizeFilePath,
  openFileReadStream,
  openFileWriteStream,
  readBinaryFile,
  readBinaryFileRange,
  readDialogHandleBinaryFile,
  readDialogHandleTextFile,
  readDirectory,
  readDirectoryRecursive,
  readFileSymlink,
  readTextFile,
  removeDirectory,
  removeFile,
  renameFile,
  setFilePermissions,
  setFileSystemBackend,
  statFile,
  watchPath,
  writeBinaryFile,
  writeBinaryFileChunks,
  writeDialogHandleBinaryFile,
  writeDialogHandleTextFile,
  writeFileAtomic,
  writeTextFile,
} from './filesystem';

function fakeBackend(): FileSystemBackend {
  const files = new Map<string, string>();
  const binary = new Map<string, Uint8Array>();
  const dirs = new Set<string>();
  // Symlink registry: linkPath → target
  const symlinks = new Map<string, string>();
  // Permission registry: path → FilePermissions
  const perms = new Map<string, FilePermissions>();
  return {
    async appendTextFile(path, data) {
      files.set(path, (files.has(path) ? (files.get(path) as string) : '') + data);
      return true;
    },
    async canAccessFile(path, mode) {
      if (mode === 'executable') return false;
      return files.has(path) || binary.has(path) || dirs.has(path);
    },
    async copy(from, to) {
      if (files.has(from)) {
        files.set(to, files.get(from) as string);
        return true;
      }
      if (binary.has(from)) {
        binary.set(to, (binary.get(from) as Uint8Array).slice());
        return true;
      }
      return false;
    },
    async createFileSymlink(target, linkPath) {
      symlinks.set(linkPath, target);
      return true;
    },
    async directoryExists(path) {
      return dirs.has(path);
    },
    async fileExists(path) {
      return files.has(path) || binary.has(path);
    },
    async getFilePermissions(path) {
      return perms.has(path) ? (perms.get(path) as FilePermissions) : null;
    },
    async getFileRealPath(path) {
      return path;
    },
    async getFileSystemUsage() {
      return { usedBytes: 0, quotaBytes: 1024 };
    },
    async makeDirectory(path) {
      dirs.add(path);
      return true;
    },
    async openFileReadStream(path) {
      if (!binary.has(path)) return null;
      const data = (binary.get(path) as Uint8Array).slice();
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });
    },
    async openFileWriteStream(path) {
      const chunks: Uint8Array[] = [];
      return new WritableStream<Uint8Array>({
        write(chunk) {
          chunks.push(chunk.slice());
        },
        close() {
          // Concatenate all chunks and store in binary map.
          let total = 0;
          for (const c of chunks) total += c.length;
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) {
            merged.set(c, offset);
            offset += c.length;
          }
          binary.set(path, merged);
        },
      });
    },
    async readBinaryFile(path) {
      return binary.has(path) ? (binary.get(path) as Uint8Array) : null;
    },
    async readBinaryFileRange(path, offset, length) {
      if (!binary.has(path)) return null;
      const data = binary.get(path) as Uint8Array;
      if (offset >= data.length) return new Uint8Array(0);
      return data.slice(offset, offset + length);
    },
    async readDirectory(): Promise<FileEntry[]> {
      return [{ name: 'a.txt', path: 'a.txt', isDirectory: false }];
    },
    async readDirectoryRecursive(): Promise<readonly FileEntry[]> {
      return [
        { name: 'a.txt', path: 'a.txt', isDirectory: false },
        { name: 'sub', path: 'sub', isDirectory: true },
        { name: 'b.txt', path: 'sub/b.txt', isDirectory: false },
      ];
    },
    async readFileSymlink(path) {
      return symlinks.has(path) ? (symlinks.get(path) as string) : null;
    },
    async readTextFile(path) {
      return files.has(path) ? (files.get(path) as string) : null;
    },
    async removeDirectory(path, recursive = false) {
      if (!dirs.has(path)) return false;
      dirs.delete(path);
      if (recursive) {
        const prefix = path + '/';
        for (const d of [...dirs]) {
          if (d.startsWith(prefix)) dirs.delete(d);
        }
      }
      return true;
    },
    async removeFile(path) {
      return files.delete(path) || binary.delete(path);
    },
    async rename(from, to) {
      if (files.has(from)) {
        files.set(to, files.get(from) as string);
        files.delete(from);
        return true;
      }
      if (binary.has(from)) {
        binary.set(to, binary.get(from) as Uint8Array);
        binary.delete(from);
        return true;
      }
      return false;
    },
    async setFilePermissions(path, permissions) {
      perms.set(path, permissions);
      return true;
    },
    async statFile(path): Promise<FileStat | null> {
      if (!files.has(path)) return null;
      return {
        size: (files.get(path) as string).length,
        isDirectory: false,
        modifiedTime: 0,
        createdTime: 0,
        isSymlink: false,
      };
    },
    watch() {
      return () => {};
    },
    async writeBinaryFile(path, data) {
      binary.set(path, data.slice());
      return true;
    },
    async writeFileAtomic(path, data) {
      if (typeof data === 'string') {
        files.set(path, data);
      } else {
        binary.set(path, (data as Uint8Array).slice());
      }
      return true;
    },
    async writeTextFile(path, data) {
      files.set(path, data);
      return true;
    },
    getPath() {
      return '/home/user';
    },
  };
}

afterEach(() => {
  setFileSystemBackend(null);
  setDialogBackend(null);
});

describe('appendTextFile', () => {
  it('appends to existing content through the backend', async () => {
    setFileSystemBackend(fakeBackend());
    await writeTextFile('a.txt', 'hello');
    expect(await appendTextFile('a.txt', ' world')).toBe(true);
    expect(await readTextFile('a.txt')).toBe('hello world');
  });

  it('creates the file when missing', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await appendTextFile('new.txt', 'x')).toBe(true);
    expect(await readTextFile('new.txt')).toBe('x');
  });

  it('returns false from the web backend without throwing in jsdom', async () => {
    expect(await appendTextFile('a.txt', 'x')).toBe(false);
  });
});

describe('canAccessFile', () => {
  it('returns true for readable files', async () => {
    setFileSystemBackend(fakeBackend());
    await writeTextFile('a.txt', 'x');
    expect(await canAccessFile('a.txt', 'readable')).toBe(true);
  });

  it('returns false for executable mode (web always false)', async () => {
    setFileSystemBackend(fakeBackend());
    await writeTextFile('a.txt', 'x');
    expect(await canAccessFile('a.txt', 'executable')).toBe(false);
  });

  it('returns false when file is missing', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await canAccessFile('missing.txt', 'readable')).toBe(false);
  });

  it('returns false from the web backend without throwing in jsdom', async () => {
    expect(await canAccessFile('a.txt', 'readable')).toBe(false);
  });
});

describe('copyFile', () => {
  it('copies a file through the backend, leaving the source', async () => {
    setFileSystemBackend(fakeBackend());
    await writeTextFile('a.txt', 'hi');
    expect(await copyFile('a.txt', 'b.txt')).toBe(true);
    expect(await readTextFile('a.txt')).toBe('hi');
    expect(await readTextFile('b.txt')).toBe('hi');
  });

  it('returns false when the source is missing', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await copyFile('missing.txt', 'b.txt')).toBe(false);
  });

  it('returns false from the web backend without throwing in jsdom', async () => {
    expect(await copyFile('a.txt', 'b.txt')).toBe(false);
  });
});

describe('createFileSymlink', () => {
  it('returns true through a backend that supports symlinks', async () => {
    const backend = fakeBackend();
    // Override createFileSymlink to track calls.
    let called = false;
    const orig = backend.createFileSymlink.bind(backend);
    backend.createFileSymlink = async (target, linkPath) => {
      called = true;
      return orig(target, linkPath);
    };
    setFileSystemBackend(backend);
    expect(await createFileSymlink('/real/path', 'link')).toBe(true);
    expect(called).toBe(true);
  });

  it('returns false from the web backend without throwing in jsdom', async () => {
    expect(await createFileSymlink('/target', 'link')).toBe(false);
  });
});

describe('createWebFileSystemBackend', () => {
  it('returns sentinels without throwing when OPFS is absent in jsdom', async () => {
    const backend = createWebFileSystemBackend();
    expect(await backend.readTextFile('a.txt')).toBeNull();
    expect(await backend.writeTextFile('a.txt', 'x')).toBe(false);
    expect(await backend.readBinaryFileRange('a.txt', 0, 4)).toBeNull();
    expect(await backend.fileExists('a.txt')).toBe(false);
    expect(await backend.directoryExists('dir')).toBe(false);
    expect(await backend.readDirectory('/')).toEqual([]);
    expect(await backend.readDirectoryRecursive('/')).toEqual([]);
    expect(await backend.statFile('a.txt')).toBeNull();
    expect(await backend.copy('a.txt', 'b.txt')).toBe(false);
    expect(await backend.rename('a.txt', 'b.txt')).toBe(false);
    expect(await backend.removeDirectory('dir', false)).toBe(false);
    expect(await backend.appendTextFile('a.txt', 'x')).toBe(false);
    expect(await backend.openFileReadStream('a.txt')).toBeNull();
    expect(await backend.openFileWriteStream('a.txt')).toBeNull();
    expect(await backend.createFileSymlink('/target', 'link')).toBe(false);
    expect(await backend.readFileSymlink('link')).toBeNull();
    expect(await backend.getFileRealPath('a.txt')).toBeNull();
    expect(await backend.getFilePermissions('a.txt')).toBeNull();
    expect(await backend.setFilePermissions('a.txt', { readable: true, writable: true, executable: false })).toBe(
      false,
    );
    expect(await backend.canAccessFile('a.txt', 'executable')).toBe(false);
    expect(await backend.getFileSystemUsage()).toBeNull();
    expect(typeof backend.watch('a.txt', () => {})).toBe('function');
    expect(backend.getPath('home')).toBe('');
  });
});

describe('directoryExists', () => {
  it('returns true for existing directories', async () => {
    setFileSystemBackend(fakeBackend());
    await makeDirectory('mydir');
    expect(await directoryExists('mydir')).toBe(true);
  });

  it('returns false for missing directories', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await directoryExists('missing')).toBe(false);
  });

  it('returns false from the web backend without throwing in jsdom', async () => {
    expect(await directoryExists('dir')).toBe(false);
  });
});

describe('fileExists', () => {
  it('reflects backend state', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await fileExists('a.txt')).toBe(false);
    await writeTextFile('a.txt', 'hi');
    expect(await fileExists('a.txt')).toBe(true);
  });
});

describe('findFiles', () => {
  it('returns entries whose name matches the glob pattern', async () => {
    setFileSystemBackend(fakeBackend());
    // fakeBackend readDirectoryRecursive returns: a.txt, sub (dir), sub/b.txt
    const results = await findFiles('/', '*.txt');
    expect(results.some((e) => e.name === 'a.txt')).toBe(true);
  });

  it('returns entries matching by path with ** glob', async () => {
    setFileSystemBackend(fakeBackend());
    const results = await findFiles('/', '**/*.txt');
    expect(results.some((e) => e.path === 'sub/b.txt')).toBe(true);
  });

  it('returns [] from the web backend without throwing in jsdom', async () => {
    expect(await findFiles('/', '*.txt')).toEqual([]);
  });
});

describe('getFileBaseName', () => {
  it('returns the final path segment', () => {
    expect(getFileBaseName('foo/bar.txt')).toBe('bar.txt');
    expect(getFileBaseName('bar.txt')).toBe('bar.txt');
    expect(getFileBaseName('/a/b/c.js')).toBe('c.js');
  });

  it('returns empty string for empty path', () => {
    expect(getFileBaseName('')).toBe('');
  });
});

describe('getFileDirectoryName', () => {
  it('returns all segments before the last', () => {
    expect(getFileDirectoryName('foo/bar.txt')).toBe('foo');
    expect(getFileDirectoryName('a/b/c.txt')).toBe('a/b');
  });

  it('returns empty string when there is no directory', () => {
    expect(getFileDirectoryName('bar.txt')).toBe('');
    expect(getFileDirectoryName('')).toBe('');
  });
});

describe('getFileExtensionName', () => {
  it('returns extension including dot', () => {
    expect(getFileExtensionName('foo/bar.txt')).toBe('.txt');
    expect(getFileExtensionName('archive.tar.gz')).toBe('.gz');
  });

  it('returns empty string when no extension', () => {
    expect(getFileExtensionName('Makefile')).toBe('');
    expect(getFileExtensionName('.hidden')).toBe('');
    expect(getFileExtensionName('')).toBe('');
  });
});

describe('getFilePermissions', () => {
  it('returns null when no permissions are set for the path', async () => {
    setFileSystemBackend(fakeBackend());
    await writeTextFile('a.txt', 'x');
    // fakeBackend returns null unless permissions have been explicitly set.
    expect(await getFilePermissions('a.txt')).toBeNull();
  });

  it('returns permissions after they have been set', async () => {
    setFileSystemBackend(fakeBackend());
    const p: FilePermissions = { readable: true, writable: false, executable: false };
    await setFilePermissions('a.txt', p);
    const got = await getFilePermissions('a.txt');
    expect(got).not.toBeNull();
    expect(got?.readable).toBe(true);
    expect(got?.writable).toBe(false);
  });

  it('returns null from the web backend without throwing in jsdom', async () => {
    expect(await getFilePermissions('a.txt')).toBeNull();
  });
});

describe('getFileRealPath', () => {
  it('resolves a path through the backend', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await getFileRealPath('a.txt')).toBe('a.txt');
  });

  it('returns null from the web backend without throwing in jsdom', async () => {
    expect(await getFileRealPath('a.txt')).toBeNull();
  });
});

describe('getFileSystemBackend', () => {
  it('falls back to a web backend', () => {
    expect(getFileSystemBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setFileSystemBackend(backend);
    expect(getFileSystemBackend()).toBe(backend);
  });
});

describe('getFileSystemPath', () => {
  it('delegates to the active backend', () => {
    setFileSystemBackend(fakeBackend());
    expect(getFileSystemPath('home')).toBe('/home/user');
  });

  it('returns "" from the web backend', () => {
    expect(getFileSystemPath('documents')).toBe('');
  });
});

describe('getFileSystemUsage', () => {
  it('returns usage through the backend', async () => {
    setFileSystemBackend(fakeBackend());
    const usage = await getFileSystemUsage();
    expect(usage).not.toBeNull();
    expect(typeof usage?.quotaBytes).toBe('number');
  });

  it('returns null from the web backend without throwing in jsdom', async () => {
    expect(await getFileSystemUsage()).toBeNull();
  });
});

describe('isAbsoluteFilePath', () => {
  it('returns true for Unix absolute paths', () => {
    expect(isAbsoluteFilePath('/foo/bar')).toBe(true);
    expect(isAbsoluteFilePath('/')).toBe(true);
  });

  it('returns true for Windows drive-letter paths', () => {
    expect(isAbsoluteFilePath('C:/foo')).toBe(true);
    expect(isAbsoluteFilePath('D:\\foo')).toBe(true);
  });

  it('returns false for relative paths and empty string', () => {
    expect(isAbsoluteFilePath('foo/bar')).toBe(false);
    expect(isAbsoluteFilePath('')).toBe(false);
    expect(isAbsoluteFilePath('relative')).toBe(false);
  });
});

describe('joinFilePath', () => {
  it('joins segments with /', () => {
    expect(joinFilePath('foo', 'bar', 'baz.txt')).toBe('foo/bar/baz.txt');
  });

  it('collapses redundant separators and . segments', () => {
    expect(joinFilePath('foo/', '/bar', './baz')).toBe('foo/bar/baz');
    expect(joinFilePath('a', '.', 'b')).toBe('a/b');
  });

  it('preserves leading slash when first segment is absolute', () => {
    expect(joinFilePath('/foo', 'bar')).toBe('/foo/bar');
  });

  it('returns empty string for empty segments', () => {
    expect(joinFilePath()).toBe('');
  });
});

describe('makeDirectory', () => {
  it('delegates to the active backend', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await makeDirectory('a/b')).toBe(true);
  });
});

describe('normalizeFilePath', () => {
  it('collapses double slashes and dot segments', () => {
    expect(normalizeFilePath('foo//./bar')).toBe('foo/bar');
    expect(normalizeFilePath('./a/./b')).toBe('a/b');
  });

  it('preserves leading slash', () => {
    expect(normalizeFilePath('/foo//bar')).toBe('/foo/bar');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeFilePath('')).toBe('');
  });
});

describe('openFileReadStream', () => {
  it('returns a ReadableStream for existing binary files', async () => {
    const backend = fakeBackend();
    setFileSystemBackend(backend);
    await backend.writeBinaryFile('data.bin', new Uint8Array([1, 2, 3]));
    const stream = await openFileReadStream('data.bin');
    expect(stream).not.toBeNull();
    const reader = stream!.getReader();
    const { value } = await reader.read();
    expect(Array.from(value ?? [])).toEqual([1, 2, 3]);
  });

  it('returns null for missing files', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await openFileReadStream('missing.bin')).toBeNull();
  });

  it('returns null from the web backend without throwing in jsdom', async () => {
    expect(await openFileReadStream('a.bin')).toBeNull();
  });
});

describe('openFileWriteStream', () => {
  it('returns a WritableStream that writes data to the backend', async () => {
    const backend = fakeBackend();
    setFileSystemBackend(backend);
    const stream = await openFileWriteStream('out.bin');
    expect(stream).not.toBeNull();
    const writer = stream!.getWriter();
    await writer.write(new Uint8Array([4, 5, 6]));
    await writer.close();
    // fakeBackend's openFileWriteStream stores data on close; read it back
    const stored = await backend.readBinaryFile('out.bin');
    expect(Array.from(stored ?? [])).toEqual([4, 5, 6]);
  });

  it('returns null from the web backend without throwing in jsdom', async () => {
    expect(await openFileWriteStream('a.bin')).toBeNull();
  });
});

describe('readBinaryFile', () => {
  it('round-trips through the backend', async () => {
    setFileSystemBackend(fakeBackend());
    await writeBinaryFile('b.bin', new Uint8Array([1, 2, 3]));
    expect(Array.from((await readBinaryFile('b.bin')) ?? [])).toEqual([1, 2, 3]);
  });

  it('returns null when missing', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await readBinaryFile('missing.bin')).toBeNull();
  });
});

describe('readBinaryFileRange', () => {
  it('returns the requested slice', async () => {
    setFileSystemBackend(fakeBackend());
    await writeBinaryFile('data.bin', new Uint8Array([10, 20, 30, 40, 50]));
    expect(Array.from((await readBinaryFileRange('data.bin', 1, 3)) ?? [])).toEqual([20, 30, 40]);
  });

  it('returns empty Uint8Array for out-of-range offset', async () => {
    setFileSystemBackend(fakeBackend());
    await writeBinaryFile('data.bin', new Uint8Array([1, 2, 3]));
    const result = await readBinaryFileRange('data.bin', 100, 4);
    expect(result).not.toBeNull();
    expect(result?.length).toBe(0);
  });

  it('returns null for missing files', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await readBinaryFileRange('missing.bin', 0, 4)).toBeNull();
  });

  it('returns null from the web backend without throwing in jsdom', async () => {
    expect(await readBinaryFileRange('a.bin', 0, 4)).toBeNull();
  });
});

describe('readDialogHandleBinaryFile', () => {
  it('reads from handle.path via the backend when path is non-null', async () => {
    setFileSystemBackend(fakeBackend());
    await writeBinaryFile('/tmp/data.bin', new Uint8Array([4, 5, 6]));
    const handle: FileDialogHandle = { kind: 'File', name: 'data.bin', path: '/tmp/data.bin' };
    expect(Array.from((await readDialogHandleBinaryFile(handle)) ?? [])).toEqual([4, 5, 6]);
  });

  it('returns null when path is null and no web handle is registered', async () => {
    const handle: FileDialogHandle = { kind: 'File', name: 'test.bin', path: null };
    expect(await readDialogHandleBinaryFile(handle)).toBeNull();
  });

  it('delegates to the fake backend for path-based reads', async () => {
    const backend = fakeBackend();
    setFileSystemBackend(backend);
    await backend.writeBinaryFile('file.bin', new Uint8Array([1, 2]));
    const handle: FileDialogHandle = { kind: 'File', name: 'file.bin', path: 'file.bin' };
    expect(Array.from((await readDialogHandleBinaryFile(handle)) ?? [])).toEqual([1, 2]);
  });
});

describe('readDialogHandleTextFile', () => {
  it('reads from handle.path via the backend when path is non-null', async () => {
    setFileSystemBackend(fakeBackend());
    await writeTextFile('doc.txt', 'hello world');
    const handle: FileDialogHandle = { kind: 'File', name: 'doc.txt', path: 'doc.txt' };
    expect(await readDialogHandleTextFile(handle)).toBe('hello world');
  });

  it('returns null when path is null and no web handle is registered', async () => {
    const handle: FileDialogHandle = { kind: 'File', name: 'unknown.txt', path: null };
    expect(await readDialogHandleTextFile(handle)).toBeNull();
  });

  it('reads a file using a path-based dialog handle (cellular round-trip)', async () => {
    // This test simulates the full round-trip: a dialog handle with a real path (as produced by
    // native Electron/Tauri backends) is passed to readDialogHandleTextFile which delegates to the
    // active filesystem backend. On web, path is null and getWebFileSystemHandle provides the handle.
    setFileSystemBackend(fakeBackend());
    await writeTextFile('picked.txt', 'content');
    // Simulate a dialog handle as returned by a native backend (path is non-null on native).
    const handle: FileDialogHandle = { kind: 'File', name: 'picked.txt', path: 'picked.txt' };
    expect(await readDialogHandleTextFile(handle)).toBe('content');
  });
});

describe('readDirectory', () => {
  it('delegates to the active backend', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await readDirectory('/')).toEqual([{ name: 'a.txt', path: 'a.txt', isDirectory: false }]);
  });
});

describe('readDirectoryRecursive', () => {
  it('returns all descendants through the backend', async () => {
    setFileSystemBackend(fakeBackend());
    const entries = await readDirectoryRecursive('/');
    expect(entries.length).toBe(3);
    expect(entries.some((e) => e.path === 'sub/b.txt')).toBe(true);
  });

  it('returns [] from the web backend without throwing in jsdom', async () => {
    expect(await readDirectoryRecursive('/')).toEqual([]);
  });
});

describe('readFileSymlink', () => {
  it('returns null for a regular file', async () => {
    setFileSystemBackend(fakeBackend());
    await writeTextFile('a.txt', 'x');
    expect(await readFileSymlink('a.txt')).toBeNull();
  });

  it('returns the symlink target after createFileSymlink', async () => {
    const backend = fakeBackend();
    setFileSystemBackend(backend);
    await backend.createFileSymlink('/real/file.txt', 'link.txt');
    expect(await readFileSymlink('link.txt')).toBe('/real/file.txt');
  });

  it('returns null from the web backend without throwing in jsdom', async () => {
    expect(await readFileSymlink('link.txt')).toBeNull();
  });
});

describe('readTextFile', () => {
  it('round-trips through the backend', async () => {
    setFileSystemBackend(fakeBackend());
    await writeTextFile('a.txt', 'hello');
    expect(await readTextFile('a.txt')).toBe('hello');
  });
});

describe('removeDirectory', () => {
  it('removes a directory through the backend', async () => {
    setFileSystemBackend(fakeBackend());
    await makeDirectory('mydir');
    expect(await directoryExists('mydir')).toBe(true);
    expect(await removeDirectory('mydir')).toBe(true);
    expect(await directoryExists('mydir')).toBe(false);
  });

  it('returns false for missing directories', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await removeDirectory('missing')).toBe(false);
  });

  it('removes recursively when recursive is true', async () => {
    setFileSystemBackend(fakeBackend());
    await makeDirectory('parent');
    await makeDirectory('parent/child');
    expect(await removeDirectory('parent', true)).toBe(true);
  });

  it('returns false from the web backend without throwing in jsdom', async () => {
    expect(await removeDirectory('dir')).toBe(false);
  });
});

describe('removeFile', () => {
  it('removes via the active backend', async () => {
    setFileSystemBackend(fakeBackend());
    await writeTextFile('a.txt', 'x');
    expect(await removeFile('a.txt')).toBe(true);
    expect(await fileExists('a.txt')).toBe(false);
  });
});

describe('renameFile', () => {
  it('moves a file through the backend', async () => {
    setFileSystemBackend(fakeBackend());
    await writeTextFile('a.txt', 'hi');
    expect(await renameFile('a.txt', 'b.txt')).toBe(true);
    expect(await readTextFile('a.txt')).toBeNull();
    expect(await readTextFile('b.txt')).toBe('hi');
  });

  it('returns false when the source is missing', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await renameFile('missing.txt', 'b.txt')).toBe(false);
  });

  it('returns false from the web backend without throwing in jsdom', async () => {
    expect(await renameFile('a.txt', 'b.txt')).toBe(false);
  });
});

describe('setFilePermissions', () => {
  it('delegates to the backend', async () => {
    setFileSystemBackend(fakeBackend());
    const perms: FilePermissions = { readable: true, writable: false, executable: false };
    expect(await setFilePermissions('a.txt', perms)).toBe(true);
  });

  it('returns false from the web backend without throwing in jsdom', async () => {
    const perms: FilePermissions = { readable: true, writable: false, executable: false };
    expect(await setFilePermissions('a.txt', perms)).toBe(false);
  });
});

describe('setFileSystemBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setFileSystemBackend(fakeBackend());
    setFileSystemBackend(null);
    expect(getFileSystemBackend()).not.toBeNull();
  });
});

describe('statFile', () => {
  it('reports size via the active backend', async () => {
    setFileSystemBackend(fakeBackend());
    await writeTextFile('a.txt', 'abcd');
    expect((await statFile('a.txt'))?.size).toBe(4);
  });
});

describe('watchPath', () => {
  it('returns an unsubscribe function from the active backend', () => {
    setFileSystemBackend(fakeBackend());
    const unsubscribe = watchPath('a.txt', () => {});
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('returns a callable no-op from the web backend', () => {
    const unsubscribe = watchPath('a.txt', () => {});
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe('writeBinaryFile', () => {
  it('writes via the active backend', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await writeBinaryFile('b.bin', new Uint8Array([9]))).toBe(true);
  });
});

describe('writeBinaryFileChunks', () => {
  it('writes all chunks to the file via the stream', async () => {
    const backend = fakeBackend();
    setFileSystemBackend(backend);
    async function* makeChunks(): AsyncIterable<Uint8Array> {
      yield new Uint8Array([1, 2]);
      yield new Uint8Array([3, 4, 5]);
    }
    expect(await writeBinaryFileChunks('chunked.bin', makeChunks())).toBe(true);
    const stored = await backend.readBinaryFile('chunked.bin');
    expect(Array.from(stored ?? [])).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns false when the stream cannot be opened (jsdom web backend)', async () => {
    async function* makeChunks(): AsyncIterable<Uint8Array> {
      yield new Uint8Array([1]);
    }
    expect(await writeBinaryFileChunks('a.bin', makeChunks())).toBe(false);
  });
});

describe('writeDialogHandleBinaryFile', () => {
  it('writes to handle.path via the backend when path is non-null', async () => {
    setFileSystemBackend(fakeBackend());
    const handle: FileDialogHandle = { kind: 'File', name: 'out.bin', path: 'out.bin' };
    expect(await writeDialogHandleBinaryFile(handle, new Uint8Array([7, 8, 9]))).toBe(true);
    expect(Array.from((await readBinaryFile('out.bin')) ?? [])).toEqual([7, 8, 9]);
  });

  it('returns false when path is null and no web handle is registered', async () => {
    const handle: FileDialogHandle = { kind: 'File', name: 'out.bin', path: null };
    expect(await writeDialogHandleBinaryFile(handle, new Uint8Array([1]))).toBe(false);
  });
});

describe('writeDialogHandleTextFile', () => {
  it('writes to handle.path via the backend when path is non-null', async () => {
    setFileSystemBackend(fakeBackend());
    const handle: FileDialogHandle = { kind: 'File', name: 'out.txt', path: 'out.txt' };
    expect(await writeDialogHandleTextFile(handle, 'saved content')).toBe(true);
    expect(await readTextFile('out.txt')).toBe('saved content');
  });

  it('returns false when path is null and no web handle is registered', async () => {
    const handle: FileDialogHandle = { kind: 'File', name: 'out.txt', path: null };
    expect(await writeDialogHandleTextFile(handle, 'data')).toBe(false);
  });
});

describe('writeFileAtomic', () => {
  it('writes binary data to the file atomically', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await writeFileAtomic('atomic.bin', new Uint8Array([10, 20]))).toBe(true);
    const stored = await readBinaryFile('atomic.bin');
    expect(Array.from(stored ?? [])).toEqual([10, 20]);
  });

  it('writes text data to the file atomically', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await writeFileAtomic('atomic.txt', 'hello')).toBe(true);
    expect(await readTextFile('atomic.txt')).toBe('hello');
  });

  it('returns false from the web backend without throwing in jsdom', async () => {
    expect(await writeFileAtomic('atomic.txt', 'data')).toBe(false);
  });
});

describe('writeTextFile', () => {
  it('writes via the active backend', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await writeTextFile('a.txt', 'z')).toBe(true);
    expect(await readTextFile('a.txt')).toBe('z');
  });
});
