// Generated from crates/flight-useragent/src/user_agent.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import {
  captureAfter,
  charsOf,
  contains,
  containsAny,
  isAsciiDigit,
  isDigitOrDot,
  matchesAt,
  positions,
} from './jsPattern.ts';
import type { PlatformEndianness, PlatformRuntime, UserAgentRuntimeWindow } from './userAgentNative.ts';
import {
  PlatformEngine,
  PlatformKind,
  PlatformName,
  detectEndiannessNative,
  parseUserAgentRuntimeNative,
} from './userAgentNative.ts';
import { parseUserAgentOsVersion } from './userAgentParse.ts';

/**
 * Pointer width in bits, or `Unknown` when the architecture does not identify one.
 */
export type UserAgentPointerWidth = 32 | 64 | -1;

/**
 * Probes host CPU byte order with a local two-byte write-then-read (the source's
 * `Uint16Array`/`Uint8Array` view of one buffer): `Big` when the high byte comes first, `Little`
 * when the low byte does. The source's `Unknown` arm is for runtimes without ArrayBuffer, which
 * cannot occur here.
 */
export function detectEndianness(): PlatformEndianness {
  return detectEndiannessNative();
}

/**
 * `i[3-6]86`
 */
function iX86(t: Readonly<number[]>): boolean {
  for (const at of positions(t, 'i')) {
    if (
      at + 3 < t.length &&
      Array.from({ length: 0x0036 - 0x0033 + 1 }, (_, index) => 0x0033 + index).includes(t[at + 1]) &&
      matchesAt(t, at + 2, '86')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Parses the canonical CPU architecture token from a UA string: "x64", "arm64", "x86", "arm",
 * "riscv64", "mips64", "mips", or "" when undetectable. A truthy `uadPlatform` (the UA-CH
 * `navigator.userAgentData.platform` hint) is consulted first, case-folded as JS `toLowerCase`
 * does; `undefined` and `Some("")` both skip it, as an empty string is falsy in TS. arm64/aarch64 is
 * tested before arm.
 */
export function parseUserAgentArch(ua: string, uadPlatform?: string): string {
  if (uadPlatform !== undefined) {
    const platform = uadPlatform;
    if (platform.length !== 0) {
      const p = charsOf(platform);
      if (contains(p, 'arm')) {
        return 'arm64';
      }
      if (
        contains(p, 'x86') ||
        contains(p, 'windows') ||
        contains(p, 'linux') ||
        contains(p, 'mac') ||
        contains(p, 'chrome')
      ) {
        return 'x64';
      }
    }
  }
  const t = charsOf(ua);
  const arch = containsAny(t, ['arm64', 'aarch64'])
    ? 'arm64'
    : contains(t, 'arm')
      ? 'arm'
      : containsAny(t, ['x86_64', 'win64', 'wow64', 'x64'])
        ? 'x64'
        : iX86(t) || contains(t, 'x86')
          ? 'x86'
          : contains(t, 'riscv64')
            ? 'riscv64'
            : contains(t, 'mips64')
              ? 'mips64'
              : contains(t, 'mips')
                ? 'mips'
                : '';
  return String(arch);
}

/**
 * Parses the browser engine from a UA string. iOS/iPadOS decide first (every browser there runs on
 * the system WebKit); then Firefox (gecko); legacy EdgeHTML (`Edge/<digit>`) is `Unknown`, not
 * blink; then Chrome/Chromium/Edg/OPR/Samsung (blink); then Safari/WebKit; else `Unknown`.
 */
export function parseUserAgentEngine(ua: string): PlatformEngine {
  const t = charsOf(ua);
  if (containsAny(t, ['iphone', 'ipad', 'ipod'])) {
    return PlatformEngine.Webkit;
  }
  if (contains(t, 'firefox')) {
    return PlatformEngine.Gecko;
  }
  if (positions(t, 'edge/').some((at) => at + 5 < t.length && isAsciiDigit(t[at + 5]))) {
    return PlatformEngine.Unknown;
  }
  if (containsAny(t, ['chrome', 'chromium', 'edg', 'opr', 'samsung'])) {
    return PlatformEngine.Blink;
  }
  if (containsAny(t, ['safari', 'webkit'])) {
    return PlatformEngine.Webkit;
  }
  return PlatformEngine.Unknown;
}

/**
 * Extracts the raw browser/engine version token for `engine` ("" when absent or `Unknown`): gecko
 * `Firefox/`; blink `Edg/`, then `OPR/`, then `Chrome/`; webkit `Version/`, then `AppleWebKit/`.
 * Never parsed for semantics.
 */
export function parseUserAgentEngineVersion(ua: string, engine: PlatformEngine): string {
  const t = charsOf(ua);
  if (engine === PlatformEngine.Gecko) {
    const firefox = captureAfter(t, 'firefox/', isDigitOrDot);
    if (firefox !== undefined) {
      const value = firefox;
      return value;
    }
    return '';
  }
  if (engine === PlatformEngine.Blink) {
    const edge = captureAfter(t, 'edg/', isDigitOrDot);
    if (edge !== undefined) {
      const value = edge;
      return value;
    }
    const opera = captureAfter(t, 'opr/', isDigitOrDot);
    if (opera !== undefined) {
      const value = opera;
      return value;
    }
    const chrome = captureAfter(t, 'chrome/', isDigitOrDot);
    if (chrome !== undefined) {
      const value = chrome;
      return value;
    }
    return '';
  }
  if (engine === PlatformEngine.Webkit) {
    const version = captureAfter(t, 'version/', isDigitOrDot);
    if (version !== undefined) {
      const value = version;
      return value;
    }
    const webkit = captureAfter(t, 'applewebkit/', isDigitOrDot);
    if (webkit !== undefined) {
      const value = webkit;
      return value;
    }
  }
  return '';
}

/**
 * The platform kind derived from a name: iOS and Android are `Mobile`; everything else is `Web`.
 */
export function parseUserAgentKind(name: PlatformName): PlatformKind {
  if (name === PlatformName.Ios || name === PlatformName.Android) {
    return PlatformKind.Mobile;
  }
  return PlatformKind.Web;
}

/**
 * The platform name from a UA string, in source precedence (android, iOS devices, `win`, `mac`,
 * linux); `Web` when no known OS is detected.
 */
export function parseUserAgentName(ua: string): PlatformName {
  const t = charsOf(ua);
  if (contains(t, 'android')) {
    return PlatformName.Android;
  }
  if (containsAny(t, ['iphone', 'ipad', 'ipod'])) {
    return PlatformName.Ios;
  }
  if (contains(t, 'win')) {
    return PlatformName.Windows;
  }
  if (contains(t, 'mac')) {
    return PlatformName.MacOs;
  }
  if (contains(t, 'linux')) {
    return PlatformName.Linux;
  }
  return PlatformName.Web;
}

/**
 * Pointer width in bits from a canonical arch token: 64 for "x64"/"arm64", 32 for "x86"/"arm", -1
 * otherwise (TS `32 | 64 | -1`).
 */
export function parseUserAgentPointerWidth(arch: string): UserAgentPointerWidth {
  if (arch === 'x64' || arch === 'arm64') {
    return 64;
  }
  if (arch === 'x86' || arch === 'arm') {
    return 32;
  }
  return -1;
}

/**
 * The host shell from browser-global probes on a window-like record (TS `Record<string, unknown>
 * | null | undefined`; `None` is null/undefined). `Unknown` for no window; `Electron` when
 * `process.versions.electron` is truthy; `Tauri` when `__TAURI__` is truthy; `Capacitor` when
 * `Capacitor` is truthy; else `Web`. Truthiness and property access follow JS (see `isTruthy`):
 * a nested object is a `Record<Unknown>` stored in the `Unknown`.
 */
export function parseUserAgentRuntime(win: UserAgentRuntimeWindow): PlatformRuntime {
  return parseUserAgentRuntimeNative(win);
}

/**
 * The raw dotted OS version for `name`: "" for `Linux` (no kernel version in a browser UA), for
 * the `Web` fallback, and when `name` is not the platform the UA describes; otherwise
 * `parseUserAgentOsVersion`.
 */
export function parseUserAgentVersion(ua: string, name: PlatformName): string {
  if (name === PlatformName.Linux || name === PlatformName.Web) {
    return '';
  }
  if (parseUserAgentName(ua) !== name) {
    return '';
  }
  return parseUserAgentOsVersion(ua);
}
