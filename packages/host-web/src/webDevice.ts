import { createEntity } from '@flighthq/entity/contract';
import type {
  DeviceBackend,
  DeviceCapabilities,
  DeviceDisplayMetrics,
  DeviceInfo,
  Entity,
  SafeAreaInsets,
} from '@flighthq/types/contract';
import {
  parseUserAgentArch,
  parseUserAgentFormFactor,
  parseUserAgentOsName,
  parseUserAgentOsVersion,
} from '@flighthq/useragent/contract';

export function createWebDeviceBackend(): DeviceBackend {
  return createEntity<Omit<DeviceBackend, keyof Entity>>({
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
      out.colorGamut = detectColorGamut();
      const cores = nav !== null && 'hardwareConcurrency' in nav ? (nav.hardwareConcurrency ?? -1) : -1;
      out.cpuCores = cores;
      out.fontScale = -1;
      out.formFactor = parseUserAgentFormFactor(ua, nav !== null && 'maxTouchPoints' in nav ? nav.maxTouchPoints : -1);
      const gpuInfo = readWebGpuInfo();
      out.gpuRenderer = gpuInfo.renderer;
      out.gpuVendor = gpuInfo.vendor;
      out.isHdr = detectHdr();
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
  });
}

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

  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(readInsets) : null;
  if (observer !== null) observer.observe(document.documentElement);

  return () => {
    if (observer !== null) observer.disconnect();
    el.parentNode?.removeChild(el);
    _safeAreaInsets = null;
  };
}

export const webDeviceBackend: DeviceBackend = createWebDeviceBackend();

let _safeAreaInsets: SafeAreaInsets | null = null;

function detectColorGamut(): string {
  if (typeof matchMedia === 'undefined') return '';
  if (matchMedia('(color-gamut: rec2020)').matches) return 'rec2020';
  if (matchMedia('(color-gamut: p3)').matches) return 'p3';
  if (matchMedia('(color-gamut: srgb)').matches) return 'srgb';
  return '';
}

function detectDesktopUa(ua: string): boolean {
  return /win(?:dows)?nt|macintosh|mac os x|linux(?!.*android)|cros|x11/i.test(ua);
}

function detectHdr(): boolean {
  if (typeof matchMedia === 'undefined') return false;
  return matchMedia('(dynamic-range: high)').matches;
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
