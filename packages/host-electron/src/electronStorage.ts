import type { StorageBackend } from '@flighthq/types';

import type { ElectronApi } from './electronModule';

// Maps Flight's StorageBackend onto a JSON file in the Electron userData directory. The file is
// read and written synchronously to match the StorageBackend contract (localStorage is sync). All
// reads/writes are guarded with try/catch; failures return the documented sentinels (null/false/[])
// rather than throwing — storage is an expected-failure surface (permissions, disk full, etc.).
//
// The userData path comes from electron.app.getPath('userData'), and file I/O is performed via
// electron.fs — a minimal { readFileSync, writeFileSync, existsSync } slice injected on ElectronApi
// to keep this package node:fs-dependency-free (matching the electron-free design principle). In
// most Electron apps this is satisfied by the real node:fs module passed to registerElectronBackends.
//
// Design note: `node:fs` is documented in the codebase map as "out of scope here — a future
// node-fs injection covers those" for the @flighthq/filesystem seam. This storage implementation
// threads the fs surface through ElectronApi.fs instead, keeping host-electron node:fs-free while
// still providing the main-process storage backend the seam requires.
export function createElectronStorageBackend(electron: ElectronApi, fileName = 'storage.json'): StorageBackend {
  const fs = electron.fs;
  let store: Record<string, string> | null = null;

  function load(): Record<string, string> {
    if (store !== null) return store;
    try {
      const dir = electron.app.getPath('userData');
      const path = `${dir}/${fileName}`;
      if (fs.existsSync(path)) {
        const raw = fs.readFileSync(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          store = parsed as Record<string, string>;
          return store;
        }
      }
    } catch {
      /* unreadable or corrupt file — start fresh */
    }
    store = {};
    return store;
  }

  function save(): boolean {
    try {
      const dir = electron.app.getPath('userData');
      const path = `${dir}/${fileName}`;
      fs.writeFileSync(path, JSON.stringify(load()));
      return true;
    } catch {
      return false;
    }
  }

  return {
    clear() {
      store = {};
      return save();
    },
    getItem(key) {
      const s = load();
      return Object.prototype.hasOwnProperty.call(s, key) ? s[key] : null;
    },
    keys() {
      return Object.keys(load());
    },
    removeItem(key) {
      const s = load();
      if (!Object.prototype.hasOwnProperty.call(s, key)) return false;
      delete s[key];
      return save();
    },
    setItem(key, value) {
      load()[key] = value;
      return save();
    },
  };
}
