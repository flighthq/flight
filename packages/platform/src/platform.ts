import type {
  PlatformBackend,
  PlatformEngine,
  PlatformInfo,
  PlatformKind,
  PlatformName,
  PlatformRuntime,
} from '@flighthq/types';
import {
  detectEndianness,
  parseUserAgentArch,
  parseUserAgentEngine,
  parseUserAgentEngineVersion,
  parseUserAgentKind,
  parseUserAgentName,
  parseUserAgentPointerWidth,
  parseUserAgentRuntime,
  parseUserAgentVersion,
} from '@flighthq/useragent';

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
  return {
    arch: '',
    distro: '',
    distroVersion: '',
    endianness: 'unknown',
    engine: 'unknown',
    engineVersion: '',
    isTouch: false,
    kind: 'unknown',
    locale: '',
    name: 'unknown',
    osBuild: '',
    pointerWidth: -1,
    runtime: 'unknown',
    version: '',
  };
}

// The fixed point of the suite: a host backend that identifies the running platform. Resolves to the
// registered native backend, or a lazily-created web backend so there is always an answer.
export function createWebPlatformBackend(): PlatformBackend {
  return { getInfo: getWebPlatformInfo };
}

// The active platform backend, or the web default when no native host has registered one. Capability
// packages call their own get*Backend; this is the root one for environment identification.
export function getPlatformBackend(): PlatformBackend {
  if (_backend === null) _backend = createWebPlatformBackend();
  return _backend;
}

// The browser rendering engine — 'blink' | 'gecko' | 'webkit' | 'unknown'. Convenience over
// getPlatformInfo. 'unknown' on native hosts where no browser engine is present.
export function getPlatformEngine(): PlatformEngine {
  return getPlatformInfo(_scratch).engine;
}

// Fills `out` with the running platform's identity and returns it. Cheap; reads the active backend.
export function getPlatformInfo(out: PlatformInfo): PlatformInfo {
  return getPlatformBackend().getInfo(out);
}

// The platform family — 'desktop' | 'mobile' | 'web' | 'unknown'. Convenience over getPlatformInfo.
export function getPlatformKind(): PlatformKind {
  return getPlatformInfo(_scratch).kind;
}

// The specific OS/runtime name — 'windows' | 'macos' | 'ios' | 'android' | 'linux' | 'web' | 'unknown'.
export function getPlatformName(): PlatformName {
  return getPlatformInfo(_scratch).name;
}

// The host shell / runtime environment — 'web' | 'electron' | 'tauri' | 'capacitor' | 'native' |
// 'unknown'. Convenience over getPlatformInfo. Distinguishes plain web from a host shell.
export function getPlatformRuntime(): PlatformRuntime {
  return getPlatformInfo(_scratch).runtime;
}

// True on a desktop host (Electron/Tauri/native window shell). False on mobile and plain web.
export function isPlatformDesktop(): boolean {
  return getPlatformKind() === 'desktop';
}

// True on a mobile host (iOS/Android via Capacitor or a native shell).
export function isPlatformMobile(): boolean {
  return getPlatformKind() === 'mobile';
}

// True when the app is running inside a host shell (Electron/Tauri/Capacitor/native), not a plain
// browser page. Convenience over `getPlatformRuntime() !== 'web' && !== 'unknown'`.
export function isPlatformNative(): boolean {
  const runtime = getPlatformRuntime();
  return runtime !== 'web' && runtime !== 'unknown';
}

// True on a touch-primary device, independent of desktop/mobile classification.
export function isPlatformTouch(): boolean {
  return getPlatformInfo(_scratch).isTouch;
}

// True when the running platform's OS version is at or above `minimum`. Reads the live version via
// getPlatformInfo. Returns false when the version is '' (unknown). The comparison is numeric and
// segment-wise (see comparePlatformVersions).
export function isPlatformVersionAtLeast(minimum: string): boolean {
  const version = getPlatformInfo(_scratch).version;
  if (version === '') return false;
  return comparePlatformVersions(version, minimum) >= 0;
}

// True when running as a plain web page with no native host registered.
export function isPlatformWeb(): boolean {
  return getPlatformKind() === 'web';
}

// Installs a native host backend (Electron/Tauri/Capacitor/native). Pass null to fall back to web.
// Opt-in and side-effect-free at import: nothing registers until a host calls this.
export function setPlatformBackend(backend: PlatformBackend | null): void {
  _backend = backend;
}

let _backend: PlatformBackend | null = null;
// Single-threaded JS no-alloc scratch for scalar convenience reads (getPlatformKind, etc.).
// Rust/native mirror uses a per-call local or thread-local instead.
const _scratch: PlatformInfo = createPlatformInfo();

function getWebPlatformInfo(out: PlatformInfo): PlatformInfo {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const ua = nav?.userAgent ?? '';
  out.name = parseUserAgentName(ua);
  out.kind = parseUserAgentKind(out.name);
  out.version = parseUserAgentVersion(ua, out.name);
  out.arch = parseUserAgentArch(ua);
  out.locale = nav?.language ?? '';
  out.isTouch =
    typeof navigator !== 'undefined' && 'maxTouchPoints' in navigator ? navigator.maxTouchPoints > 0 : false;
  out.runtime = parseUserAgentRuntime(
    typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null,
  );
  out.engine = parseUserAgentEngine(ua);
  out.engineVersion = parseUserAgentEngineVersion(ua, out.engine);
  out.endianness = detectEndianness();
  out.pointerWidth = parseUserAgentPointerWidth(out.arch);
  // osBuild, distro, distroVersion are native-only; web always returns ''.
  out.osBuild = '';
  out.distro = '';
  out.distroVersion = '';
  return out;
}
