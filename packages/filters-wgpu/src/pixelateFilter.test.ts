import { describe, expect, it } from 'vitest';

import { applyPixelateFilterToWgpu } from './pixelateFilter';
import { installWgpuMock, makeFilterState, makeRenderTarget } from './testHelper';

installWgpuMock();

describe('applyPixelateFilterToWgpu', () => {
  it('applies without error at default block size', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyPixelateFilterToWgpu(state, source, dest, {})).not.toThrow();
  });

  it('applies at block size 1 (passthrough)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyPixelateFilterToWgpu(state, source, dest, { blockSize: 1 })).not.toThrow();
  });

  it('applies at a large block size', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyPixelateFilterToWgpu(state, source, dest, { blockSize: 32 })).not.toThrow();
  });
});
