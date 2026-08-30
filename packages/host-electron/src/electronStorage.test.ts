import type { ElectronApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createElectronStorageBackend } from './electronStorage';

const STORAGE_PATH = '/userData/storage.json';

interface FakeElectronStorage {
  electron: ElectronApi;
  readonly files: Map<string, string>;
  readonly renamed: { from: string; to: string }[];
  readonly unlinked: string[];
  readonly written: { data: string; path: string }[];
  readFailure: Error | null;
  renameFailure: Error | null;
  writeFailure: Error | null;
  writePartialBeforeFailure: boolean;
}

function codeError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

function fakeElectron(raw: string | null = null): FakeElectronStorage {
  const files = new Map<string, string>();
  if (raw !== null) files.set(STORAGE_PATH, raw);
  const state: FakeElectronStorage = {
    electron: null as unknown as ElectronApi,
    files,
    readFailure: null,
    renamed: [],
    renameFailure: null,
    unlinked: [],
    writeFailure: null,
    writePartialBeforeFailure: false,
    written: [],
  };
  const fs = {
    existsSync: (path: string) => files.has(path),
    readFileSync: (path: string) => {
      if (state.readFailure !== null) throw state.readFailure;
      return files.get(path) ?? '';
    },
    renameSync: (from: string, to: string) => {
      if (state.renameFailure !== null) throw state.renameFailure;
      const data = files.get(from);
      if (data === undefined) throw codeError('ENOENT');
      files.set(to, data);
      files.delete(from);
      state.renamed.push({ from, to });
    },
    unlinkSync: (path: string) => {
      files.delete(path);
      state.unlinked.push(path);
    },
    writeFileSync: (path: string, data: string) => {
      state.written.push({ data, path });
      if (state.writeFailure !== null) {
        if (state.writePartialBeforeFailure) files.set(path, data.slice(0, 2));
        throw state.writeFailure;
      }
      files.set(path, data);
    },
  };
  state.electron = { app: { getPath: () => '/userData' }, fs } as unknown as ElectronApi;
  return state;
}

function json(value: Readonly<Record<string, string>>): string {
  return JSON.stringify(value);
}

describe('createElectronStorageBackend', () => {
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createElectronStorageBackend(fakeElectron().electron)).toBe(true);
  });

  it('treats a missing file as successful empty storage', () => {
    const backend = createElectronStorageBackend(fakeElectron().electron);
    expect(backend.getItem('missing')).toEqual({ reason: 'ok', value: null });
    expect(backend.keys()).toEqual({ reason: 'ok', value: [] });
  });

  it('reports corrupt and non-string persistence without silently resetting it', () => {
    for (const raw of ['{', '[]', '{"key":1}']) {
      const state = fakeElectron(raw);
      const backend = createElectronStorageBackend(state.electron);
      expect(backend.getItem('key')).toEqual({ reason: 'persistence-invalid', value: null });
      expect(backend.keys()).toEqual({ reason: 'persistence-invalid', value: null });
      expect(backend.setItem('key', 'value')).toEqual({ reason: 'persistence-invalid' });
      expect(backend.removeItem('key')).toEqual({ reason: 'persistence-invalid' });
      expect(state.files.get(STORAGE_PATH)).toBe(raw);
      expect(state.renamed).toEqual([]);
    }
  });

  it('clear deliberately recovers corrupt persistence through atomic replacement', () => {
    const state = fakeElectron('{');
    const backend = createElectronStorageBackend(state.electron);
    expect(backend.clear()).toEqual({ reason: 'ok' });
    expect(state.files.get(STORAGE_PATH)).toBe('{}');
    expect(backend.keys()).toEqual({ reason: 'ok', value: [] });
  });

  it('persists a candidate through same-directory rename before committing cache', () => {
    const state = fakeElectron(json({ a: 'old' }));
    const backend = createElectronStorageBackend(state.electron);
    expect(backend.setItem('a', 'new')).toEqual({ reason: 'ok' });
    expect(state.written).toHaveLength(1);
    expect(state.written[0]!.path.startsWith(`${STORAGE_PATH}.tmp-`)).toBe(true);
    expect(state.renamed).toEqual([{ from: state.written[0]!.path, to: STORAGE_PATH }]);
    expect(JSON.parse(state.files.get(STORAGE_PATH)!)).toEqual({ a: 'new' });
    expect(backend.getItem('a')).toEqual({ reason: 'ok', value: 'new' });
  });

  it('never exposes a false cache commit or replaced target when rename fails', () => {
    const state = fakeElectron(json({ a: 'old' }));
    const backend = createElectronStorageBackend(state.electron);
    expect(backend.getItem('a')).toEqual({ reason: 'ok', value: 'old' });
    state.renameFailure = codeError('EIO');
    expect(backend.setItem('a', 'candidate')).toEqual({ reason: 'write-failed' });
    expect(backend.getItem('a')).toEqual({ reason: 'ok', value: 'old' });
    expect(JSON.parse(state.files.get(STORAGE_PATH)!)).toEqual({ a: 'old' });
    expect([...state.files.keys()].filter((path) => path.includes('.tmp-'))).toEqual([]);
    expect(state.unlinked).toHaveLength(1);
  });

  it('keeps a partial temporary write unobservable and cleans it after failure', () => {
    const state = fakeElectron(json({ a: 'old' }));
    const backend = createElectronStorageBackend(state.electron);
    expect(backend.getItem('a')).toEqual({ reason: 'ok', value: 'old' });
    state.writeFailure = codeError('EIO');
    state.writePartialBeforeFailure = true;
    expect(backend.setItem('a', 'candidate')).toEqual({ reason: 'write-failed' });
    expect(state.files.get(STORAGE_PATH)).toBe(json({ a: 'old' }));
    expect(backend.getItem('a')).toEqual({ reason: 'ok', value: 'old' });
    expect([...state.files.keys()].filter((path) => path.includes('.tmp-'))).toEqual([]);
  });

  it('classifies only reliable filesystem codes and otherwise uses the method fallback', () => {
    const denied = fakeElectron(json({ a: '1' }));
    denied.readFailure = codeError('EACCES');
    expect(createElectronStorageBackend(denied.electron).getItem('a')).toEqual({
      reason: 'security-denied',
      value: null,
    });

    const quota = fakeElectron(json({ a: '1' }));
    const quotaBackend = createElectronStorageBackend(quota.electron);
    quota.writeFailure = codeError('ENOSPC');
    expect(quotaBackend.setItem('a', '2')).toEqual({ reason: 'quota-exceeded' });

    const remove = fakeElectron(json({ a: '1' }));
    const removeBackend = createElectronStorageBackend(remove.electron);
    remove.renameFailure = codeError('EIO');
    expect(removeBackend.removeItem('a')).toEqual({ reason: 'remove-failed' });

    const clear = fakeElectron(json({ a: '1' }));
    clear.renameFailure = codeError('EIO');
    expect(createElectronStorageBackend(clear.electron).clear()).toEqual({ reason: 'clear-failed' });
  });

  it('treats absent remove as idempotent success without writing', () => {
    const state = fakeElectron(json({}));
    const backend = createElectronStorageBackend(state.electron);
    expect(backend.removeItem('missing')).toEqual({ reason: 'ok' });
    expect(state.written).toEqual([]);
    expect(state.renamed).toEqual([]);
  });

  // Success here proves only the public atomic-visibility contract: temp write + same-filesystem rename
  // completed and cache followed it. ElectronFs intentionally has no fsync surface, so this test makes no
  // power-loss durability claim.
  it('defines ok as atomic visibility rather than power-loss durability', () => {
    const state = fakeElectron(json({ a: 'old' }));
    const backend = createElectronStorageBackend(state.electron);
    expect(backend.setItem('a', 'visible')).toEqual({ reason: 'ok' });
    expect(state.renamed).toHaveLength(1);
    expect(backend.getItem('a')).toEqual({ reason: 'ok', value: 'visible' });
  });
});
