import type { ElectronApi } from './electronModule';
import { createElectronStorageBackend } from './electronStorage';

function fakeElectron(initial?: Record<string, string>): {
  electron: ElectronApi;
  written: string[];
} {
  const written: string[] = [];
  let fileContent: string | null = initial !== undefined ? JSON.stringify(initial) : null;
  const fs = {
    existsSync: () => fileContent !== null,
    readFileSync: () => fileContent ?? '',
    writeFileSync: (_path: string, data: string) => {
      fileContent = data;
      written.push(data);
    },
  };
  const electron = {
    app: { getPath: () => '/userData' },
    fs,
  } as unknown as ElectronApi;
  return { electron, written };
}

describe('createElectronStorageBackend', () => {
  it('clear removes all keys and persists', () => {
    const { electron } = fakeElectron({ a: '1' });
    const backend = createElectronStorageBackend(electron);
    expect(backend.getItem('a')).toBe('1');
    backend.clear();
    expect(backend.getItem('a')).toBeNull();
    expect(backend.keys()).toEqual([]);
  });

  it('getItem returns null for a missing key', () => {
    const { electron } = fakeElectron({});
    const backend = createElectronStorageBackend(electron);
    expect(backend.getItem('missing')).toBeNull();
  });

  it('keys returns all stored keys', () => {
    const { electron } = fakeElectron({ x: '1', y: '2' });
    const backend = createElectronStorageBackend(electron);
    expect(backend.keys().sort()).toEqual(['x', 'y']);
  });

  it('removeItem deletes a key and returns false for an unknown key', () => {
    const { electron } = fakeElectron({ a: 'v' });
    const backend = createElectronStorageBackend(electron);
    expect(backend.removeItem('a')).toBe(true);
    expect(backend.getItem('a')).toBeNull();
    expect(backend.removeItem('a')).toBe(false);
  });

  it('setItem stores a value and persists it to disk', () => {
    const { electron, written } = fakeElectron();
    const backend = createElectronStorageBackend(electron);
    expect(backend.setItem('k', 'v')).toBe(true);
    expect(backend.getItem('k')).toBe('v');
    expect(written.length).toBeGreaterThan(0);
    expect(JSON.parse(written[written.length - 1])).toEqual({ k: 'v' });
  });

  it('starts fresh when the file does not exist', () => {
    const { electron } = fakeElectron();
    const backend = createElectronStorageBackend(electron);
    expect(backend.keys()).toEqual([]);
    expect(backend.getItem('any')).toBeNull();
  });
});
