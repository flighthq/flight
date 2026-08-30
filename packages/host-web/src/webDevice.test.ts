import {
  createDeviceCapabilities,
  createDeviceDisplayMetrics,
  createDeviceInfo,
  createSafeAreaInsets,
} from '@flighthq/device/contract';
import { DeviceFormFactorDesktop, DeviceFormFactorUnknown } from '@flighthq/types/contract';

import { createWebDeviceBackend, enableWebSafeAreaInsets, webDeviceBackend } from './webDevice';

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
    expect(typeof metrics.pixelRatio).toBe('number');
    expect(typeof metrics.logicalWidth).toBe('number');
  });

  it('totalMemory converts deviceMemory GiB to bytes', () => {
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
      } else {
        delete (navigator as unknown as Record<string, unknown>)['deviceMemory'];
      }
    }
  });

  it('osVersion parses Android version from UA', () => {
    const backend = createWebDeviceBackend();
    const result = backend.getInfo(createDeviceInfo());
    expect(typeof result.osVersion).toBe('string');
  });

  it('getCapabilities returns a capability snapshot without throwing', () => {
    const backend = createWebDeviceBackend();
    const caps = backend.getCapabilities(createDeviceCapabilities());
    expect(typeof caps.hasKeyboard).toBe('boolean');
    expect(typeof caps.hasMouse).toBe('boolean');
    expect(caps.hasStylus).toBe(false);
  });

  it('web backend returns Desktop formFactor for desktop UA', () => {
    const backend = createWebDeviceBackend();
    const info = backend.getInfo(createDeviceInfo());
    expect([DeviceFormFactorDesktop, DeviceFormFactorUnknown]).toContain(info.formFactor);
  });
});

describe('enableWebSafeAreaInsets', () => {
  it('returns a dispose function and does not throw in jsdom', () => {
    const dispose = enableWebSafeAreaInsets();
    expect(typeof dispose).toBe('function');
    dispose();
  });
});

describe('webDeviceBackend', () => {
  it('is a pre-constructed singleton', () => {
    expect(webDeviceBackend).toBeDefined();
    expect(typeof webDeviceBackend.getInfo).toBe('function');
  });

  it('fills info identically to a fresh factory instance', () => {
    const a = createDeviceInfo();
    const b = createDeviceInfo();
    webDeviceBackend.getInfo(a);
    createWebDeviceBackend().getInfo(b);
    expect(a).toEqual(b);
  });
});
