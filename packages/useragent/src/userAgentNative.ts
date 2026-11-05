// Generated from crates/flight-useragent/src/user_agent_native.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { isTruthy } from './userAgentTruthy.ts';

type PlatformEndianness = 'big' | 'little' | 'unknown';

type PlatformEngine = 'gecko' | 'blink' | 'webkit' | 'unknown';

type PlatformKind = 'desktop' | 'mobile' | 'web' | 'unknown';

type PlatformName = 'web' | 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'unknown';

type PlatformRuntime = 'web' | 'electron' | 'tauri' | 'capacitor' | 'native' | 'unknown';

type Unknown = unknown;

type UserAgentRuntimeWindow = Readonly<Record<string, Unknown>> | undefined;

function detectEndiannessNative(): PlatformEndianness {
  const bytes = new Uint8Array(new Uint16Array([0x0102]).buffer);
  if (bytes[0] === 0x01) {
    return 'big';
  }
  if (bytes[0] === 0x02) {
    return 'little';
  }
  return 'unknown';
}

function getProperty(value: Unknown | undefined, key: string): Unknown | undefined {
  const __try0 = value;
  if (__try0 === undefined) {
    return undefined;
  }
  const value_1 = __try0;
  if (value_1 === undefined) {
    return undefined;
  }
  const record = value_1 as Record<string, Unknown>;
  if (record === undefined) {
    return undefined;
  }
  return record[key];
}

function parseUserAgentRuntimeNative(win: UserAgentRuntimeWindow): PlatformRuntime {
  if (win === undefined) {
    return 'unknown';
  }
  const versions = getProperty(win['process'], 'versions');
  if (isTruthy(versions) && isTruthy(getProperty(versions, 'electron'))) {
    return 'electron';
  }
  if (isTruthy(win['__TAURI__'])) {
    return 'tauri';
  }
  if (isTruthy(win['Capacitor'])) {
    return 'capacitor';
  }
  return 'web';
}

export type { PlatformEndianness, PlatformEngine, PlatformKind, PlatformName, PlatformRuntime, Unknown };

export { detectEndiannessNative, parseUserAgentRuntimeNative };
