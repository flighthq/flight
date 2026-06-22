import { describe, expect, it } from 'vitest';

import { applySharpenFilterToWgpu } from './wgpuSharpenFilter';
import { installWgpuMock, makeFilterState, makeRenderTarget, makeScratch } from './wgpuTestHelper';

installWgpuMock();

describe('applySharpenFilterToWgpu', () => {
  it('applies without error at default options', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(2);
    expect(() => applySharpenFilterToWgpu(state, source, dest, scratch, {})).not.toThrow();
  });

  it('applies with a custom amount', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(2);
    expect(() =>
      applySharpenFilterToWgpu(state, source, dest, scratch, { amount: 2, blurX: 1, blurY: 1 }),
    ).not.toThrow();
  });

  it('applies with quality > 1', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(2);
    expect(() => applySharpenFilterToWgpu(state, source, dest, scratch, { quality: 3 })).not.toThrow();
  });
});
