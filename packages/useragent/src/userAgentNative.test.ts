import { describe, expect, it } from 'vitest';

import { detectEndianness, parseUserAgentRuntime } from './contract.ts';
import { detectEndiannessNative, parseUserAgentRuntimeNative } from './userAgentNative.ts';
import { isTruthy } from './userAgentTruthy.ts';

describe('detectEndianness', () => {
  it('exposes the native byte-order probe through the public contract', () => {
    expect(['big', 'little', 'unknown']).toContain(detectEndianness());
  });
});

describe('detectEndiannessNative', () => {
  it('returns the byte order observed through typed-array views', () => {
    expect(['big', 'little', 'unknown']).toContain(detectEndiannessNative());
  });
});

describe('isTruthy', () => {
  it('returns canonical booleans for absent and falsy primitive values', () => {
    for (const value of [undefined, null, false, '', 0, -0, Number.NaN]) {
      expect(isTruthy(value)).toBe(false);
    }
  });

  it('returns canonical booleans for truthy primitive and object values', () => {
    for (const value of [true, 'value', 1, -1, {}, []]) {
      expect(isTruthy(value)).toBe(true);
    }
  });
});

describe('parseUserAgentRuntime', () => {
  it('accepts an omitted or explicit undefined window through the public contract', () => {
    expect(parseUserAgentRuntime()).toBe('unknown');
    expect(parseUserAgentRuntime(undefined)).toBe('unknown');
  });

  it('accepts a window-like object through the public contract', () => {
    expect(parseUserAgentRuntime({})).toBe('web');
  });
});

describe('parseUserAgentRuntimeNative', () => {
  it('follows host-global precedence and JavaScript truthiness', () => {
    expect(parseUserAgentRuntimeNative(undefined)).toBe('unknown');
    expect(parseUserAgentRuntimeNative(null)).toBe('unknown');
    expect(parseUserAgentRuntimeNative({})).toBe('web');
    expect(parseUserAgentRuntimeNative({ __TAURI__: {}, Capacitor: {} })).toBe('tauri');
    expect(parseUserAgentRuntimeNative({ process: { versions: { electron: '28.0.0' } }, __TAURI__: {} })).toBe(
      'electron',
    );
    expect(parseUserAgentRuntimeNative({ Capacitor: 1 })).toBe('capacitor');
    expect(parseUserAgentRuntimeNative({ Capacitor: 0 })).toBe('web');
  });
});
