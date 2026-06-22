import { describe, expect, it } from 'vitest';

import { applyInnerShadowFilterToWgpu } from './wgpuInnerShadowFilter';
import { installWgpuMock, makeFilterState, makeRenderTarget, makeScratch } from './wgpuTestHelper';

installWgpuMock();

describe('applyInnerShadowFilterToWgpu', () => {
  it('applies without error with default options', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() => applyInnerShadowFilterToWgpu(state, source, dest, scratch, {})).not.toThrow();
  });

  it('applies with angle and distance', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() =>
      applyInnerShadowFilterToWgpu(state, source, dest, scratch, { angle: 135, distance: 8, color: 0x000000 }),
    ).not.toThrow();
  });

  it('applies with quality > 1', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() =>
      applyInnerShadowFilterToWgpu(state, source, dest, scratch, { quality: 3, blurX: 6, blurY: 6 }),
    ).not.toThrow();
  });
});
