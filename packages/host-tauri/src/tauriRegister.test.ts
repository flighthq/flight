import { setAppBackend } from '@flighthq/app/contract';
import { setWindowBackend } from '@flighthq/application/contract';
import { readClipboardText, setClipboardBackend } from '@flighthq/clipboard/contract';
import { setDialogBackend } from '@flighthq/dialog/contract';
import { setMenuBackend } from '@flighthq/menu/contract';
import { setNotificationBackend } from '@flighthq/notification/contract';
import { getPlatformName, setPlatformBackend } from '@flighthq/platform/contract';
import { setShellBackend } from '@flighthq/shell/contract';
import { setShortcutBackend } from '@flighthq/shortcut/contract';
import { setTrayBackend } from '@flighthq/tray/contract';
import type { TauriApi } from '@flighthq/types/contract';

import { registerTauriBackends } from './tauriRegister';

// A fake Tauri API broad enough that every createTauri*Backend constructs without touching missing
// members. Backends close over `tauri` and only call in when their methods run (plus the app/
// notification prefetches), so a thin fake proves registration routes the seams to the Tauri backends.
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
  setWindowBackend(null);
  setDialogBackend(null);
  setClipboardBackend(null);
  setMenuBackend(null);
  setTrayBackend(null);
  setShortcutBackend(null);
  setNotificationBackend(null);
  setShellBackend(null);
});

describe('registerTauriBackends', () => {
  it('routes capability seams to the Tauri backends without throwing', async () => {
    registerTauriBackends(fakeTauri());
    expect(getPlatformName()).toBe('linux');
    expect(await readClipboardText()).toBe('TAURI-TEXT');
  });
});
