import type { DeviceBackend, DeviceInfo, SafeAreaInsets } from '@flighthq/types';

import {
  createDeviceInfo,
  createSafeAreaInsets,
  createWebDeviceBackend,
  getDeviceBackend,
  getDeviceInfo,
  getSafeAreaInsets,
  setDeviceBackend,
} from './device';

function fakeBackend(): DeviceBackend {
  return {
    getInfo(out: DeviceInfo): DeviceInfo {
      out.model = 'Pixel';
      out.manufacturer = 'Google';
      out.osName = 'Android';
      out.osVersion = '14';
      out.platform = 'arm64';
      out.isVirtual = true;
      out.memory = 8;
      return out;
    },
    getSafeAreaInsets(out: SafeAreaInsets): SafeAreaInsets {
      out.top = 24;
      out.right = 0;
      out.bottom = 16;
      out.left = 0;
      return out;
    },
  };
}

afterEach(() => setDeviceBackend(null));

describe('createDeviceInfo', () => {
  it('allocates a zeroed snapshot with -1 numeric sentinels', () => {
    const info = createDeviceInfo();
    expect(info.model).toBe('');
    expect(info.isVirtual).toBe(false);
    expect(info.memory).toBe(-1);
  });
});

describe('createSafeAreaInsets', () => {
  it('allocates zeroed edges', () => {
    expect(createSafeAreaInsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});

describe('createWebDeviceBackend', () => {
  it('fills the snapshot with sentinels without throwing (jsdom)', () => {
    const backend = createWebDeviceBackend();
    const info = backend.getInfo(createDeviceInfo());
    expect(info.model).toBe('');
    expect(info.manufacturer).toBe('');
    expect(typeof info.memory).toBe('number');
  });

  it('returns zero safe-area insets on web', () => {
    const backend = createWebDeviceBackend();
    expect(backend.getSafeAreaInsets(createSafeAreaInsets())).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});

describe('getDeviceBackend', () => {
  it('falls back to a web backend', () => {
    expect(getDeviceBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setDeviceBackend(backend);
    expect(getDeviceBackend()).toBe(backend);
  });
});

describe('getDeviceInfo', () => {
  it('fills and returns out via the active backend', () => {
    setDeviceBackend(fakeBackend());
    const out = createDeviceInfo();
    const result = getDeviceInfo(out);
    expect(result).toBe(out);
    expect(out.model).toBe('Pixel');
    expect(out.memory).toBe(8);
  });
});

describe('getSafeAreaInsets', () => {
  it('fills and returns out via the active backend', () => {
    setDeviceBackend(fakeBackend());
    const out = createSafeAreaInsets();
    const result = getSafeAreaInsets(out);
    expect(result).toBe(out);
    expect(out.top).toBe(24);
    expect(out.bottom).toBe(16);
  });
});

describe('setDeviceBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setDeviceBackend(fakeBackend());
    setDeviceBackend(null);
    expect(getDeviceBackend()).not.toBeNull();
  });
});
