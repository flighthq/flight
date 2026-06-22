import { describe, expect, it } from 'vitest';

import { applyGradientBevelFilterToWgpu } from './gradientBevelFilter';
import { installWgpuMock, makeFilterState, makeRenderTarget, makeScratch } from './testHelper';

installWgpuMock();

const RAMP = {
  colors: [0x000000, 0xffffff],
  alphas: [1, 1],
  ratios: [0, 255],
};

describe('applyGradientBevelFilterToWgpu', () => {
  it('applies without error with a two-stop gradient', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() => applyGradientBevelFilterToWgpu(state, source, dest, scratch, { ...RAMP })).not.toThrow();
  });

  it('applies with inner bevel type', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() =>
      applyGradientBevelFilterToWgpu(state, source, dest, scratch, { ...RAMP, bevelType: 'inner' }),
    ).not.toThrow();
  });

  it('applies with quality > 1', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() =>
      applyGradientBevelFilterToWgpu(state, source, dest, scratch, { ...RAMP, quality: 2, distance: 8 }),
    ).not.toThrow();
  });
});
