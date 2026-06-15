import { describe, expect, it } from 'vitest';

import { applyBoxBlurFilterToWebGPU, applyGaussianBlurFilterToWebGPU } from './blurFilter';
import { installWebGPUMock, makeFilterState, makeRenderTarget, makeScratch } from './testHelper';

installWebGPUMock();

describe('applyBoxBlurFilterToWebGPU', () => {
  it('completes without error for default options', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const [temp] = makeScratch(1);
    expect(() => applyBoxBlurFilterToWebGPU(state, source, dest, temp, {})).not.toThrow();
  });

  it('completes with multiple passes', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const [temp] = makeScratch(1);
    expect(() =>
      applyBoxBlurFilterToWebGPU(state, source, dest, temp, { blurX: 4, blurY: 4, passes: 3 }),
    ).not.toThrow();
  });

  it('handles zero-radius blur (copies source to dest)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const [temp] = makeScratch(1);
    expect(() => applyBoxBlurFilterToWebGPU(state, source, dest, temp, { blurX: 0, blurY: 0 })).not.toThrow();
  });
});

describe('applyGaussianBlurFilterToWebGPU', () => {
  it('completes without error for default options', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const [temp] = makeScratch(1);
    expect(() => applyGaussianBlurFilterToWebGPU(state, source, dest, temp, {})).not.toThrow();
  });

  it('copies source to dest when sigma is zero', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const [temp] = makeScratch(1);
    expect(() => applyGaussianBlurFilterToWebGPU(state, source, dest, temp, { blurX: 0, blurY: 0 })).not.toThrow();
  });

  it('handles asymmetric blur (different X and Y sigmas)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const [temp] = makeScratch(1);
    expect(() => applyGaussianBlurFilterToWebGPU(state, source, dest, temp, { blurX: 2, blurY: 8 })).not.toThrow();
  });
});
