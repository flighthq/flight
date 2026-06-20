import { readClipboardText, setClipboardBackend } from '@flighthq/clipboard';
import { getAppName, setAppBackend } from '@flighthq/app';

import type { ElectronApi } from './electronModule';
import { registerElectronBackends } from './register';

// A fake Electron module broad enough that every createElectron*Backend constructs without touching
// missing members. Backends close over `electron` and only call into it when their methods run, so a
// thin fake suffices to prove registration routes the capability seams to the Electron backends.
function fakeElectron(): ElectronApi {
  const noop = () => {};
  const off = () => () => {};
  return {
    app: {
      getName: () => 'ElectronApp',
      getLocale: () => 'en-US',
      on: noop,
      removeListener: noop,
    },
    clipboard: {
      readText: () => 'ELECTRON-TEXT',
    },
    globalShortcut: {},
    screen: { on: noop, removeListener: noop },
    powerMonitor: { on: noop, removeListener: noop },
    powerSaveBlocker: {},
    nativeImage: {},
    ipcMain: { on: noop, removeListener: noop },
    autoUpdater: { on: noop, removeListener: noop },
    shell: {},
    dialog: {},
    Menu: { buildFromTemplate: () => ({ popup: noop }), setApplicationMenu: noop },
    // The remaining members are unused at registration time.
    _off: off,
  } as unknown as ElectronApi;
}

afterEach(() => {
  setClipboardBackend(null);
  setAppBackend(null);
});

describe('registerElectronBackends', () => {
  it('routes capability seams to the Electron backends without throwing', async () => {
    registerElectronBackends(fakeElectron());
    expect(getAppName()).toBe('ElectronApp');
    expect(await readClipboardText()).toBe('ELECTRON-TEXT');
  });
});
