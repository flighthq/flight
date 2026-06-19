import type { ShortcutBackend } from '@flighthq/types';

import {
  createWebShortcutBackend,
  getShortcutBackend,
  isGlobalShortcutRegistered,
  registerGlobalShortcut,
  setShortcutBackend,
  unregisterAllGlobalShortcuts,
  unregisterGlobalShortcut,
} from './shortcut';

function fakeBackend(): ShortcutBackend & { registered: Set<string> } {
  return {
    registered: new Set<string>(),
    register(accelerator) {
      this.registered.add(accelerator);
      return true;
    },
    unregister(accelerator) {
      return this.registered.delete(accelerator);
    },
    unregisterAll() {
      this.registered.clear();
    },
    isRegistered(accelerator) {
      return this.registered.has(accelerator);
    },
  };
}

afterEach(() => setShortcutBackend(null));

describe('createWebShortcutBackend', () => {
  it('returns sentinels without throwing (web has no global hotkeys)', () => {
    const backend = createWebShortcutBackend();
    expect(backend.register('CmdOrCtrl+K', () => {})).toBe(false);
    expect(backend.unregister('CmdOrCtrl+K')).toBe(false);
    expect(backend.isRegistered('CmdOrCtrl+K')).toBe(false);
    expect(() => backend.unregisterAll()).not.toThrow();
  });
});

describe('getShortcutBackend', () => {
  it('falls back to a web backend', () => {
    expect(getShortcutBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    expect(getShortcutBackend()).toBe(backend);
  });
});

describe('isGlobalShortcutRegistered', () => {
  it('reflects backend state', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    expect(isGlobalShortcutRegistered('CmdOrCtrl+S')).toBe(false);
    registerGlobalShortcut('CmdOrCtrl+S', () => {});
    expect(isGlobalShortcutRegistered('CmdOrCtrl+S')).toBe(true);
  });

  it('returns false on the web backend', () => {
    expect(isGlobalShortcutRegistered('CmdOrCtrl+S')).toBe(false);
  });
});

describe('registerGlobalShortcut', () => {
  it('registers via the active backend', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    expect(registerGlobalShortcut('CmdOrCtrl+Q', () => {})).toBe(true);
    expect(backend.registered.has('CmdOrCtrl+Q')).toBe(true);
  });

  it('returns false on the web backend', () => {
    expect(registerGlobalShortcut('CmdOrCtrl+Q', () => {})).toBe(false);
  });
});

describe('setShortcutBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setShortcutBackend(fakeBackend());
    setShortcutBackend(null);
    expect(getShortcutBackend()).not.toBeNull();
  });
});

describe('unregisterAllGlobalShortcuts', () => {
  it('clears every shortcut via the active backend', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    registerGlobalShortcut('A', () => {});
    registerGlobalShortcut('B', () => {});
    unregisterAllGlobalShortcuts();
    expect(backend.registered.size).toBe(0);
  });

  it('is a no-op on the web backend', () => {
    expect(() => unregisterAllGlobalShortcuts()).not.toThrow();
  });
});

describe('unregisterGlobalShortcut', () => {
  it('unregisters via the active backend', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    registerGlobalShortcut('CmdOrCtrl+W', () => {});
    expect(unregisterGlobalShortcut('CmdOrCtrl+W')).toBe(true);
    expect(backend.registered.has('CmdOrCtrl+W')).toBe(false);
  });

  it('returns false on the web backend', () => {
    expect(unregisterGlobalShortcut('CmdOrCtrl+W')).toBe(false);
  });
});
