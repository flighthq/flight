import { computeDepthOfFieldCoc, computeLinearDepthFromNonlinear, computeSsaoSampleKernel } from './depthMath';

describe('computeDepthOfFieldCoc', () => {
  it('returns 0 when depth equals focusDistance', () => {
    expect(computeDepthOfFieldCoc(5, 5, 1.8, 50)).toBeCloseTo(0, 4);
  });
  it('behind-focus depth returns positive CoC', () => {
    expect(computeDepthOfFieldCoc(10, 5, 1.8, 50)).toBeGreaterThan(0);
  });
  it('in-front-of-focus depth returns negative CoC', () => {
    expect(computeDepthOfFieldCoc(2, 5, 1.8, 50)).toBeLessThan(0);
  });
  it('larger aperture increases CoC magnitude', () => {
    const coc14 = Math.abs(computeDepthOfFieldCoc(10, 5, 1.4, 50));
    const coc8 = Math.abs(computeDepthOfFieldCoc(10, 5, 8, 50));
    expect(coc14).toBeGreaterThan(coc8);
  });
});

describe('computeLinearDepthFromNonlinear', () => {
  it('depth=0 returns near plane', () => {
    expect(computeLinearDepthFromNonlinear(0, 0.1, 1000)).toBeCloseTo(0.1, 3);
  });
  it('depth=1 returns far plane', () => {
    expect(computeLinearDepthFromNonlinear(1, 0.1, 1000)).toBeCloseTo(1000, 0);
  });
  it('depth=0.5 returns a value between near and far', () => {
    const linear = computeLinearDepthFromNonlinear(0.5, 0.1, 100);
    expect(linear).toBeGreaterThan(0.1);
    expect(linear).toBeLessThan(100);
  });
  it('uses the standard hyperbolic depth formula', () => {
    // near=1, far=10, depth=0 → result == (1*10)/(10-0) = 1
    expect(computeLinearDepthFromNonlinear(0, 1, 10)).toBeCloseTo(1, 5);
  });
});

describe('computeSsaoSampleKernel', () => {
  it('returns the requested sample count', () => {
    const out = new Float32Array(16 * 3);
    const count = computeSsaoSampleKernel(16, out);
    expect(count).toBe(16);
  });
  it('all Z components are non-negative (hemisphere along +Z)', () => {
    const out = new Float32Array(16 * 3);
    const count = computeSsaoSampleKernel(16, out);
    for (let i = 0; i < count; i++) {
      expect(out[i * 3 + 2]).toBeGreaterThanOrEqual(0);
    }
  });
  it('all samples are within the unit sphere', () => {
    const out = new Float32Array(16 * 3);
    const count = computeSsaoSampleKernel(16, out);
    for (let i = 0; i < count; i++) {
      const x = out[i * 3 + 0];
      const y = out[i * 3 + 1];
      const z = out[i * 3 + 2];
      const len = Math.sqrt(x * x + y * y + z * z);
      expect(len).toBeLessThanOrEqual(1 + 1e-6);
    }
  });
  it('is deterministic (same output on repeated calls)', () => {
    const out1 = new Float32Array(8 * 3);
    const out2 = new Float32Array(8 * 3);
    computeSsaoSampleKernel(8, out1);
    computeSsaoSampleKernel(8, out2);
    for (let i = 0; i < out1.length; i++) {
      expect(out1[i]).toBeCloseTo(out2[i], 5);
    }
  });
});
