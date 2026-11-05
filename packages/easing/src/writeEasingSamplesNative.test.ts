// Generated from crates/flight-easing/tests/write_easing_samples_native_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeLinear, writeEasingSamples } from './contract.ts';

describe('writeEasingSamplesNative', () => {
  it('writes entire required output without replacing storage', () => {
    let out = new Float32Array(5).fill(-7);
    const storage = out;
    writeEasingSamples(out, easeLinear);
    expect(out).toBe(storage);
    expect(out.length).toEqual(5);
    expect(Array.from(out)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
  it('rejects empty output before invoking callback', () => {
    const calls = { value: 0 };
    const ease = (t: number) => {
      calls.value = calls.value + 1;
      return t;
    };
    let out = new Float32Array([]);
    expect(() => {
      writeEasingSamples(out, ease);
    }).toThrow(new Error('createEasingSamples: count must be a finite integer >= 1'));
    expect(calls.value).toEqual(0);
    expect(out.length === 0).toBe(true);
  });
});
