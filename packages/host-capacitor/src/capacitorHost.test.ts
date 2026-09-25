import { readClipboardText } from '@flighthq/clipboard/contract';
import { createHost } from '@flighthq/host/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { CapacitorApi } from '@flighthq/types/contract';

import { capacitorHost } from './capacitorHost.ts';

// A fake Capacitor API broad enough that every provider constructs without touching missing members.
// Providers close over `capacitor` and only call in when their methods run (plus the app, device,
// status-bar, and connectivity prefetches), so a thin fake proves composition routes the seams.
function fakeCapacitor(): CapacitorApi {
  const asyncNoop = async () => {};
  const asyncListener = async () => ({ async remove() {} });
  return {
    app: {
      getInfo: async () => ({ name: 'FlightApp', id: 'com.flight.app', build: '1', version: '1.0.0' }),
      exitApp: asyncNoop,
      minimizeApp: asyncNoop,
      addListener: asyncListener,
    },
    clipboard: {
      read: async () => ({ value: 'CAP-TEXT', type: 'text/plain' }),
      write: asyncNoop,
    },
    device: {
      getInfo: async () => ({
        model: 'M',
        platform: 'ios',
        operatingSystem: 'ios',
        osVersion: '17',
        manufacturer: 'Apple',
        isVirtual: false,
        webViewVersion: '17',
      }),
      getId: async () => ({ identifier: 'id' }),
    },
    dialog: {
      alert: asyncNoop,
      confirm: async () => ({ value: true }),
      prompt: async () => ({ value: '', cancelled: true }),
    },
    filesystem: {},
    geolocation: { checkPermissions: async () => ({ location: 'granted' }) },
    haptics: {},
    keyboard: { addListener: asyncListener },
    localNotifications: {
      schedule: async () => ({ notifications: [] }),
      requestPermissions: async () => ({ display: 'granted' }),
      checkPermissions: async () => ({ display: 'granted' }),
      cancel: asyncNoop,
      getPending: async () => ({ notifications: [] }),
      addListener: asyncListener,
    },
    network: { getStatus: async () => ({ connected: true, connectionType: 'wifi' }), addListener: asyncListener },
    share: { share: async () => ({}) },
    statusBar: { getInfo: async () => ({ visible: true, style: 'Default' }) },
  } as unknown as CapacitorApi;
}

describe('capacitor power slot coverage', () => {
  // ★ EXACT SLOT COVERAGE for C: an EMPTY group, not a guessed or stubbed one. An empty group is
  // honest and forward-compatible; the named gap lives in agents/upstream-host-requirements.md so an
  // examined absence stays distinguishable from an unexamined one.
  it('claims no power capability at all', () => {
    const host = capacitorHost(fakeCapacitor(), 'ios');
    expect(host.power).toEqual({});
  });
});

describe('capacitorHost', () => {
  it('publishes every Host group and no parallel top-level surface', () => {
    expect(Object.keys(capacitorHost(fakeCapacitor(), 'ios')).sort()).toEqual(Object.keys(createHost()).sort());
  });

  it('exposes the real Capacitor haptics provider', () => {
    const host = capacitorHost(fakeCapacitor(), 'ios');
    expect(EntityRuntimeKey in host).toBe(true);
    expect(host.haptics.engine).toBeDefined();
    expect(typeof host.haptics.engine?.vibrate).toBe('function');
  });

  // An empty group means "not yet migrated off its package-local seam", NEVER "Capacitor cannot do
  // this". Claiming a capability here that still installs ambiently would make the host lie about what
  // selecting it actually gets you.
  it('claims only what has migrated, leaving unmigrated groups empty', () => {
    const host = capacitorHost(fakeCapacitor(), 'ios');
    // Migrated: clipboard, dialog, input, and notification are claimed with real Capacitor providers.
    expect(host.clipboard.text).toBeDefined();
    expect(host.connectivity.status).toBeDefined();
    expect(host.connectivity.change).toBe(host.connectivity.status);
    expect(host.connectivity.reachability).toBeUndefined();
    expect(host.dialog.message).toBeDefined();
    expect('directoryOpen' in host.dialog).toBe(false);
    expect('fileOpen' in host.dialog).toBe(false);
    expect('fileSave' in host.dialog).toBe(false);
    expect(host.haptics.engine).toBeDefined();
    expect(host.notification.delivery).toBeDefined();
    expect(host.share.content).toBeDefined();
    expect(host.fileSystem.access).toBeDefined();
    expect(host.statusBar.color).toBeDefined();
    expect(host.statusBar.info).toBeDefined();
    expect(host.device.info).toBeDefined();
    expect(host.audio).toEqual({});
    expect(host.video).toEqual({});
    expect(host.shortcut).toEqual({});
    expect(host.updater).toEqual({});
  });

  // A webview app has no native window operations of its own, so the whole window group is absent —
  // an empty struct of capability slots rather than a live capability with inert methods.
  it('claims no native window operations', () => {
    expect(capacitorHost(fakeCapacitor(), 'ios').window).toEqual({});
  });

  it('names Shell as an exact empty capability group', () => {
    const host = capacitorHost(fakeCapacitor(), 'ios');
    expect(host.shell).toEqual({});
  });

  it('installs a provider for each covered capability', () => {
    const host = capacitorHost(fakeCapacitor(), 'ios');
    expect(EntityRuntimeKey in host).toBe(true);
    expect(host.dialog.message.confirm).toBeTypeOf('function');
    expect(host.dialog.prompt.prompt).toBeTypeOf('function');
    expect(Object.keys(host.clipboard).sort()).toEqual(['image', 'text']);
    expect(host.clipboard.text.readText).toBeTypeOf('function');
    expect(host.app.name.getName).toBeTypeOf('function');
    expect(host.protocol.open.subscribe).toBeTypeOf('function');
    expect(host.connectivity.status.getStatus).toBeTypeOf('function');
    expect(host.connectivity.change.subscribe).toBeTypeOf('function');
    expect(host.device.info).toBeDefined();
    expect(host.fileSystem.access.readTextFile).toBeTypeOf('function');
    expect(host.geolocation.position).toBeDefined();
    expect(host.notification.delivery.notify).toBeTypeOf('function');
    expect(host.notification.scheduling.scheduleNotification).toBeTypeOf('function');
    expect(host.share.content.canShareContent({ text: 'ready' })).toBe(true);
    expect(host.softKeyboard.info).toBeDefined();
    expect(host.softKeyboard.visibility).toBeDefined();
    expect(host.statusBar.color.setBackgroundColor).toBeTypeOf('function');
    expect(host.statusBar.info.getInfo).toBeTypeOf('function');
  });

  it('routes a capability call through to the Capacitor provider', async () => {
    const host = capacitorHost(fakeCapacitor(), 'ios');
    expect(await readClipboardText(host.clipboard.text)).toBe('CAP-TEXT');
  });
});
