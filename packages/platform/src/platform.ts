import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  HasSystemPlatform,
  PlatformEngine,
  PlatformInfo,
  PlatformKind,
  PlatformName,
  PlatformRuntime,
} from '@flighthq/types/contract';

// Compares two dotted version strings numerically, segment by segment. Returns -1, 0, or 1.
// Non-numeric trailing segments are ignored; '' sorts lowest. '' compared with '' returns 0.
// Example: comparePlatformVersions('10.15.7', '10.15.6') === 1.
export function comparePlatformVersions(a: string, b: string): -1 | 0 | 1 {
  if (a === b) return 0;
  const aParts = a === '' ? [] : a.split('.');
  const bParts = b === '' ? [] : b.split('.');
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const aNum = i < aParts.length ? parseInt(aParts[i], 10) : 0;
    const bNum = i < bParts.length ? parseInt(bParts[i], 10) : 0;
    const aN = isNaN(aNum) ? 0 : aNum;
    const bN = isNaN(bNum) ? 0 : bNum;
    if (aN < bN) return -1;
    if (aN > bN) return 1;
  }
  return 0;
}

// Allocates a zeroed PlatformInfo; use as the `out` for getPlatformInfo or when building a backend.
export function createPlatformInfo(): PlatformInfo {
  const out = allocateEntity<PlatformInfo>();
  out.arch = '';
  out.distro = '';
  out.distroVersion = '';
  out.endianness = 'unknown';
  out.engine = 'unknown';
  out.engineVersion = '';
  out.isTouch = false;
  out.kind = 'unknown';
  out.locale = '';
  out.name = 'unknown';
  out.osBuild = '';
  out.pointerWidth = -1;
  out.runtime = 'unknown';
  out.version = '';
  return finishEntity(out);
}

// The browser rendering engine — 'blink' | 'gecko' | 'webkit' | 'unknown'. Convenience over
// getPlatformInfo. 'unknown' on native hosts where no browser engine is present.
export function getPlatformEngine(host: HasSystemPlatform): PlatformEngine {
  return getPlatformInfo(host, _scratch).engine;
}

// Fills `out` with the running platform's identity and returns it. Cheap; reads the active backend.
export function getPlatformInfo(host: HasSystemPlatform, out: PlatformInfo): PlatformInfo {
  return host.system.platform.getInfo(out);
}

// The platform family — 'desktop' | 'mobile' | 'web' | 'unknown'. Convenience over getPlatformInfo.
export function getPlatformKind(host: HasSystemPlatform): PlatformKind {
  return getPlatformInfo(host, _scratch).kind;
}

// The specific OS/runtime name — 'windows' | 'macos' | 'ios' | 'android' | 'linux' | 'web' | 'unknown'.
export function getPlatformName(host: HasSystemPlatform): PlatformName {
  return getPlatformInfo(host, _scratch).name;
}

// The host shell / runtime environment — 'web' | 'electron' | 'tauri' | 'capacitor' | 'native' |
// 'unknown'. Convenience over getPlatformInfo. Distinguishes plain web from a host shell.
export function getPlatformRuntime(host: HasSystemPlatform): PlatformRuntime {
  return getPlatformInfo(host, _scratch).runtime;
}

// True on a desktop host (Electron/Tauri/native window shell). False on mobile and plain web.
export function isPlatformDesktop(host: HasSystemPlatform): boolean {
  return getPlatformKind(host) === 'desktop';
}

// True on a mobile host (iOS/Android via Capacitor or a native shell).
export function isPlatformMobile(host: HasSystemPlatform): boolean {
  return getPlatformKind(host) === 'mobile';
}

// True when the app is running inside a host shell (Electron/Tauri/Capacitor/native), not a plain
// browser page. Convenience over `getPlatformRuntime() !== 'web' && !== 'unknown'`.
export function isPlatformNative(host: HasSystemPlatform): boolean {
  const runtime = getPlatformRuntime(host);
  return runtime !== 'web' && runtime !== 'unknown';
}

// True on a touch-primary device, independent of desktop/mobile classification.
export function isPlatformTouch(host: HasSystemPlatform): boolean {
  return getPlatformInfo(host, _scratch).isTouch;
}

// True when the running platform's OS version is at or above `minimum`. Reads the live version via
// getPlatformInfo. Returns false when the version is '' (unknown). The comparison is numeric and
// segment-wise (see comparePlatformVersions).
export function isPlatformVersionAtLeast(host: HasSystemPlatform, minimum: string): boolean {
  const version = getPlatformInfo(host, _scratch).version;
  if (version === '') return false;
  return comparePlatformVersions(version, minimum) >= 0;
}

// True when running as a plain web page with no native host registered.
export function isPlatformWeb(host: HasSystemPlatform): boolean {
  return getPlatformKind(host) === 'web';
}

// Single-threaded JS no-alloc scratch for scalar convenience reads (getPlatformKind, etc.).
// Rust/native mirror uses a per-call local or thread-local instead.
const _scratch: PlatformInfo = createPlatformInfo();
