// The platform-integration suite's shared contracts. Each desktop/mobile capability (clipboard,
// dialog, filesystem, …) is its own cellular package exposing flat free functions over an explicit
// provider. Web/DOM and native hosts supply provider values; callers choose and pass the exact
// capability each operation needs. The descriptors and function signatures remain host-agnostic.

export type PlatformName = 'web' | 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'unknown';

// Host CPU byte order, as probed from the runtime ('unknown' when unprobeable).
export type PlatformEndianness = 'big' | 'little' | 'unknown';

// Browser layout/JS engine family the host runs on ('unknown' for native or unrecognized hosts).
export type PlatformEngine = 'gecko' | 'blink' | 'webkit' | 'unknown';

export type PlatformKind = 'desktop' | 'mobile' | 'web' | 'unknown';

// Host shell / runtime environment wrapping the page ('web' for a plain browser, 'native' for a
// non-web-shell native host, 'unknown' off-DOM).
export type PlatformRuntime = 'web' | 'electron' | 'tauri' | 'capacitor' | 'native' | 'unknown';

export interface PlatformInfo extends Entity {
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
  // Host shell / runtime environment wrapping the page (web vs. Electron/Tauri/Capacitor/native).
  runtime: PlatformRuntime;
  // Browser layout/JS engine family. 'unknown' on native hosts with no browser engine.
  engine: PlatformEngine;
  // Browser engine version string when known, else ''. Never parsed for semantics here.
  engineVersion: string;
  // Host CPU byte order, as probed from the runtime. 'unknown' when unprobeable.
  endianness: PlatformEndianness;
  // Pointer/word width in bits inferred from the architecture: 32, 64, or -1 when unknown.
  pointerWidth: 32 | 64 | -1;
  // OS build identifier when the native host reports one, else '' (always '' on web).
  osBuild: string;
  // Linux distribution id (e.g. 'ubuntu') when the native host reports one, else '' (always '' on web).
  distro: string;
  // Linux distribution version string when the native host reports one, else '' (always '' on web).
  distroVersion: string;
}

// The root environment-identification capability passed directly to the package's free functions.
export interface HostPlatformProvider extends Entity {
  getInfo(out: PlatformInfo): PlatformInfo;
}
import type { Entity } from './Entity';
