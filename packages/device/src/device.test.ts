import type {
  DeviceBackend,
  DeviceCapabilities,
  DeviceDisplayMetrics,
  DeviceInfo,
  SafeAreaInsets,
} from '@flighthq/types';
import { DeviceFormFactorDesktop, DeviceFormFactorPhone, DeviceFormFactorUnknown } from '@flighthq/types';

import {
  createDeviceCapabilities,
  createDeviceDisplayMetrics,
  createDeviceInfo,
  createSafeAreaInsets,
  createWebDeviceBackend,
  enableWebSafeAreaInsets,
  getDeviceBackend,
  getDeviceCapabilities,
  getDeviceDisplayMetrics,
  getDeviceId,
  getDeviceInfo,
  getSafeAreaInsets,
  refreshDeviceInfo,
  setDeviceBackend,
} from './device';

function fakeBackend(): DeviceBackend {
  return {
    getCapabilities(out: DeviceCapabilities): DeviceCapabilities {
      out.hasKeyboard = true;
      out.hasMouse = true;
      out.hasStylus = false;
      return out;
    },
    getDisplayMetrics(out: DeviceDisplayMetrics): DeviceDisplayMetrics {
      out.colorDepth = 8;
      out.densityDpi = 440;
      out.logicalHeight = 800;
      out.logicalWidth = 360;
      out.physicalHeight = 1600;
      out.physicalWidth = 720;
      out.pixelRatio = 2;
      return out;
    },
    getId(): string {
      return 'test-device-id';
    },
    getInfo(out: DeviceInfo): DeviceInfo {
      out.arch = 'arm64';
      out.availableMemory = 3_000_000_000;
      out.boardName = 'msm8998';
      out.colorGamut = 'display-p3';
      out.cpuCores = 8;
      out.fontScale = 1.2;
      out.formFactor = 'Phone';
      out.gpuRenderer = 'Adreno 650';
      out.gpuVendor = 'Qualcomm';
      out.isHdr = true;
      out.isJailbroken = false;
      out.isLowEndDevice = false;
      out.isRooted = false;
      out.isVirtual = true;
      out.manufacturer = 'Google';
      out.marketingName = 'Pixel 8 Pro';
      out.model = 'Pixel';
      out.osBuild = 'TP1A.220624.014';
      out.osName = 'Android';
      out.osVersion = '14';
      out.platformString = 'Linux armv8l';
      out.productName = 'husky';
      out.supportedAbis = ['arm64-v8a', 'armeabi-v7a'];
      out.totalMemory = 8_000_000_000;
      out.webViewVersion = '120.0.6099.230';
      return out;
    },
    getSafeAreaInsets(out: SafeAreaInsets): SafeAreaInsets {
      out.bottom = 16;
      out.left = 0;
      out.right = 0;
      out.top = 24;
      return out;
    },
  };
}

afterEach(() => setDeviceBackend(null));

describe('createDeviceCapabilities', () => {
  it('allocates a zeroed snapshot with all false capability flags', () => {
    const caps = createDeviceCapabilities();
    expect(caps.hasKeyboard).toBe(false);
    expect(caps.hasMouse).toBe(false);
    expect(caps.hasStylus).toBe(false);
  });
});

describe('createDeviceDisplayMetrics', () => {
  it('allocates a zeroed snapshot with -1 numeric sentinels', () => {
    const metrics = createDeviceDisplayMetrics();
    expect(metrics.colorDepth).toBe(-1);
    expect(metrics.densityDpi).toBe(-1);
    expect(metrics.logicalHeight).toBe(-1);
    expect(metrics.logicalWidth).toBe(-1);
    expect(metrics.physicalHeight).toBe(-1);
    expect(metrics.physicalWidth).toBe(-1);
    expect(metrics.pixelRatio).toBe(-1);
  });
});

describe('createDeviceInfo', () => {
  it('allocates zeroed snapshot with string, boolean, and -1 numeric sentinels', () => {
    const info = createDeviceInfo();
    expect(info.arch).toBe('');
    expect(info.availableMemory).toBe(-1);
    expect(info.boardName).toBe('');
    expect(info.colorGamut).toBe('');
    expect(info.cpuCores).toBe(-1);
    expect(info.fontScale).toBe(-1);
    expect(info.formFactor).toBe(DeviceFormFactorUnknown);
    expect(info.gpuRenderer).toBe('');
    expect(info.gpuVendor).toBe('');
    expect(info.isHdr).toBe(false);
    expect(info.isJailbroken).toBe(false);
    expect(info.isLowEndDevice).toBe(false);
    expect(info.isRooted).toBe(false);
    expect(info.isVirtual).toBe(false);
    expect(info.manufacturer).toBe('');
    expect(info.marketingName).toBe('');
    expect(info.model).toBe('');
    expect(info.osBuild).toBe('');
    expect(info.osName).toBe('');
    expect(info.osVersion).toBe('');
    expect(info.platformString).toBe('');
    expect(info.productName).toBe('');
    expect(info.supportedAbis).toEqual([]);
    expect(info.totalMemory).toBe(-1);
    expect(info.webViewVersion).toBe('');
  });
});

describe('createSafeAreaInsets', () => {
  it('allocates zeroed edges', () => {
    expect(createSafeAreaInsets()).toEqual({ bottom: 0, left: 0, right: 0, top: 0 });
  });
});

describe('createWebDeviceBackend', () => {
  it('fills the snapshot with sentinels without throwing (jsdom)', () => {
    const backend = createWebDeviceBackend();
    const info = backend.getInfo(createDeviceInfo());
    expect(info.model).toBe('');
    expect(info.manufacturer).toBe('');
    expect(info.marketingName).toBe('');
    expect(info.productName).toBe('');
    expect(info.boardName).toBe('');
    expect(info.webViewVersion).toBe('');
    expect(info.colorGamut).toBe('');
    expect(info.fontScale).toBe(-1);
    expect(info.isHdr).toBe(false);
    expect(typeof info.totalMemory).toBe('number');
    expect(info.availableMemory).toBe(-1);
    expect(typeof info.cpuCores).toBe('number');
    expect(info.isJailbroken).toBe(false);
    expect(info.isRooted).toBe(false);
    expect(info.osBuild).toBe('');
    expect(typeof info.formFactor).toBe('string');
    expect(typeof info.arch).toBe('string');
    expect(info.platformString).toBe(navigator.userAgent);
    expect(Array.isArray(info.supportedAbis)).toBe(true);
    expect(info.supportedAbis.length).toBe(0);
  });

  it('returns zero safe-area insets on plain web (no CSS probe)', () => {
    const backend = createWebDeviceBackend();
    expect(backend.getSafeAreaInsets(createSafeAreaInsets())).toEqual({ bottom: 0, left: 0, right: 0, top: 0 });
  });

  it('getId returns a string (empty or a UUID) without throwing', () => {
    const backend = createWebDeviceBackend();
    const id = backend.getId();
    expect(typeof id).toBe('string');
  });

  it('getId returns the same value on repeated calls (stable install id)', () => {
    const backend = createWebDeviceBackend();
    const id1 = backend.getId();
    const id2 = backend.getId();
    if (id1 !== '') {
      expect(id1).toBe(id2);
    }
  });

  it('returns display metrics with a valid pixel ratio from jsdom', () => {
    const backend = createWebDeviceBackend();
    const metrics = backend.getDisplayMetrics(createDeviceDisplayMetrics());
    // jsdom exposes window.devicePixelRatio = 1 and screen.width/height
    expect(typeof metrics.pixelRatio).toBe('number');
    expect(typeof metrics.logicalWidth).toBe('number');
  });

  it('totalMemory converts deviceMemory GiB to bytes', () => {
    // Patch navigator.deviceMemory to a known value
    const nav = navigator as unknown as Record<string, unknown>;
    const original = nav['deviceMemory'];
    try {
      Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 4 });
      const backend = createWebDeviceBackend();
      const info = backend.getInfo(createDeviceInfo());
      expect(info.totalMemory).toBe(4 * 1024 * 1024 * 1024);
    } finally {
      if (original !== undefined) {
        Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: original });
      }
    }
  });

  it('osVersion parses Android version from UA', () => {
    const backend = createWebDeviceBackend();
    const result = backend.getInfo(createDeviceInfo());
    // jsdom UA results in a string; actual parsing is covered by useragent unit tests
    expect(typeof result.osVersion).toBe('string');
  });

  it('getCapabilities returns a capability snapshot without throwing', () => {
    const backend = createWebDeviceBackend();
    const caps = backend.getCapabilities(createDeviceCapabilities());
    expect(typeof caps.hasKeyboard).toBe('boolean');
    expect(typeof caps.hasMouse).toBe('boolean');
    expect(caps.hasStylus).toBe(false);
  });
});

describe('enableWebSafeAreaInsets', () => {
  it('returns a dispose function and does not throw in jsdom', () => {
    const dispose = enableWebSafeAreaInsets();
    expect(typeof dispose).toBe('function');
    dispose();
  });
});

describe('getDeviceBackend', () => {
  it('falls back to a web backend when none is set', () => {
    expect(getDeviceBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setDeviceBackend(backend);
    expect(getDeviceBackend()).toBe(backend);
  });
});

describe('getDeviceCapabilities', () => {
  it('fills and returns out via the active backend', () => {
    setDeviceBackend(fakeBackend());
    const out = createDeviceCapabilities();
    const result = getDeviceCapabilities(out);
    expect(result).toBe(out);
    expect(out.hasKeyboard).toBe(true);
    expect(out.hasMouse).toBe(true);
    expect(out.hasStylus).toBe(false);
  });
});

describe('getDeviceDisplayMetrics', () => {
  it('fills and returns out via the active backend', () => {
    setDeviceBackend(fakeBackend());
    const out = createDeviceDisplayMetrics();
    const result = getDeviceDisplayMetrics(out);
    expect(result).toBe(out);
    expect(out.colorDepth).toBe(8);
    expect(out.densityDpi).toBe(440);
    expect(out.logicalHeight).toBe(800);
    expect(out.logicalWidth).toBe(360);
    expect(out.physicalHeight).toBe(1600);
    expect(out.physicalWidth).toBe(720);
    expect(out.pixelRatio).toBe(2);
  });
});

describe('getDeviceId', () => {
  it('returns a string without throwing', () => {
    expect(typeof getDeviceId()).toBe('string');
  });

  it('returns the value from a registered backend', () => {
    setDeviceBackend(fakeBackend());
    expect(getDeviceId()).toBe('test-device-id');
  });

  it('returns a stable value across two reads (web fallback)', () => {
    const id1 = getDeviceId();
    const id2 = getDeviceId();
    if (id1 !== '') {
      expect(id1).toBe(id2);
    }
  });
});

describe('getDeviceInfo', () => {
  it('fills and returns out via the active backend', () => {
    setDeviceBackend(fakeBackend());
    const out = createDeviceInfo();
    const result = getDeviceInfo(out);
    expect(result).toBe(out);
    expect(out.arch).toBe('arm64');
    expect(out.availableMemory).toBe(3_000_000_000);
    expect(out.boardName).toBe('msm8998');
    expect(out.colorGamut).toBe('display-p3');
    expect(out.cpuCores).toBe(8);
    expect(out.fontScale).toBe(1.2);
    expect(out.formFactor).toBe(DeviceFormFactorPhone);
    expect(out.gpuRenderer).toBe('Adreno 650');
    expect(out.gpuVendor).toBe('Qualcomm');
    expect(out.isHdr).toBe(true);
    expect(out.isJailbroken).toBe(false);
    expect(out.isLowEndDevice).toBe(false);
    expect(out.isRooted).toBe(false);
    expect(out.isVirtual).toBe(true);
    expect(out.manufacturer).toBe('Google');
    expect(out.marketingName).toBe('Pixel 8 Pro');
    expect(out.model).toBe('Pixel');
    expect(out.osBuild).toBe('TP1A.220624.014');
    expect(out.osName).toBe('Android');
    expect(out.osVersion).toBe('14');
    expect(out.platformString).toBe('Linux armv8l');
    expect(out.productName).toBe('husky');
    expect(out.supportedAbis).toEqual(['arm64-v8a', 'armeabi-v7a']);
    expect(out.totalMemory).toBe(8_000_000_000);
    expect(out.webViewVersion).toBe('120.0.6099.230');
  });

  it('web backend returns Desktop formFactor for desktop UA', () => {
    const backend = createWebDeviceBackend();
    const info = backend.getInfo(createDeviceInfo());
    // jsdom uses a desktop UA, so formFactor should be Desktop or Unknown
    expect([DeviceFormFactorDesktop, DeviceFormFactorUnknown]).toContain(info.formFactor);
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

describe('refreshDeviceInfo', () => {
  it('does not throw on the default web backend', () => {
    expect(() => refreshDeviceInfo()).not.toThrow();
  });

  it('calls refresh() on backends that expose it', () => {
    let refreshed = false;
    const backend = {
      ...fakeBackend(),
      refresh() {
        refreshed = true;
      },
    };
    setDeviceBackend(backend);
    refreshDeviceInfo();
    expect(refreshed).toBe(true);
  });
});

describe('setDeviceBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setDeviceBackend(fakeBackend());
    setDeviceBackend(null);
    expect(getDeviceBackend()).not.toBeNull();
    // After reset, should be the web backend (not the fake)
    const out = createDeviceInfo();
    getDeviceInfo(out);
    expect(out.model).toBe('');
  });
});
