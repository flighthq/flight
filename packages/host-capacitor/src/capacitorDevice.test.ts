import type { DeviceCapabilities, DeviceDisplayMetrics, DeviceInfo, SafeAreaInsets } from '@flighthq/types';

import { createCapacitorDeviceBackend } from './capacitorDevice';
import type { CapacitorApi } from './capacitorModule';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function fakeCapacitor() {
  const capacitor = {
    device: {
      async getInfo() {
        return {
          model: 'iPhone15,2',
          platform: 'ios',
          operatingSystem: 'ios',
          osVersion: '17.0',
          manufacturer: 'Apple',
          isVirtual: false,
          webViewVersion: '17.0',
          name: "Joe's iPhone",
        };
      },
      async getId() {
        return { identifier: 'device-uuid' };
      },
    },
  } as unknown as CapacitorApi;
  return { capacitor };
}

function blankInfo(): DeviceInfo {
  return {
    arch: 'z',
    availableMemory: 1,
    boardName: 'z',
    colorGamut: 'z',
    cpuCores: 1,
    fontScale: 1,
    formFactor: 'z',
    gpuRenderer: 'z',
    gpuVendor: 'z',
    isHdr: true,
    isJailbroken: true,
    isLowEndDevice: true,
    isRooted: true,
    isVirtual: true,
    manufacturer: 'z',
    marketingName: 'z',
    model: 'z',
    osBuild: 'z',
    osName: 'z',
    osVersion: 'z',
    platformString: 'z',
    productName: 'z',
    supportedAbis: ['z'],
    totalMemory: 1,
    webViewVersion: 'z',
  };
}

describe('createCapacitorDeviceBackend', () => {
  it('fills DeviceInfo from the prefetched Capacitor info once it resolves', async () => {
    const backend = createCapacitorDeviceBackend(fakeCapacitor().capacitor);
    // Sentinels until the construction-time prefetch settles.
    expect(backend.getInfo(blankInfo()).model).toBe('');
    await flush();
    const info = backend.getInfo(blankInfo());
    expect(info.model).toBe('iPhone15,2');
    expect(info.manufacturer).toBe('Apple');
    expect(info.osName).toBe('ios');
    expect(info.marketingName).toBe("Joe's iPhone");
    expect(info.formFactor).toBe('Phone');
    // Unreported fields fall back to sentinels.
    expect(info.arch).toBe('');
    expect(info.totalMemory).toBe(-1);
    expect(backend.getId()).toBe('device-uuid');
  });

  it('reports sentinels for metrics, capabilities, and safe-area insets', () => {
    const backend = createCapacitorDeviceBackend(fakeCapacitor().capacitor);
    const metrics: DeviceDisplayMetrics = {
      colorDepth: 1,
      densityDpi: 1,
      logicalHeight: 1,
      logicalWidth: 1,
      physicalHeight: 1,
      physicalWidth: 1,
      pixelRatio: 1,
    };
    expect(backend.getDisplayMetrics(metrics).pixelRatio).toBe(-1);
    const caps: DeviceCapabilities = { hasKeyboard: true, hasMouse: true, hasStylus: true };
    expect(backend.getCapabilities(caps)).toEqual({ hasKeyboard: false, hasMouse: false, hasStylus: false });
    const insets: SafeAreaInsets = { top: 9, right: 9, bottom: 9, left: 9 };
    expect(backend.getSafeAreaInsets(insets)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});
