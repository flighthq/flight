import { describe, expect, it } from 'vitest';

import { applyDisplacementMapFilterToWebGPU } from './displacementMapFilter';
import { installWebGPUMock, makeFilterState, makeRenderTarget } from './testHelper';

installWebGPUMock();

describe('applyDisplacementMapFilterToWebGPU', () => {
  it('applies without error with default options', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const map = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyDisplacementMapFilterToWebGPU(state, source, map, dest, {})).not.toThrow();
  });

  it('accepts all edge modes', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const map = makeRenderTarget();
    const dest = makeRenderTarget();
    for (const mode of ['wrap', 'clamp', 'ignore', 'color'] as const) {
      expect(() =>
        applyDisplacementMapFilterToWebGPU(state, source, map, dest, { mode, scaleX: 10, scaleY: 10 }),
      ).not.toThrow();
    }
  });

  it('accepts all channel selectors', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const map = makeRenderTarget();
    const dest = makeRenderTarget();
    for (let ch = 0; ch < 4; ch++) {
      expect(() =>
        applyDisplacementMapFilterToWebGPU(state, source, map, dest, { componentX: ch, componentY: ch }),
      ).not.toThrow();
    }
  });
});
