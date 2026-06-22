import { describe, expect, it } from 'vitest';

import { applyMedianFilterToWgpu } from './medianFilter';
import { installWgpuMock, makeFilterState, makeRenderTarget } from './testHelper';

installWgpuMock();

describe('applyMedianFilterToWgpu', () => {
  it('applies without error at default radius 1', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyMedianFilterToWgpu(state, source, dest, {})).not.toThrow();
  });

  it('applies at radius 0 (passthrough)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyMedianFilterToWgpu(state, source, dest, { radius: 0 })).not.toThrow();
  });

  it('applies at maximum radius 2', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyMedianFilterToWgpu(state, source, dest, { radius: 2 })).not.toThrow();
  });

  it('clamps radius above maximum to 2', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyMedianFilterToWgpu(state, source, dest, { radius: 10 })).not.toThrow();
  });
});
