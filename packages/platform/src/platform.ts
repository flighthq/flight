import type { PlatformBackend, PlatformInfo, PlatformKind, PlatformName } from '@flighthq/types';

// Allocates a zeroed PlatformInfo; use as the `out` for getPlatformInfo or when building a backend.
export function createPlatformInfo(): PlatformInfo {
  return { arch: '', isTouch: false, kind: 'unknown', locale: '', name: 'unknown', version: '' };
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

// True on a desktop host (Electron/Tauri/native window shell). False on mobile and plain web.
export function isPlatformDesktop(): boolean {
  return getPlatformKind() === 'desktop';
}

// True on a mobile host (iOS/Android via Capacitor or a native shell).
export function isPlatformMobile(): boolean {
  return getPlatformKind() === 'mobile';
}

// True on a touch-primary device, independent of desktop/mobile classification.
export function isPlatformTouch(): boolean {
  return getPlatformInfo(_scratch).isTouch;
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
const _scratch: PlatformInfo = createPlatformInfo();

function getWebPlatformInfo(out: PlatformInfo): PlatformInfo {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const ua = nav?.userAgent ?? '';
  out.name = detectWebPlatformName(ua);
  out.kind = out.name === 'ios' || out.name === 'android' ? 'mobile' : 'web';
  out.version = '';
  out.arch = '';
  out.locale = nav?.language ?? '';
  out.isTouch =
    typeof navigator !== 'undefined' && 'maxTouchPoints' in navigator ? navigator.maxTouchPoints > 0 : false;
  return out;
}

function detectWebPlatformName(ua: string): PlatformName {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/win/i.test(ua)) return 'windows';
  if (/mac/i.test(ua)) return 'macos';
  if (/linux/i.test(ua)) return 'linux';
  return 'web';
}
