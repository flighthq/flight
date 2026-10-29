import { describe, expect, it } from 'vitest';

import { detectEndianness, parseUserAgentRuntime } from './contract.ts';

describe('detectEndianness', () => {
  it('exposes the native byte-order probe through the public contract', () => {
    expect(['big', 'little', 'unknown']).toContain(detectEndianness());
  });
});

describe('parseUserAgentRuntime', () => {
  it('accepts both absent values through the public contract', () => {
    expect(parseUserAgentRuntime(undefined)).toBe('unknown');
    expect(parseUserAgentRuntime(null)).toBe('unknown');
  });
});
