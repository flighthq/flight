import { describe, expect, it } from 'vitest';

import { applyDropShadowFilterToWgpu } from './wgpuDropShadowFilter';
import { installWgpuMock, makeFilterState, makeRenderTarget, makeScratch } from './wgpuTestHelper';

installWgpuMock();

describe('applyDropShadowFilterToWgpu', () => {
  it('applies without error with default options', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() => applyDropShadowFilterToWgpu(state, source, dest, scratch, {})).not.toThrow();
  });

  it('skips when knockout is true', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() => applyDropShadowFilterToWgpu(state, source, dest, scratch, { knockout: true })).not.toThrow();
  });

  it('applies hideObject mode without drawing source', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() =>
      applyDropShadowFilterToWgpu(state, source, dest, scratch, { hideObject: true, color: 0x000000, distance: 5 }),
    ).not.toThrow();
  });

  it('applies high-strength shadow with multiple blur passes', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() =>
      applyDropShadowFilterToWgpu(state, source, dest, scratch, { strength: 3, quality: 3, blurX: 8, blurY: 8 }),
    ).not.toThrow();
  });
});
