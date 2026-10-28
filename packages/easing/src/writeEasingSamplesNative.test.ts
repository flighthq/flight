import { easeLinear } from './easeLinear.ts';
import { writeEasingSamples } from './writeEasingSamples.ts';

describe('writeEasingSamples native semantics', () => {
  it('fills the caller-owned typed array without replacing its storage', () => {
    const out = new Float32Array(5).fill(-7);
    const storage = out.buffer;
    writeEasingSamples(out, easeLinear);
    expect(out.buffer).toBe(storage);
    expect(out).toEqual(new Float32Array([0, 0.25, 0.5, 0.75, 1]));
  });

  it('rejects an empty output before invoking the callback', () => {
    const ease = vi.fn((t: number) => t);
    const out = new Float32Array(0);
    expect(() => writeEasingSamples(out, ease)).toThrow();
    expect(ease).not.toHaveBeenCalled();
    expect(out).toHaveLength(0);
  });
});
