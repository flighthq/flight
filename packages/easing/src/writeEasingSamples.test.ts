// Generated from crates/flight-easing/tests/write_easing_samples_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeInCubic, easeLinear, writeEasingSamples } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('writeEasingSamples', () => {
  it('first sample is ease 0 and last is ease 1', () => {
    let result = new Float32Array(11).fill(0.0);
    writeEasingSamples(result, easeInCubic);
    assertApprox(result[0], easeInCubic(0.0));
    assertApprox(result[10], easeInCubic(1.0));
  });
  it('samples ease linear uniformly', () => {
    let result = new Float32Array(6).fill(0.0);
    writeEasingSamples(result, easeLinear);
    for (let i = 0; i < result.length; i += 1) {
      assertApprox(result[i], i / (result.length - 1.0));
    }
  });
  it('one entry samples at the midpoint', () => {
    let result = new Float32Array([99.0]);
    writeEasingSamples(result, easeInCubic);
    assertApprox(result[0], easeInCubic(0.5));
  });
  it('derives sample count from a larger output', () => {
    let out = new Float32Array(10).fill(-7.0);
    writeEasingSamples(out, easeLinear);
    assertApprox(out[4], 4.0 / 9.0);
    assertApprox(out[5], 5.0 / 9.0);
    expect(out[0]).toEqual(0.0);
    expect(out[9]).toEqual(1.0);
  });
  it('evaluates samples and endpoint callbacks in source order', () => {
    const calls = { value: new Array(5).fill(0.0) };
    const callCount = { value: 0 };
    const ease = (t: number) => {
      const index = callCount.value;
      let values = calls.value;
      values[index] = t;
      calls.value = values;
      callCount.value = index + 1;
      return t + 10.0;
    };
    let out = new Float32Array(3).fill(0.0);
    writeEasingSamples(out, ease);
    expect(Array.from(calls.value)).toEqual([0.0, 0.5, 1.0, 0.0, 1.0]);
    expect(Array.from(out)).toEqual([10.0, 10.5, 11.0]);
  });
  it('invokes midpoint callback once for one entry', () => {
    const calls = { value: 0 };
    const ease = (t: number) => {
      calls.value = calls.value + 1;
      return t;
    };
    let out = new Float32Array([-7.0]);
    writeEasingSamples(out, ease);
    expect(calls.value).toEqual(1);
    expect(Array.from(out)).toEqual([0.5]);
  });
  it('rejects empty output', () => {
    expect(() => {
      let out = new Float32Array([]);
      writeEasingSamples(out, easeLinear);
    }).toThrow();
  });
});
