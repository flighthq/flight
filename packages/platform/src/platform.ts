// Generated from crates/flight-platform/src/platform.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity, finishEntity } from '@flighthq/entity/contract';

import type {
  HostPlatformCapability,
  PlatformEndianness,
  PlatformEngine,
  PlatformInfo,
  PlatformKind,
  PlatformName,
  PlatformRuntime,
} from './types.ts';

/**
 * Compares two dotted version strings numerically, segment by segment: -1, 0 or 1. Each segment is
 * read as JS `parseInt(segment, 10)` reads it (leading whitespace, optional sign, the leading digit
 * run; trailing junk ignored), and a segment with no leading digits counts as 0, as does a missing
 * trailing segment. "" has no segments, so it sorts lowest; "" against "" is 0.
 */
export function comparePlatformVersions(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  const aParts: string[] = a.length === 0 ? ([] as never[]) : a.split('.');
  const bParts: string[] = b.length === 0 ? ([] as never[]) : b.split('.');
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const aNum = i < aParts.length ? parseJsInt(aParts[i]) : 0;
    const bNum = i < bParts.length ? parseJsInt(bParts[i]) : 0;
    const aN = aNum ?? 0;
    const bN = bNum ?? 0;
    if (aN < bN) {
      return -1;
    }
    if (aN > bN) {
      return 1;
    }
  }
  return 0;
}

export function createPlatformInfo(): PlatformInfo {
  let out: PlatformInfo = allocateEntity<PlatformInfo>();
  initializePlatformInfo(out);
  return finishEntity(out);
}

export function getPlatformEndiannessString(value: PlatformEndianness): string {
  switch (value) {
    case 'big':
      return 'big';
    case 'little':
      return 'little';
    case 'unknown':
      return 'unknown';
  }
}

/**
 * The browser rendering engine; `Unknown` on native hosts. A fresh read through the provider.
 */
export function getPlatformEngine(hostPlatform: Readonly<HostPlatformCapability>): PlatformEngine {
  return readPlatformInfo(hostPlatform).engine;
}

export function getPlatformEngineString(value: PlatformEngine): string {
  switch (value) {
    case 'gecko':
      return 'gecko';
    case 'blink':
      return 'blink';
    case 'webkit':
      return 'webkit';
    case 'unknown':
      return 'unknown';
  }
}

/**
 * Fills `out` with the running platform's identity through the supplied provider.
 */
export function getPlatformInfo(out: PlatformInfo, hostPlatform: Readonly<HostPlatformCapability>): void {
  hostPlatform.getInfo(out);
}

export function getPlatformKind(hostPlatform: Readonly<HostPlatformCapability>): PlatformKind {
  return readPlatformInfo(hostPlatform).kind;
}

export function getPlatformKindString(value: PlatformKind): string {
  switch (value) {
    case 'desktop':
      return 'desktop';
    case 'mobile':
      return 'mobile';
    case 'web':
      return 'web';
    case 'unknown':
      return 'unknown';
  }
}

export function getPlatformName(hostPlatform: Readonly<HostPlatformCapability>): PlatformName {
  return readPlatformInfo(hostPlatform).name;
}

export function getPlatformNameString(value: PlatformName): string {
  switch (value) {
    case 'web':
      return 'web';
    case 'windows':
      return 'windows';
    case 'macos':
      return 'macos';
    case 'linux':
      return 'linux';
    case 'ios':
      return 'ios';
    case 'android':
      return 'android';
    case 'unknown':
      return 'unknown';
  }
}

/**
 * The host shell / runtime environment; distinguishes plain web from a host shell.
 */
export function getPlatformRuntime(hostPlatform: Readonly<HostPlatformCapability>): PlatformRuntime {
  return readPlatformInfo(hostPlatform).runtime;
}

export function getPlatformRuntimeString(value: PlatformRuntime): string {
  switch (value) {
    case 'web':
      return 'web';
    case 'electron':
      return 'electron';
    case 'tauri':
      return 'tauri';
    case 'capacitor':
      return 'capacitor';
    case 'native':
      return 'native';
    case 'unknown':
      return 'unknown';
  }
}

/**
 * The zeroed snapshot: empty strings, `Unknown` enums, not touch, pointer width -1.
 */
export function initializePlatformInfo(out: PlatformInfo): void {
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
}

export function isPlatformDesktop(hostPlatform: Readonly<HostPlatformCapability>): boolean {
  return getPlatformKind(hostPlatform) === 'desktop';
}

export function isPlatformMobile(hostPlatform: Readonly<HostPlatformCapability>): boolean {
  return getPlatformKind(hostPlatform) === 'mobile';
}

/**
 * True inside a host shell (Electron, Tauri, Capacitor, native): any runtime other than `Web` and
 * `Unknown`.
 */
export function isPlatformNative(hostPlatform: Readonly<HostPlatformCapability>): boolean {
  const runtime = getPlatformRuntime(hostPlatform);
  return runtime !== 'web' && runtime !== 'unknown';
}

export function isPlatformTouch(hostPlatform: Readonly<HostPlatformCapability>): boolean {
  return readPlatformInfo(hostPlatform).isTouch;
}

/**
 * True when the platform's OS version is at or above `minimum`; false when the version is ""
 * (unknown). Numeric, segment-wise (see `comparePlatformVersions`).
 */
export function isPlatformVersionAtLeast(hostPlatform: Readonly<HostPlatformCapability>, minimum: string): boolean {
  const version = readPlatformInfo(hostPlatform).version;
  if (version.length === 0) {
    return false;
  }
  return comparePlatformVersions(version, minimum) >= 0;
}

export function isPlatformWeb(hostPlatform: Readonly<HostPlatformCapability>): boolean {
  return getPlatformKind(hostPlatform) === 'web';
}

/**
 * JS `parseInt(segment, 10)`: skips leading whitespace, takes an optional sign and the leading run
 * of ASCII digits (trailing junk is ignored), and returns None (NaN) when there are no digits. The
 * digit run is converted as a correctly rounded f64, as JS converts it.
 */
function parseJsInt(segment: string): number | undefined {
  const trimmed: string = ((text: string, matches: (character: string) => boolean): string => {
    let offset = 0;
    for (const character of text) {
      if (!matches(character)) break;
      offset += character.length;
    }
    return text.slice(offset);
  })(segment, (c: string) => /^\s$/.test(c) || c === '﻿');
  let negative;
  let rest;
  switch (new TextEncoder().encode(trimmed)[0]) {
    case 45:
      [negative, rest] = [true, trimmed.slice(1)];
      break;
    case 43:
      [negative, rest] = [false, trimmed.slice(1)];
      break;
    default:
      [negative, rest] = [false, trimmed];
      break;
  }
  const digitsLen = (<T>(items: readonly T[], predicate: (item: T) => boolean): T[] => {
    const result: T[] = [];
    for (const item of items) {
      if (!predicate(item)) break;
      result.push(item);
    }
    return result;
  })([...new TextEncoder().encode(rest)], (b) => b >= 48 && b <= 57).length;
  if (digitsLen === 0) {
    return undefined;
  }
  const value = ((s) => {
    const v = Number(s);
    return s.trim() !== '' && !Number.isNaN(v) ? v : undefined;
  })(rest.slice(0, digitsLen));
  if (value === undefined) {
    return undefined;
  }
  return negative ? -value : value;
}

export function parsePlatformEndianness(value: string): PlatformEndianness | undefined {
  switch (value) {
    case 'big':
      return 'big';
    case 'little':
      return 'little';
    case 'unknown':
      return 'unknown';
    default:
      return undefined;
  }
}

export function parsePlatformEngine(value: string): PlatformEngine | undefined {
  switch (value) {
    case 'gecko':
      return 'gecko';
    case 'blink':
      return 'blink';
    case 'webkit':
      return 'webkit';
    case 'unknown':
      return 'unknown';
    default:
      return undefined;
  }
}

export function parsePlatformKind(value: string): PlatformKind | undefined {
  switch (value) {
    case 'desktop':
      return 'desktop';
    case 'mobile':
      return 'mobile';
    case 'web':
      return 'web';
    case 'unknown':
      return 'unknown';
    default:
      return undefined;
  }
}

export function parsePlatformName(value: string): PlatformName | undefined {
  switch (value) {
    case 'web':
      return 'web';
    case 'windows':
      return 'windows';
    case 'macos':
      return 'macos';
    case 'linux':
      return 'linux';
    case 'ios':
      return 'ios';
    case 'android':
      return 'android';
    case 'unknown':
      return 'unknown';
    default:
      return undefined;
  }
}

export function parsePlatformRuntime(value: string): PlatformRuntime | undefined {
  switch (value) {
    case 'web':
      return 'web';
    case 'electron':
      return 'electron';
    case 'tauri':
      return 'tauri';
    case 'capacitor':
      return 'capacitor';
    case 'native':
      return 'native';
    case 'unknown':
      return 'unknown';
    default:
      return undefined;
  }
}

/**
 * One fresh snapshot read through the provider, replacing the source's module scratch object with
 * per-call local state.
 */
function readPlatformInfo(hostPlatform: Readonly<HostPlatformCapability>): PlatformInfo {
  let info = createPlatformInfo();
  hostPlatform.getInfo(info);
  return info;
}
