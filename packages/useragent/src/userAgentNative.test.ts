import { describe, expect, it } from 'vitest';

import { detectEndianness, parseUserAgentRuntime } from './contract.ts';
import { detectEndiannessNative, parseUserAgentRuntimeNative } from './userAgentNative.ts';

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

describe('parseUserAgentRuntime', () => {
  it('accepts both absent values through the public contract', () => {
    expect(parseUserAgentRuntime(undefined)).toBe('unknown');
    expect(parseUserAgentRuntime(null)).toBe('unknown');
  });
});

describe('parseUserAgentRuntimeNative', () => {
  it('follows host-global precedence and JavaScript truthiness', () => {
    expect(parseUserAgentRuntimeNative(undefined)).toBe('unknown');
    expect(parseUserAgentRuntimeNative({})).toBe('web');
    expect(parseUserAgentRuntimeNative({ __TAURI__: {}, Capacitor: {} })).toBe('tauri');
    expect(parseUserAgentRuntimeNative({ process: { versions: { electron: '28.0.0' } }, __TAURI__: {} })).toBe(
      'electron',
    );
    expect(parseUserAgentRuntimeNative({ Capacitor: 1 })).toBe('capacitor');
    expect(parseUserAgentRuntimeNative({ Capacitor: 0 })).toBe('web');
  });
});
