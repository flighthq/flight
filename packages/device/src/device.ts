import type { DeviceBackend, DeviceInfo, SafeAreaInsets } from '@flighthq/types';

// Allocates a zeroed DeviceInfo; use as the `out` for getDeviceInfo or when building a backend.
// Strings default to '', booleans to false, and the unknown-numeric field (memory) to -1.
export function createDeviceInfo(): DeviceInfo {
  return {
    model: '',
    manufacturer: '',
    osName: '',
    osVersion: '',
    platform: '',
    isVirtual: false,
    memory: -1,
  };
}

// Allocates a zeroed SafeAreaInsets (all edges 0); use as the `out` for getSafeAreaInsets.
export function createSafeAreaInsets(): SafeAreaInsets {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

// Builds the default web backend. Reads what the browser exposes (userAgent, deviceMemory) and returns
// sentinels for everything a web page cannot know (model/manufacturer, OS version, safe area).
export function createWebDeviceBackend(): DeviceBackend {
  return {
    getInfo(out: DeviceInfo): DeviceInfo {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      const ua = nav?.userAgent ?? '';
      out.model = '';
      out.manufacturer = '';
      out.osName = detectWebOSName(ua);
      out.osVersion = '';
      out.platform = ua;
      out.isVirtual = false;
      out.memory = nav !== null && 'deviceMemory' in nav ? ((nav as { deviceMemory?: number }).deviceMemory ?? -1) : -1;
      return out;
    },
    getSafeAreaInsets(out: SafeAreaInsets): SafeAreaInsets {
      // Reading CSS env(safe-area-inset-*) via a probe is unreliable across browsers; a real value
      // requires a native host or a CSS-var bridge. Return zero insets on plain web.
      out.top = 0;
      out.right = 0;
      out.bottom = 0;
      out.left = 0;
      return out;
    },
  };
}

// The active device backend, or a lazily-created web default. There is always a backend.
export function getDeviceBackend(): DeviceBackend {
  if (_backend === null) _backend = createWebDeviceBackend();
  return _backend;
}

// Fills `out` with the running device's identity and returns it. Reads the active backend.
export function getDeviceInfo(out: DeviceInfo): DeviceInfo {
  return getDeviceBackend().getInfo(out);
}

// Fills `out` with the device's safe-area insets, in CSS pixels, and returns it.
export function getSafeAreaInsets(out: SafeAreaInsets): SafeAreaInsets {
  return getDeviceBackend().getSafeAreaInsets(out);
}

// Installs a native host device backend; pass null to fall back to the web default.
export function setDeviceBackend(backend: DeviceBackend | null): void {
  _backend = backend;
}

let _backend: DeviceBackend | null = null;

function detectWebOSName(ua: string): string {
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/win/i.test(ua)) return 'Windows';
  if (/mac/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  return '';
}
