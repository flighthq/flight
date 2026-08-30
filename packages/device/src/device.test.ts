import type {
  DeviceBackend,
  DeviceCapabilities,
  DeviceDisplayMetrics,
  DeviceInfo,
  HasSystemDevice,
  SafeAreaInsets,
} from '@flighthq/types/contract';
import { DeviceFormFactorUnknown } from '@flighthq/types/contract';

import * as deviceContract from './device';
import {
  createDeviceCapabilities,
  createDeviceDisplayMetrics,
  createDeviceInfo,
  createSafeAreaInsets,
  getDeviceCapabilities,
  getDeviceDisplayMetrics,
  getDeviceId,
  getDeviceInfo,
  getSafeAreaInsets,
  refreshDeviceInfo,
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

function fakeHost(): HasSystemDevice {
  return { system: { device: fakeBackend() } };
}

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

describe('getDeviceCapabilities', () => {
  it('fills and returns out via the host backend', () => {
    const host = fakeHost();
    const out = createDeviceCapabilities();
    const result = getDeviceCapabilities(host, out);
    expect(result).toBe(out);
    expect(out.hasKeyboard).toBe(true);
    expect(out.hasMouse).toBe(true);
    expect(out.hasStylus).toBe(false);
  });
});

describe('getDeviceDisplayMetrics', () => {
  it('fills and returns out via the host backend', () => {
    const host = fakeHost();
    const out = createDeviceDisplayMetrics();
    const result = getDeviceDisplayMetrics(host, out);
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
  it('returns the value from the host backend', () => {
    const host = fakeHost();
    expect(getDeviceId(host)).toBe('test-device-id');
  });
});

describe('getDeviceInfo', () => {
  it('fills and returns out via the host backend', () => {
    const host = fakeHost();
    const out = createDeviceInfo();
    const result = getDeviceInfo(host, out);
    expect(result).toBe(out);
    expect(out.arch).toBe('arm64');
    expect(out.availableMemory).toBe(3_000_000_000);
    expect(out.boardName).toBe('msm8998');
    expect(out.colorGamut).toBe('display-p3');
    expect(out.cpuCores).toBe(8);
    expect(out.fontScale).toBe(1.2);
    expect(out.formFactor).toBe('Phone');
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
});

describe('getSafeAreaInsets', () => {
  it('fills and returns out via the host backend', () => {
    const host = fakeHost();
    const out = createSafeAreaInsets();
    const result = getSafeAreaInsets(host, out);
    expect(result).toBe(out);
    expect(out.top).toBe(24);
    expect(out.bottom).toBe(16);
  });
});

describe('R3 boundary', () => {
  it('exports no ambient-state API (setDeviceBackend, getDeviceBackend, etc.)', () => {
    const exports = Object.keys(deviceContract);
    const deletedSymbols = [
      'createWebDeviceBackend',
      'enableWebSafeAreaInsets',
      'explainDeviceBackend',
      'getDeviceBackend',
      'installDeviceHostBackend',
      'observeDeviceHostResult',
      'resetDeviceBackendForTest',
      'setDeviceBackend',
    ];
    for (const symbol of deletedSymbols) {
      expect(exports).not.toContain(symbol);
    }
  });
});

describe('refreshDeviceInfo', () => {
  it('does not throw on a backend without refresh', () => {
    const host = fakeHost();
    expect(() => refreshDeviceInfo(host)).not.toThrow();
  });

  it('calls refresh() on backends that expose it', () => {
    let refreshed = false;
    const backend = {
      ...fakeBackend(),
      refresh() {
        refreshed = true;
      },
    };
    const host: HasSystemDevice = { system: { device: backend } };
    refreshDeviceInfo(host);
    expect(refreshed).toBe(true);
  });
});
