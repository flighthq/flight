import type { ShellBackend, ShellOpenExternalOptions, ShellOpenPathOptions } from '@flighthq/types';

import {
  createWebShellBackend,
  getShellBackend,
  isShellUrlAllowed,
  moveItemsToTrash,
  moveItemToTrash,
  openShellExternalUrl,
  openShellPath,
  openShellPathResult,
  readShellShortcutLink,
  setShellBackend,
  setShellUrlSchemeAllowlist,
  shellBeep,
  showItemInFolder,
  writeShellShortcutLink,
} from './shell';

function fakeBackend(): ShellBackend & {
  beeped: number;
  lastOptions: ShellOpenExternalOptions | ShellOpenPathOptions | undefined;
  opened: string;
  pathResult: string;
  trashed: string;
  trashedBatch: readonly string[];
} {
  return {
    beeped: 0,
    lastOptions: undefined,
    opened: '',
    pathResult: '',
    trashed: '',
    trashedBatch: [],
    beep() {
      this.beeped += 1;
    },
    async moveItemsToTrash(paths) {
      this.trashedBatch = paths;
      return paths.map(() => true);
    },
    async moveToTrash(path) {
      this.trashed = path;
      return true;
    },
    async openExternal(url, options) {
      this.opened = url;
      this.lastOptions = options;
      return true;
    },
    async openPath(path, options) {
      this.opened = path;
      this.lastOptions = options;
      return true;
    },
    async openPathResult(path, options) {
      this.opened = path;
      this.lastOptions = options;
      return this.pathResult;
    },
    async readShortcutLink() {
      return { target: '/path/to/target' };
    },
    async showItemInFolder(path) {
      this.opened = path;
      return true;
    },
    async writeShortcutLink() {
      return true;
    },
  };
}

afterEach(() => {
  setShellBackend(null);
  setShellUrlSchemeAllowlist(null);
});

describe('createWebShellBackend', () => {
  it('returns a backend whose native-only operations resolve to sentinels without throwing', async () => {
    const backend = createWebShellBackend();
    expect(await backend.openPath('/tmp/x')).toBe(false);
    expect(await backend.showItemInFolder('/tmp/x')).toBe(false);
    expect(await backend.moveToTrash('/tmp/x')).toBe(false);
    expect(await backend.writeShortcutLink('/tmp/x.lnk', { target: '/tmp/x' })).toBe(false);
    expect(await backend.readShortcutLink('/tmp/x.lnk')).toBeNull();
    expect(() => backend.beep()).not.toThrow();
  });

  it('batch trash resolves to an empty array on the web', async () => {
    const backend = createWebShellBackend();
    expect(await backend.moveItemsToTrash(['/tmp/a', '/tmp/b'])).toEqual([]);
  });

  it('openPathResult returns the unavailable-on-web sentinel string', async () => {
    const backend = createWebShellBackend();
    expect(await backend.openPathResult('/tmp/x')).toBe('unavailable on web');
  });

  it('openExternal type-checks to boolean regardless of options', async () => {
    const backend = createWebShellBackend();
    expect(typeof (await backend.openExternal('https://example.com'))).toBe('boolean');
    expect(typeof (await backend.openExternal('https://example.com', { activate: true }))).toBe('boolean');
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

describe('isShellUrlAllowed', () => {
  it('returns true when no allowlist is set', () => {
    expect(isShellUrlAllowed('https://example.com')).toBe(true);
    expect(isShellUrlAllowed('file:///tmp/x')).toBe(true);
  });

  it('returns true for a scheme in the allowlist', () => {
    setShellUrlSchemeAllowlist(['https', 'mailto']);
    expect(isShellUrlAllowed('https://example.com')).toBe(true);
    expect(isShellUrlAllowed('mailto:user@example.com')).toBe(true);
  });

  it('returns false for a scheme not in the allowlist', () => {
    setShellUrlSchemeAllowlist(['https']);
    expect(isShellUrlAllowed('file:///tmp/x')).toBe(false);
    expect(isShellUrlAllowed('ftp://example.com')).toBe(false);
  });

  it('returns false for a URL that cannot be parsed', () => {
    setShellUrlSchemeAllowlist(['https']);
    expect(isShellUrlAllowed('not-a-url')).toBe(false);
  });
});

describe('moveItemsToTrash', () => {
  it('passes the path array to the backend and returns per-path results', async () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    const results = await moveItemsToTrash(['/tmp/a', '/tmp/b']);
    expect(results).toEqual([true, true]);
    expect(backend.trashedBatch).toEqual(['/tmp/a', '/tmp/b']);
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

describe('openShellExternalUrl', () => {
  it('opens via the active backend', async () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    expect(await openShellExternalUrl('https://example.com')).toBe(true);
    expect(backend.opened).toBe('https://example.com');
  });

  it('forwards the activate option to the backend', async () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    await openShellExternalUrl('https://example.com', { activate: true });
    expect(backend.lastOptions).toEqual({ activate: true });
  });

  it('returns false and does not call the backend when the URL scheme is blocked', async () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    setShellUrlSchemeAllowlist(['https']);
    expect(await openShellExternalUrl('file:///etc/passwd')).toBe(false);
    expect(backend.opened).toBe('');
  });

  it('allows the URL when its scheme is in the allowlist', async () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    setShellUrlSchemeAllowlist(['https', 'mailto']);
    expect(await openShellExternalUrl('https://example.com')).toBe(true);
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

  it('forwards the workingDirectory option to the backend', async () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    await openShellPath('/tmp/x', { workingDirectory: '/home/user' });
    expect(backend.lastOptions).toEqual({ workingDirectory: '/home/user' });
  });

  it('forwards the application option to the backend', async () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    await openShellPath('/tmp/x', { application: 'TextEdit' });
    expect(backend.lastOptions).toEqual({ application: 'TextEdit' });
  });

  it('omits options when none provided', async () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    await openShellPath('/tmp/x');
    expect(backend.lastOptions).toBeUndefined();
  });
});

describe('openShellPathResult', () => {
  it('returns an empty string on success', async () => {
    const backend = fakeBackend();
    backend.pathResult = '';
    setShellBackend(backend);
    expect(await openShellPathResult('/tmp/x')).toBe('');
    expect(backend.opened).toBe('/tmp/x');
  });

  it('returns the OS error string on failure', async () => {
    const backend = fakeBackend();
    backend.pathResult = 'No such file or directory';
    setShellBackend(backend);
    expect(await openShellPathResult('/nonexistent')).toBe('No such file or directory');
  });

  it('forwards options to the backend', async () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    await openShellPathResult('/tmp/x', { workingDirectory: '/home/user' });
    expect(backend.lastOptions).toEqual({ workingDirectory: '/home/user' });
  });
});

describe('readShellShortcutLink', () => {
  it('returns null on the web (no backend set)', async () => {
    const result = await readShellShortcutLink('/tmp/x.lnk');
    expect(result).toBeNull();
  });

  it('returns the shortcut link from the active backend', async () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    const result = await readShellShortcutLink('/tmp/x.lnk');
    expect(result).toEqual({ target: '/path/to/target' });
  });
});

describe('setShellBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setShellBackend(fakeBackend());
    setShellBackend(null);
    expect(getShellBackend()).not.toBeNull();
  });
});

describe('setShellUrlSchemeAllowlist', () => {
  it('allows all URLs when set to null', () => {
    setShellUrlSchemeAllowlist(['https']);
    setShellUrlSchemeAllowlist(null);
    expect(isShellUrlAllowed('file:///tmp/x')).toBe(true);
  });

  it('restricts URLs to the listed schemes', () => {
    setShellUrlSchemeAllowlist(['https', 'mailto']);
    expect(isShellUrlAllowed('ftp://example.com')).toBe(false);
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

describe('writeShellShortcutLink', () => {
  it('returns false on the web (no backend set)', async () => {
    const result = await writeShellShortcutLink('/tmp/x.lnk', { target: '/tmp/target' });
    expect(result).toBe(false);
  });

  it('writes via the active backend', async () => {
    const backend = fakeBackend();
    setShellBackend(backend);
    const result = await writeShellShortcutLink('/tmp/x.lnk', { target: '/tmp/target' }, 'create');
    expect(result).toBe(true);
  });
});
