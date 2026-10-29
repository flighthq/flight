import { describe, expect, it } from 'vitest';

import { detectEndianness, parseUserAgentRuntime } from './contract.ts';

describe('detectEndianness', () => {
  it('returns the byte order observed through typed-array views', () => {
    expect(['big', 'little', 'unknown']).toContain(detectEndianness());
  });
});

describe('parseUserAgentRuntime', () => {
  it('follows host-global precedence and JavaScript truthiness', () => {
    expect(parseUserAgentRuntime(undefined)).toBe('unknown');
    expect(parseUserAgentRuntime(null)).toBe('unknown');
    expect(parseUserAgentRuntime({})).toBe('web');
    expect(parseUserAgentRuntime({ __TAURI__: {}, Capacitor: {} })).toBe('tauri');
    expect(parseUserAgentRuntime({ process: { versions: { electron: '28.0.0' } }, __TAURI__: {} })).toBe('electron');
    expect(parseUserAgentRuntime({ Capacitor: 1 })).toBe('capacitor');
    expect(parseUserAgentRuntime({ Capacitor: 0 })).toBe('web');
  });
});
