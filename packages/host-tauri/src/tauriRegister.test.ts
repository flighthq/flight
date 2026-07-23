import { setAppBackend } from '@flighthq/app';
import { setWindowBackend } from '@flighthq/application';
import { readClipboardText, setClipboardBackend } from '@flighthq/clipboard';
import { setDialogBackend } from '@flighthq/dialog';
import { setMenuBackend } from '@flighthq/menu';
import { setNotificationBackend } from '@flighthq/notification';
import { getPlatformName, setPlatformBackend } from '@flighthq/platform';
import { setShellBackend } from '@flighthq/shell';
import { setShortcutBackend } from '@flighthq/shortcut';
import { setTrayBackend } from '@flighthq/tray';
import type { TauriApi } from '@flighthq/types';

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
    os: { arch: () => 'x86_64', locale: () => 'en-US', platform: () => 'linux', version: () => '' },
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
