import { describe, expect, it } from 'vitest';

import { applyOuterGlowFilterToWgpu } from './outerGlowFilter';
import { installWgpuMock, makeFilterState, makeRenderTarget, makeScratch } from './testHelper';

installWgpuMock();

describe('applyOuterGlowFilterToWgpu', () => {
  it('applies without error with default options', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() => applyOuterGlowFilterToWgpu(state, source, dest, scratch, {})).not.toThrow();
  });

  it('applies knockout mode (omits source composite)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() => applyOuterGlowFilterToWgpu(state, source, dest, scratch, { knockout: true })).not.toThrow();
  });

  it('applies high-strength glow with multiple passes', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() =>
      applyOuterGlowFilterToWgpu(state, source, dest, scratch, { strength: 4, blurX: 12, blurY: 12 }),
    ).not.toThrow();
  });
});
