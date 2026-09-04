import { readClipboardText } from '@flighthq/clipboard/contract';
import { getPlatformName } from '@flighthq/platform/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { HasSystemPlatform, TauriApi } from '@flighthq/types/contract';

import { initializeTauriHost, registerTauriBackends } from './tauriRegister';

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

describe('initializeTauriHost', () => {
  it('is the construction initializer of createTauriHost', () => {
    expect(typeof initializeTauriHost).toBe('function');
  });
});

describe('registerTauriBackends', () => {
  it('routes capability seams to the Tauri backends without throwing', async () => {
    const host = registerTauriBackends(fakeTauri(), 'linux');
    expect(host.media).toEqual({});
    expect(host.updater).toEqual({});
    expect(EntityRuntimeKey in host).toBe(true);
    expect(host.dialog.directoryOpen.open).toBeTypeOf('function');
    expect(host.dialog.fileOpen.open).toBeTypeOf('function');
    expect(host.dialog.fileSave.save).toBeTypeOf('function');
    expect(host.dialog.message.confirm).toBeTypeOf('function');
    expect(host.notification.delivery.notify).toBeTypeOf('function');
    expect(EntityRuntimeKey in host.shortcut.query).toBe(true);
    expect(EntityRuntimeKey in host.shortcut.trigger).toBe(true);
    expect(Object.keys(host.clipboard)).toEqual(['text']);
    expect(host.connectivity).toEqual({});
    expect(host.window.open).toBeTypeOf('function');
    expect(getPlatformName(host as HasSystemPlatform)).toBe('linux');
    expect(await readClipboardText(host)).toBe('TAURI-TEXT');
  });

  it('claims exactly the three genuine Shell slots', () => {
    const host = registerTauriBackends(fakeTauri(), 'linux');
    expect(Object.keys(host.shell).sort()).toEqual(['external', 'pathOpen', 'pathReveal']);
    for (const provider of Object.values(host.shell)) expect(EntityRuntimeKey in provider).toBe(true);
  });
});

describe('tauri power slot coverage', () => {
  // ★ EXACT SLOT COVERAGE for T: an EMPTY group, not a guessed or stubbed one. An empty group is
  // honest and forward-compatible; the named gap lives in agents/upstream-host-requirements.md so an
  // examined absence stays distinguishable from an unexamined one.
  it('claims no power capability at all', () => {
    const host = registerTauriBackends(fakeTauri(), 'linux');
    expect(host.power).toEqual({});
  });
});
describe('tauri power slot coverage', () => {
  // ★ EXACT SLOT COVERAGE for T: an EMPTY group, not a guessed or stubbed one. An empty group is
  // honest and forward-compatible; the named gap lives in agents/upstream-host-requirements.md so an
  // examined absence stays distinguishable from an unexamined one.
  it('claims no power capability at all', () => {
    const host = registerTauriBackends(fakeTauri(), 'linux');
    expect(host.power).toEqual({});
  });
});
