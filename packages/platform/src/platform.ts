import type { BackendExplanation } from '@flighthq/types/contract';
import type {
  PlatformBackend,
  PlatformEngine,
  PlatformInfo,
  PlatformKind,
  PlatformName,
  PlatformRuntime,
} from '@flighthq/types/contract';
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
} from '@flighthq/useragent/contract';

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

export function explainPlatformBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

// The active platform backend. Capability packages call their own get*Backend; this is the root
// one for environment identification.
export function getPlatformBackend(): PlatformBackend {
  return _custom ?? _host ?? _sentinel;
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

export function installPlatformHostBackend(backend: PlatformBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
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

export function observePlatformHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

export function resetPlatformBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

// Installs a native host backend (Electron/Tauri/Capacitor/native). Pass null to fall back to
// the host or sentinel layer.
export function setPlatformBackend(backend: PlatformBackend | null): void {
  _custom = backend;
}

let _custom: PlatformBackend | null = null;
let _host: PlatformBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;
// Single-threaded JS no-alloc scratch for scalar convenience reads (getPlatformKind, etc.).
// Rust/native mirror uses a per-call local or thread-local instead.
const _scratch: PlatformInfo = createPlatformInfo();

const _sentinel: PlatformBackend = {
  getInfo(out: PlatformInfo): PlatformInfo {
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
    return out;
  },
};

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
