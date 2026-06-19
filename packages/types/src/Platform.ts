// The platform-integration suite's shared contracts. Each desktop/mobile capability (clipboard,
// dialog, filesystem, …) is its own cellular package exposing flat free functions over a swappable
// backend: a web/DOM implementation is always available so there is no escape hatch, and a native
// host (Electron, Tauri, Capacitor, a C/C++ shell) replaces it via the capability's set*Backend.
// "Electron support" is therefore one backend, not a coupling — the descriptors and function
// signatures here are host-agnostic.

export type PlatformName = 'web' | 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'unknown';

export type PlatformKind = 'desktop' | 'mobile' | 'web' | 'unknown';

export interface PlatformInfo {
  name: PlatformName;
  kind: PlatformKind;
  // OS version string when the host reports one, else ''. Never parsed for semantics here.
  version: string;
  // CPU architecture ('x64', 'arm64', …) when known, else ''.
  arch: string;
  // BCP-47 locale tag, e.g. 'en-US'. '' when unknown.
  locale: string;
  // Whether the primary input is touch. Drives layout/hit-target decisions independent of name/kind.
  isTouch: boolean;
}

// The seam every capability follows: a host backend object whose methods the package's free
// functions delegate to. PlatformBackend is the root capability — environment identification.
export interface PlatformBackend {
  getInfo(out: PlatformInfo): PlatformInfo;
}
