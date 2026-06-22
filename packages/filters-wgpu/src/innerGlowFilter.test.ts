import { describe, expect, it } from 'vitest';

import { applyInnerGlowFilterToWgpu } from './innerGlowFilter';
import { installWgpuMock, makeFilterState, makeRenderTarget, makeScratch } from './testHelper';

installWgpuMock();

describe('applyInnerGlowFilterToWgpu', () => {
  it('applies without error with default options', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() => applyInnerGlowFilterToWgpu(state, source, dest, scratch, {})).not.toThrow();
  });

  it('applies with a custom color and strength', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() =>
      applyInnerGlowFilterToWgpu(state, source, dest, scratch, {
        color: 0x00ff00,
        alpha: 0.8,
        strength: 2,
        blurX: 4,
        blurY: 4,
      }),
    ).not.toThrow();
  });

  it('applies with quality > 1', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() => applyInnerGlowFilterToWgpu(state, source, dest, scratch, { quality: 2 })).not.toThrow();
  });
});
