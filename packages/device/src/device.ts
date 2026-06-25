import type {
  DeviceBackend,
  DeviceCapabilities,
  DeviceDisplayMetrics,
  DeviceInfo,
  SafeAreaInsets,
} from '@flighthq/types';
import { DeviceFormFactorUnknown } from '@flighthq/types';
import {
  parseUserAgentArch,
  parseUserAgentFormFactor,
  parseUserAgentOsName,
  parseUserAgentOsVersion,
} from '@flighthq/useragent';

// Allocates a zeroed DeviceCapabilities; use as the `out` for getDeviceCapabilities.
// All boolean fields default to false (unknown).
export function createDeviceCapabilities(): DeviceCapabilities {
  return {
    hasKeyboard: false,
    hasMouse: false,
    hasStylus: false,
  };
}

// Allocates a zeroed DeviceDisplayMetrics; use as the `out` for getDeviceDisplayMetrics.
// All numeric fields default to -1 when unknown.
export function createDeviceDisplayMetrics(): DeviceDisplayMetrics {
  return {
    colorDepth: -1,
    densityDpi: -1,
    logicalHeight: -1,
    logicalWidth: -1,
    physicalHeight: -1,
    physicalWidth: -1,
    pixelRatio: -1,
  };
}

// Allocates a zeroed DeviceInfo; use as the `out` for getDeviceInfo or when building a backend.
// Strings default to '', booleans to false, arrays to [], and unknown-numeric fields to -1.
export function createDeviceInfo(): DeviceInfo {
  return {
    arch: '',
    availableMemory: -1,
    boardName: '',
    colorGamut: '',
    cpuCores: -1,
    fontScale: -1,
    formFactor: DeviceFormFactorUnknown,
    gpuRenderer: '',
    gpuVendor: '',
    isHdr: false,
    isJailbroken: false,
    isLowEndDevice: false,
    isRooted: false,
    isVirtual: false,
    manufacturer: '',
    marketingName: '',
    model: '',
    osBuild: '',
    osName: '',
    osVersion: '',
    platformString: '',
    productName: '',
    supportedAbis: [],
    totalMemory: -1,
    webViewVersion: '',
  };
}

// Allocates a zeroed SafeAreaInsets (all edges 0); use as the `out` for getSafeAreaInsets.
export function createSafeAreaInsets(): SafeAreaInsets {
  return { bottom: 0, left: 0, right: 0, top: 0 };
}

// Builds the default web backend. Reads what the browser exposes and returns sentinels for
// everything a web page cannot know (model/manufacturer, OS version, safe area, DPI).
export function createWebDeviceBackend(): DeviceBackend {
  return {
    getCapabilities(out: DeviceCapabilities): DeviceCapabilities {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      // hasMouse: weak heuristic — no touch points is a strong desktop / pointer-device signal.
      // This is best-effort; the browser cannot confirm whether a physical mouse is attached.
      const maxTouch = nav !== null && 'maxTouchPoints' in nav ? nav.maxTouchPoints : -1;
      out.hasMouse = maxTouch === 0;
      // hasKeyboard: desktop UAs very likely have a physical keyboard; mobile UAs likely do not.
      // Cannot distinguish virtual + physical keyboard on hybrid devices (Surface, iPad with keyboard).
      const ua = nav?.userAgent ?? '';
      out.hasKeyboard = detectDesktopUa(ua);
      // hasStylus: no reliable UA or API signal in browsers — always false.
      out.hasStylus = false;
      return out;
    },
    getDisplayMetrics(out: DeviceDisplayMetrics): DeviceDisplayMetrics {
      const win = typeof window !== 'undefined' ? window : null;
      const scr = typeof screen !== 'undefined' ? screen : null;
      out.colorDepth = scr !== null ? scr.colorDepth : -1;
      // DPI is not exposed by browsers — always sentinel.
      out.densityDpi = -1;
      out.logicalHeight = scr !== null ? scr.height : -1;
      out.logicalWidth = scr !== null ? scr.width : -1;
      const pixelRatio = win !== null ? win.devicePixelRatio : -1;
      out.pixelRatio = pixelRatio;
      out.physicalWidth = scr !== null && pixelRatio > 0 ? Math.round(scr.width * pixelRatio) : -1;
      out.physicalHeight = scr !== null && pixelRatio > 0 ? Math.round(scr.height * pixelRatio) : -1;
      return out;
    },
    getId(): string {
      // Web: crypto.randomUUID() persisted to localStorage as a stable install id.
      // Returns '' when storage is unavailable (SSR, private browsing with blocked storage).
      // This is an install id — it resets if localStorage is cleared. Not a hardware serial.
      // For a durable cross-storage id, use @flighthq/storage as the backend's persistence layer.
      try {
        const key = '__flighthq_device_id';
        const existing = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
        if (existing !== null) return existing;
        if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') return '';
        const id = crypto.randomUUID();
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, id);
        return id;
      } catch {
        return '';
      }
    },
    getInfo(out: DeviceInfo): DeviceInfo {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      const ua = nav?.userAgent ?? '';
      const uadPlatform: string | undefined = (nav as { userAgentData?: { platform?: string } } | null)?.userAgentData
        ?.platform;
      out.arch = parseUserAgentArch(ua, uadPlatform);
      // availableMemory is not exposed by browsers — always -1.
      out.availableMemory = -1;
      // boardName, marketingName, productName, supportedAbis — not exposed by browsers.
      out.boardName = '';
      // colorGamut, fontScale, isHdr — not exposed by browsers.
      out.colorGamut = '';
      const cores = nav !== null && 'hardwareConcurrency' in nav ? (nav.hardwareConcurrency ?? -1) : -1;
      out.cpuCores = cores;
      out.fontScale = -1;
      out.formFactor = parseUserAgentFormFactor(ua, nav !== null && 'maxTouchPoints' in nav ? nav.maxTouchPoints : -1);
      const gpuInfo = readWebGpuInfo();
      out.gpuRenderer = gpuInfo.renderer;
      out.gpuVendor = gpuInfo.vendor;
      out.isHdr = false;
      // isJailbroken and isRooted are always false on web — no detection available.
      out.isJailbroken = false;
      const devMem =
        nav !== null && 'deviceMemory' in nav ? ((nav as { deviceMemory?: number }).deviceMemory ?? -1) : -1;
      out.isLowEndDevice = detectLowEndDevice(devMem, cores);
      out.isRooted = false;
      out.isVirtual = false;
      out.manufacturer = '';
      out.marketingName = '';
      out.model = '';
      out.osBuild = '';
      out.osName = parseUserAgentOsName(ua);
      out.osVersion = parseUserAgentOsVersion(ua);
      out.platformString = ua;
      out.productName = '';
      out.supportedAbis = [];
      // totalMemory: navigator.deviceMemory is in GiB; convert to bytes. -1 when absent.
      out.totalMemory = devMem >= 0 ? devMem * 1024 * 1024 * 1024 : -1;
      // webViewVersion is not exposed by browsers (we are the browser).
      out.webViewVersion = '';
      return out;
    },
    getSafeAreaInsets(out: SafeAreaInsets): SafeAreaInsets {
      // Reading CSS env(safe-area-inset-*) requires a probe element in the DOM. The web backend
      // returns zero insets by default. Call enableWebSafeAreaInsets() to mount a live CSS-var probe
      // that updates this when the device reports real insets (notched PWAs).
      const insets = _safeAreaInsets;
      if (insets !== null) {
        out.bottom = insets.bottom;
        out.left = insets.left;
        out.right = insets.right;
        out.top = insets.top;
      } else {
        out.bottom = 0;
        out.left = 0;
        out.right = 0;
        out.top = 0;
      }
      return out;
    },
  };
}

// Mounts a CSS env(safe-area-inset-*) probe element in the DOM and keeps the active web backend's
// safe-area values live. Call once after the page is ready; unmount by calling the returned dispose
// function. Has no effect when called outside of a browser context (SSR, workers). The probe is
// cheap: one hidden element, no polling — a ResizeObserver detects viewport changes.
// Returns a dispose function that removes the probe element and stops the observer.
export function enableWebSafeAreaInsets(): () => void {
  if (typeof document === 'undefined') return () => {};

  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;top:env(safe-area-inset-top,0px);right:env(safe-area-inset-right,0px);' +
    'bottom:env(safe-area-inset-bottom,0px);left:env(safe-area-inset-left,0px);' +
    'pointer-events:none;visibility:hidden;';
  document.body.appendChild(el);

  function readInsets(): void {
    const style = getComputedStyle(el);
    _safeAreaInsets = {
      bottom: parseFloat(style.bottom) || 0,
      left: parseFloat(style.left) || 0,
      right: parseFloat(style.right) || 0,
      top: parseFloat(style.top) || 0,
    };
  }

  readInsets();

  // ResizeObserver may be absent in older browsers or test environments; fall back to a no-op.
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(readInsets) : null;
  if (observer !== null) observer.observe(document.documentElement);

  return () => {
    if (observer !== null) observer.disconnect();
    el.parentNode?.removeChild(el);
    _safeAreaInsets = null;
  };
}

// Returns the active device backend, or a lazily-created web default. There is always a backend.
export function getDeviceBackend(): DeviceBackend {
  if (_backend === null) _backend = createWebDeviceBackend();
  return _backend;
}

// Fills `out` with the device's input/hardware capability flags and returns it.
// Only surfaces capabilities with no dedicated package owner; see DeviceCapabilities for cross-refs.
export function getDeviceCapabilities(out: DeviceCapabilities): DeviceCapabilities {
  return getDeviceBackend().getCapabilities(out);
}

// Fills `out` with the device's built-in display metrics and returns it. Reads the active backend.
// For live multi-display enumeration and work-area geometry, use @flighthq/screen.
export function getDeviceDisplayMetrics(out: DeviceDisplayMetrics): DeviceDisplayMetrics {
  return getDeviceBackend().getDisplayMetrics(out);
}

// Returns a stable install identifier for this device/app install. Backed by DeviceBackend.getId().
// Web default: crypto.randomUUID() persisted to localStorage. Returns '' when no stable id can be
// formed (SSR, blocked storage, privacy mode). This is an _install_ id — resettable by clearing
// storage — not a hardware serial.
export function getDeviceId(): string {
  return getDeviceBackend().getId();
}

// Fills `out` with the running device's identity and returns it. Reads the active backend.
export function getDeviceInfo(out: DeviceInfo): DeviceInfo {
  return getDeviceBackend().getInfo(out);
}

// Fills `out` with the device's safe-area insets, in CSS pixels, and returns it.
// Web: returns zeros by default; call enableWebSafeAreaInsets() for real CSS env() values.
export function getSafeAreaInsets(out: SafeAreaInsets): SafeAreaInsets {
  return getDeviceBackend().getSafeAreaInsets(out);
}

// Invalidates any snapshot cached in the active backend and triggers a fresh read on the next call
// to getDeviceInfo / getSafeAreaInsets / getDeviceDisplayMetrics. Useful for orientation-affected
// safe-area insets and available-memory reads that may change at runtime.
// The web default backend is stateless (no cache), so this is a no-op there; native backends that
// cache a snapshot must listen for this signal and invalidate their cache.
export function refreshDeviceInfo(): void {
  const backend = getDeviceBackend();
  const maybeRefreshable = backend as unknown as { refresh?: () => void };
  if (typeof maybeRefreshable.refresh === 'function') {
    maybeRefreshable.refresh();
  }
}

// Installs a native host device backend; pass null to fall back to the web default.
export function setDeviceBackend(backend: DeviceBackend | null): void {
  _backend = backend;
}

let _backend: DeviceBackend | null = null;
let _safeAreaInsets: SafeAreaInsets | null = null;

// ---------------------------------------------------------------------------
// Web-backend detection helpers (private)
// ---------------------------------------------------------------------------

function detectDesktopUa(ua: string): boolean {
  return /win(?:dows)?nt|macintosh|mac os x|linux(?!.*android)|cros|x11/i.test(ua);
}

function detectLowEndDevice(deviceMemoryGib: number, cores: number): boolean {
  // Low-end heuristic: <= 1 GiB RAM or <= 2 cores. Both sentinels (-1) = unknown = false.
  if (deviceMemoryGib > 0 && deviceMemoryGib <= 1) return true;
  if (cores > 0 && cores <= 2) return true;
  return false;
}

function readWebGpuInfo(): { vendor: string; renderer: string } {
  // Reads WEBGL_debug_renderer_info from a transient WebGL context. Returns '' when unavailable or
  // blocked by browser privacy budget. This is best-effort — modern browsers may mask or randomize.
  try {
    if (typeof document === 'undefined') return { renderer: '', vendor: '' };
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ??
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (gl === null) return { renderer: '', vendor: '' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext === null) return { renderer: '', vendor: '' };
    const vendor = (gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) as string) ?? '';
    const renderer = (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string) ?? '';
    return { renderer, vendor };
  } catch {
    return { renderer: '', vendor: '' };
  }
}
