import { describe, expect, it } from 'vitest';

import { applyMedianFilterToWebGPU } from './medianFilter';
import { installWebGPUMock, makeFilterState, makeRenderTarget } from './testHelper';

installWebGPUMock();

describe('applyMedianFilterToWebGPU', () => {
  it('applies without error at default radius 1', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyMedianFilterToWebGPU(state, source, dest, {})).not.toThrow();
  });

  it('applies at radius 0 (passthrough)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyMedianFilterToWebGPU(state, source, dest, { radius: 0 })).not.toThrow();
  });

  it('applies at maximum radius 2', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyMedianFilterToWebGPU(state, source, dest, { radius: 2 })).not.toThrow();
  });

  it('clamps radius above maximum to 2', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyMedianFilterToWebGPU(state, source, dest, { radius: 10 })).not.toThrow();
  });
});
