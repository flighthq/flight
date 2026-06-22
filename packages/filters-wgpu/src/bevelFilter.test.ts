import { describe, expect, it } from 'vitest';

import { applyBevelFilterToWgpu } from './bevelFilter';
import { installWgpuMock, makeFilterState, makeRenderTarget, makeScratch } from './testHelper';

installWgpuMock();

describe('applyBevelFilterToWgpu', () => {
  it('applies full bevel without error', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() => applyBevelFilterToWgpu(state, source, dest, scratch, {})).not.toThrow();
  });

  it('applies outer bevel type', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() => applyBevelFilterToWgpu(state, source, dest, scratch, { bevelType: 'outer' })).not.toThrow();
  });

  it('applies inner bevel type', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() => applyBevelFilterToWgpu(state, source, dest, scratch, { bevelType: 'inner' })).not.toThrow();
  });

  it('applies knockout mode (omits source composite)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() => applyBevelFilterToWgpu(state, source, dest, scratch, { knockout: true })).not.toThrow();
  });

  it('applies with custom shadow and highlight colors', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const scratch = makeScratch(3);
    expect(() =>
      applyBevelFilterToWgpu(state, source, dest, scratch, {
        shadowColor: 0x000000,
        highlightColor: 0xffffff,
        shadowAlpha: 0.8,
        highlightAlpha: 0.8,
        distance: 6,
        angle: 45,
      }),
    ).not.toThrow();
  });
});
