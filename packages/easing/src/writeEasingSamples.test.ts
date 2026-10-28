import { easeInCubic } from './easeCubic.ts';
import { easeLinear } from './easeLinear.ts';
import { writeEasingSamples } from './writeEasingSamples.ts';

describe('writeEasingSamples', () => {
  it('throws for an empty output', () => {
    expect(() => writeEasingSamples(new Float32Array(0), easeLinear)).toThrow();
  });

  it('writes the first and last easing samples exactly', () => {
    const out = new Float32Array(11);
    writeEasingSamples(out, easeInCubic);
    expect(out[0]).toBeCloseTo(easeInCubic(0));
    expect(out[10]).toBeCloseTo(easeInCubic(1));
  });

  it('samples easeLinear uniformly across the output length', () => {
    const out = new Float32Array(6);
    writeEasingSamples(out, easeLinear);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBeCloseTo(i / (out.length - 1), 5);
    }
  });

  it('samples at the midpoint for a one-entry output', () => {
    const out = new Float32Array(1);
    writeEasingSamples(out, easeInCubic);
    expect(out[0]).toBeCloseTo(easeInCubic(0.5));
  });
});
