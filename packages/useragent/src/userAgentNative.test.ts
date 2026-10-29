import { describe, expect, it } from 'vitest';

import { detectEndiannessNative, parseUserAgentRuntimeNative } from './userAgentNative.ts';

describe('detectEndiannessNative', () => {
  it('returns the byte order observed through typed-array views', () => {
    expect(['big', 'little', 'unknown']).toContain(detectEndiannessNative());
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
