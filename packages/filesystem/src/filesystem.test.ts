import type { FileEntry, FileStat, FileSystemBackend } from '@flighthq/types';

import {
  appendTextFile,
  copyFile,
  createWebFileSystemBackend,
  fileExists,
  getFileSystemBackend,
  getFileSystemPath,
  makeDirectory,
  readBinaryFile,
  readDirectory,
  readTextFile,
  removeFile,
  renameFile,
  setFileSystemBackend,
  statFile,
  watchPath,
  writeBinaryFile,
  writeTextFile,
} from './filesystem';

function fakeBackend(): FileSystemBackend {
  const files = new Map<string, string>();
  const binary = new Map<string, Uint8Array>();
  const dirs = new Set<string>();
  return {
    async readTextFile(path) {
      return files.has(path) ? (files.get(path) as string) : null;
    },
    async writeTextFile(path, data) {
      files.set(path, data);
      return true;
    },
    async readBinaryFile(path) {
      return binary.has(path) ? (binary.get(path) as Uint8Array) : null;
    },
    async writeBinaryFile(path, data) {
      binary.set(path, data.slice());
      return true;
    },
    async fileExists(path) {
      return files.has(path) || binary.has(path);
    },
    async removeFile(path) {
      return files.delete(path) || binary.delete(path);
    },
    async makeDirectory(path) {
      dirs.add(path);
      return true;
    },
    async readDirectory(): Promise<FileEntry[]> {
      return [{ name: 'a.txt', path: 'a.txt', isDirectory: false }];
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
    async appendTextFile(path, data) {
      files.set(path, (files.has(path) ? (files.get(path) as string) : '') + data);
      return true;
    },
    watch() {
      return () => {};
    },
    getPath() {
      return '/home/user';
    },
  };
}

afterEach(() => setFileSystemBackend(null));

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

describe('createWebFileSystemBackend', () => {
  it('returns sentinels without throwing when OPFS is absent in jsdom', async () => {
    const backend = createWebFileSystemBackend();
    expect(await backend.readTextFile('a.txt')).toBeNull();
    expect(await backend.writeTextFile('a.txt', 'x')).toBe(false);
    expect(await backend.fileExists('a.txt')).toBe(false);
    expect(await backend.readDirectory('/')).toEqual([]);
    expect(await backend.statFile('a.txt')).toBeNull();
    expect(await backend.copy('a.txt', 'b.txt')).toBe(false);
    expect(await backend.rename('a.txt', 'b.txt')).toBe(false);
    expect(await backend.appendTextFile('a.txt', 'x')).toBe(false);
    expect(typeof backend.watch('a.txt', () => {})).toBe('function');
    expect(backend.getPath('home')).toBe('');
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

describe('makeDirectory', () => {
  it('delegates to the active backend', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await makeDirectory('a/b')).toBe(true);
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

describe('readDirectory', () => {
  it('delegates to the active backend', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await readDirectory('/')).toEqual([{ name: 'a.txt', path: 'a.txt', isDirectory: false }]);
  });
});

describe('readTextFile', () => {
  it('round-trips through the backend', async () => {
    setFileSystemBackend(fakeBackend());
    await writeTextFile('a.txt', 'hello');
    expect(await readTextFile('a.txt')).toBe('hello');
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

describe('writeTextFile', () => {
  it('writes via the active backend', async () => {
    setFileSystemBackend(fakeBackend());
    expect(await writeTextFile('a.txt', 'z')).toBe(true);
    expect(await readTextFile('a.txt')).toBe('z');
  });
});
