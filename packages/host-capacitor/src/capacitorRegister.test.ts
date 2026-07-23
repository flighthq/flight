import { getAppBackend, setAppBackend } from '@flighthq/app';
import { readClipboardText, setClipboardBackend } from '@flighthq/clipboard';
import { getConnectivityBackend, setConnectivityBackend } from '@flighthq/connectivity';
import { getDeviceBackend, setDeviceBackend } from '@flighthq/device';
import { setDialogBackend } from '@flighthq/dialog';
import { getFileSystemBackend, setFileSystemBackend } from '@flighthq/filesystem';
import { getGeolocationBackend, setGeolocationBackend } from '@flighthq/geolocation';
import { getHapticsBackend, setHapticsBackend } from '@flighthq/haptics';
import { getSoftKeyboardBackend, setSoftKeyboardBackend } from '@flighthq/keyboard';
import { getNotificationBackend, setNotificationBackend } from '@flighthq/notification';
import { getShareBackend, setShareBackend } from '@flighthq/share';
import { getStatusBarBackend, setStatusBarBackend } from '@flighthq/statusbar';
import type { CapacitorApi } from '@flighthq/types';

import { registerCapacitorBackends } from './capacitorRegister';

// A fake Capacitor API broad enough that every createCapacitor*Backend constructs without touching
// missing members. Backends close over `capacitor` and only call in when their methods run (plus the
// app/notification/device/share/statusbar/connectivity prefetches), so a thin fake proves registration
// routes the seams to the Capacitor backends.
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
    share: { canShare: async () => ({ value: true }), share: async () => ({}) },
    statusBar: { getInfo: async () => ({ visible: true, style: 'Default' }) },
  } as unknown as CapacitorApi;
}

afterEach(() => {
  setAppBackend(null);
  setClipboardBackend(null);
  setConnectivityBackend(null);
  setDeviceBackend(null);
  setDialogBackend(null);
  setFileSystemBackend(null);
  setGeolocationBackend(null);
  setHapticsBackend(null);
  setNotificationBackend(null);
  setShareBackend(null);
  setSoftKeyboardBackend(null);
  setStatusBarBackend(null);
});

describe('registerCapacitorBackends', () => {
  it('installs a backend for each covered capability', () => {
    registerCapacitorBackends(fakeCapacitor());
    expect(getAppBackend()).not.toBeNull();
    expect(getConnectivityBackend()).not.toBeNull();
    expect(getDeviceBackend()).not.toBeNull();
    expect(getFileSystemBackend()).not.toBeNull();
    expect(getGeolocationBackend()).not.toBeNull();
    expect(getHapticsBackend()).not.toBeNull();
    expect(getNotificationBackend()).not.toBeNull();
    expect(getShareBackend()).not.toBeNull();
    expect(getSoftKeyboardBackend()).not.toBeNull();
    expect(getStatusBarBackend()).not.toBeNull();
  });

  it('routes a capability call through to the Capacitor backend', async () => {
    registerCapacitorBackends(fakeCapacitor());
    expect(await readClipboardText()).toBe('CAP-TEXT');
  });
});
