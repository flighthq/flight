import { describe, expect, it } from 'vitest';

import { applyGradientGlowFilterToWgpu } from './wgpuGradientGlowFilter';
import { installWgpuMock, makeFilterState, makeRenderTarget, makeScratch } from './wgpuTestHelper';

installWgpuMock();

const RAMP = {
  colors: [0xff0000, 0x0000ff],
  alphas: [0, 1],
  ratios: [0, 255],
};

describe('applyGradientGlowFilterToWgpu', () => {
  it('applies without error with a two-stop gradient', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() => applyGradientGlowFilterToWgpu(state, source, dest, scratch, { ...RAMP })).not.toThrow();
  });

  it('applies with quality > 1', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() =>
      applyGradientGlowFilterToWgpu(state, source, dest, scratch, { ...RAMP, quality: 2, blurX: 8 }),
    ).not.toThrow();
  });

  it('applies with strength < 1 (partial tint)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() => applyGradientGlowFilterToWgpu(state, source, dest, scratch, { ...RAMP, strength: 0.5 })).not.toThrow();
  });
});
