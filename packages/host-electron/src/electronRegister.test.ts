import { getAppName } from '@flighthq/app/contract';
import { readClipboardText } from '@flighthq/clipboard/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { ElectronApi } from '@flighthq/types/contract';

import { initializeElectronHost, registerElectronBackends } from './electronRegister';

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
      renameSync: noop,
      unlinkSync: noop,
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
    Menu: {
      buildFromTemplate: () => ({ popup: noop }),
      setApplicationMenu: noop,
    },
    // The remaining members are unused at registration time.
    _off: off,
  } as unknown as ElectronApi;
}

describe('initializeElectronHost', () => {
  it('is the construction initializer of createElectronHost', () => {
    expect(typeof initializeElectronHost).toBe('function');
  });
});
describe('registerElectronBackends', () => {
  it('routes capability seams to the Electron backends without throwing', async () => {
    const host = registerElectronBackends(fakeElectron(), {
      platform: 'linux',
    });
    expect(host.media).toEqual({});
    expect(EntityRuntimeKey in host).toBe(true);
    expect(host.dialog.directoryOpen.open).toBeTypeOf('function');
    expect(host.dialog.fileOpen.open).toBeTypeOf('function');
    expect(host.dialog.fileSave.save).toBeTypeOf('function');
    expect(host.dialog.message.confirm).toBeTypeOf('function');
    expect(host.notification.delivery.notify).toBeTypeOf('function');
    expect(host.notification.close.closeAllNotifications).toBeTypeOf('function');
    expect(host.ipc.handle.handle).toBeTypeOf('function');
    expect(host.ipc.message.subscribe).toBeTypeOf('function');
    expect(host.ipc.targetedSend.send).toBeTypeOf('function');
    expect(EntityRuntimeKey in host.shortcut.query).toBe(true);
    expect(EntityRuntimeKey in host.shortcut.trigger).toBe(true);
    expect(EntityRuntimeKey in host.updater.command).toBe(true);
    expect(host.updater.command.check).toBeTypeOf('function');
    expect(Object.keys(host.clipboard).sort()).toEqual(['bookmark', 'formats', 'image', 'text']);
    expect(host.connectivity).toEqual({});
    expect(host.storage.local.getItem('missing')).toEqual({
      reason: 'ok',
      value: null,
    });
    expect(host.window.open).toBeTypeOf('function');
    expect(getAppName(host)).toBe('ElectronApp');
    expect(await readClipboardText(host)).toBe('ELECTRON-TEXT');
  });

  it('constructs the exact six Shell slots from an injected platform fact', () => {
    const windowsHost = registerElectronBackends(fakeElectron(), {
      platform: 'windows',
    });
    const linuxHost = registerElectronBackends(fakeElectron(), {
      platform: 'linux',
    });
    expect(Object.keys(windowsHost.shell).sort()).toEqual([
      'beep',
      'external',
      'pathOpen',
      'pathReveal',
      'shortcutLink',
      'trash',
    ]);
    expect(Object.keys(linuxHost.shell).sort()).toEqual(['beep', 'external', 'pathOpen', 'pathReveal', 'trash']);
    for (const provider of Object.values(windowsHost.shell)) expect(EntityRuntimeKey in provider).toBe(true);
  });
});
