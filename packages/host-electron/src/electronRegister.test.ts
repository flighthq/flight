import { getAppName, setAppBackend } from '@flighthq/app/contract';
import { readClipboardText, setClipboardBackend } from '@flighthq/clipboard/contract';
import { setStorageBackend } from '@flighthq/storage/contract';
import type { ElectronApi } from '@flighthq/types/contract';

import { registerElectronBackends } from './electronRegister';

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
      getPath: () => '/userData',
      on: noop,
      removeListener: noop,
    },
    clipboard: {
      readText: () => 'ELECTRON-TEXT',
    },
    fs: {
      existsSync: () => false,
      readFileSync: () => '{}',
      writeFileSync: noop,
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
  setStorageBackend(null);
});

describe('registerElectronBackends', () => {
  it('routes capability seams to the Electron backends without throwing', async () => {
    const host = registerElectronBackends(fakeElectron());
    expect(host.dialog.file.openFile).toBeTypeOf('function');
    expect(host.dialog.message.confirm).toBeTypeOf('function');
    expect(host.window.open).toBeTypeOf('function');
    expect(getAppName()).toBe('ElectronApp');
    expect(await readClipboardText()).toBe('ELECTRON-TEXT');
  });
});
