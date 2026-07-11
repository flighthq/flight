import { createCapacitorFileSystemBackend } from './capacitorFileSystem';
import type { CapacitorApi } from './capacitorModule';

function fakeCapacitor() {
  const files = new Map<string, { data: string; type: string }>();
  const capacitor = {
    filesystem: {
      async readFile(options: { path: string; encoding?: string }) {
        const entry = files.get(options.path);
        if (entry === undefined) throw new Error('missing');
        return { data: entry.data };
      },
      async writeFile(options: { path: string; data: string }) {
        files.set(options.path, { data: options.data, type: 'file' });
        return { uri: `file://${options.path}` };
      },
      async appendFile(options: { path: string; data: string }) {
        const entry = files.get(options.path);
        files.set(options.path, { data: (entry?.data ?? '') + options.data, type: 'file' });
      },
      async deleteFile(options: { path: string }) {
        if (!files.delete(options.path)) throw new Error('missing');
      },
      async mkdir(options: { path: string }) {
        files.set(options.path, { data: '', type: 'directory' });
      },
      async rmdir(options: { path: string }) {
        files.delete(options.path);
      },
      async readdir(options: { path: string }) {
        return {
          files: [...files.keys()]
            .filter((key) => key.startsWith(options.path))
            .map((key) => ({ name: key, uri: `file://${key}`, type: files.get(key)!.type, size: 0, mtime: 0 })),
        };
      },
      async stat(options: { path: string }) {
        const entry = files.get(options.path);
        if (entry === undefined) throw new Error('missing');
        return { type: entry.type, size: entry.data.length, mtime: 100, ctime: 50, uri: `file://${options.path}` };
      },
      async rename() {},
      async copy() {},
    },
  } as unknown as CapacitorApi;
  return { capacitor, files };
}

describe('createCapacitorFileSystemBackend', () => {
  it('round-trips a text file', async () => {
    const backend = createCapacitorFileSystemBackend(fakeCapacitor().capacitor);
    expect(await backend.writeTextFile('/a.txt', 'hello')).toBe(true);
    expect(await backend.readTextFile('/a.txt')).toBe('hello');
    expect(await backend.appendTextFile('/a.txt', '!')).toBe(true);
    expect(await backend.readTextFile('/a.txt')).toBe('hello!');
  });

  it('round-trips a binary file through Base64', async () => {
    const backend = createCapacitorFileSystemBackend(fakeCapacitor().capacitor);
    const bytes = new Uint8Array([0, 1, 2, 254, 255]);
    expect(await backend.writeBinaryFile('/b.bin', bytes)).toBe(true);
    const read = await backend.readBinaryFile('/b.bin');
    expect(read).not.toBeNull();
    expect([...read!]).toEqual([0, 1, 2, 254, 255]);
  });

  it('maps exists/stat/remove and reports null for a missing file', async () => {
    const backend = createCapacitorFileSystemBackend(fakeCapacitor().capacitor);
    await backend.writeTextFile('/c.txt', 'x');
    expect(await backend.fileExists('/c.txt')).toBe(true);
    expect(await backend.directoryExists('/c.txt')).toBe(false);
    const stat = await backend.statFile('/c.txt');
    expect(stat).toMatchObject({ size: 1, isDirectory: false, createdTime: 50 });
    expect(await backend.removeFile('/c.txt')).toBe(true);
    expect(await backend.readTextFile('/c.txt')).toBeNull();
    expect(await backend.statFile('/missing')).toBeNull();
  });

  it('reports sentinels for the unmodeled surface', async () => {
    const backend = createCapacitorFileSystemBackend(fakeCapacitor().capacitor);
    expect(await backend.readBinaryFileRange('/x', 0, 4)).toBeNull();
    expect(await backend.getFilePermissions('/x')).toBeNull();
    expect(await backend.canAccessFile('/x', 'readable')).toBe(false);
    expect(await backend.getFileSystemUsage()).toBeNull();
    expect(backend.getPath('home')).toBe('');
    expect(typeof backend.watch('/x', () => {})).toBe('function');
  });
});
