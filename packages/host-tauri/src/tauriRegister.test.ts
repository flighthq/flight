import { setAppBackend } from '@flighthq/app/contract';
import { readClipboardText } from '@flighthq/clipboard/contract';
import { getPlatformName, setPlatformBackend } from '@flighthq/platform/contract';
import { setShellBackend } from '@flighthq/shell/contract';
import { setShortcutBackend } from '@flighthq/shortcut/contract';
import { setTrayBackend } from '@flighthq/tray/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { TauriApi } from '@flighthq/types/contract';

import { registerTauriBackends } from './tauriRegister';

// A fake Tauri API broad enough that every createTauri*Backend constructs without touching missing
// members. Backends close over `tauri` and only call in when their methods run (plus the app/
// notification calls), so a thin fake proves registration routes the seams to the Tauri backends.
function fakeTauri(): TauriApi {
  const asyncNoop = async () => {};
  return {
    app: {
      getName: async () => 'FlightApp',
      getVersion: async () => '1.0.0',
      hide: asyncNoop,
      show: asyncNoop,
    },
    clipboard: {
      readText: async () => 'TAURI-TEXT',
      writeText: asyncNoop,
      clear: asyncNoop,
    },
    dialog: {},
    globalShortcut: {},
    menu: {},
    notification: {
      isPermissionGranted: async () => true,
      requestPermission: async () => 'granted',
      sendNotification: () => {},
    },
    opener: {},
    os: { arch: () => 'x86_64', locale: async () => 'en-US', platform: () => 'linux', version: () => '' },
    process: {},
    tray: {},
    window: { getCurrentWindow: () => ({}), LogicalPosition: class {}, LogicalSize: class {} },
  } as unknown as TauriApi;
}

afterEach(() => {
  setPlatformBackend(null);
  setAppBackend(null);
  setTrayBackend(null);
  setShortcutBackend(null);
  setShellBackend(null);
});

describe('registerTauriBackends', () => {
  it('routes capability seams to the Tauri backends without throwing', async () => {
    const host = registerTauriBackends(fakeTauri());
    expect(host.media).toEqual({});
    expect(EntityRuntimeKey in host).toBe(true);
    expect(host.dialog.file.openFile).toBeTypeOf('function');
    expect(host.dialog.message.confirm).toBeTypeOf('function');
    expect(host.notification.delivery.notify).toBeTypeOf('function');
    expect(Object.keys(host.clipboard)).toEqual(['text']);
    expect(host.connectivity).toEqual({});
    expect(host.window.open).toBeTypeOf('function');
    expect(getPlatformName()).toBe('linux');
    expect(await readClipboardText(host)).toBe('TAURI-TEXT');
  });
});
