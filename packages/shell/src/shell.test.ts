import type { ShellBackend } from '@flighthq/types';

import {
  createWebShellBackend,
  getShellBackend,
  moveItemToTrash,
  openExternalURL,
  openShellPath,
  setShellBackend,
  shellBeep,
  showItemInFolder,
} from './shell';

function fakeBackend(): ShellBackend & { opened: string; beeped: number; trashed: string } {
  return {
    opened: '',
    beeped: 0,
    trashed: '',
    async openExternal(url) {
      this.opened = url;
      return true;
    },
    async openPath(path) {
      this.opened = path;
      return true;
    },
    async showItemInFolder(path) {
      this.opened = path;
      return true;
    },
    async moveToTrash(path) {
      this.trashed = path;
      return true;
    },
    beep() {
      this.beeped += 1;
    },
  };
}

afterEach(() => setShellBackend(null));

describe('createWebShellBackend', () => {
  it('returns a backend whose unsupported operations resolve to false without throwing', async () => {
    const backend = createWebShellBackend();
    expect(await backend.openPath('/tmp/x')).toBe(false);
    expect(await backend.showItemInFolder('/tmp/x')).toBe(false);
    expect(await backend.moveToTrash('/tmp/x')).toBe(false);
    expect(() => backend.beep()).not.toThrow();
    expect(typeof (await backend.openExternal('https://example.com'))).toBe('boolean');
  });
});

describe('getShellBackend', () => {
  it('falls back to a web backend', () => {
    expect(getShellBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    expect(getShellBackend()).toBe(backend);
  });
});

describe('moveItemToTrash', () => {
  it('trashes via the active backend', async () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    expect(await moveItemToTrash('/tmp/x')).toBe(true);
    expect(backend.trashed).toBe('/tmp/x');
  });
});

describe('openExternalURL', () => {
  it('opens via the active backend', async () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    expect(await openExternalURL('https://example.com')).toBe(true);
    expect(backend.opened).toBe('https://example.com');
  });
});

describe('openShellPath', () => {
  it('opens via the active backend', async () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    expect(await openShellPath('/tmp/x')).toBe(true);
    expect(backend.opened).toBe('/tmp/x');
  });
});

describe('setShellBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setShellBackend(fakeBackend());
    setShellBackend(null);
    expect(getShellBackend()).not.toBeNull();
  });
});

describe('shellBeep', () => {
  it('forwards to the active backend', () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    shellBeep();
    expect(backend.beeped).toBe(1);
  });
});

describe('showItemInFolder', () => {
  it('reveals via the active backend', async () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    expect(await showItemInFolder('/tmp/x')).toBe(true);
    expect(backend.opened).toBe('/tmp/x');
  });
});
