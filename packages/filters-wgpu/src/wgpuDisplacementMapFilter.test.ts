import { describe, expect, it } from 'vitest';

import { applyDisplacementMapFilterToWgpu } from './wgpuDisplacementMapFilter';
import { installWgpuMock, makeFilterState, makeRenderTarget } from './wgpuTestHelper';

installWgpuMock();

describe('applyDisplacementMapFilterToWgpu', () => {
  it('applies without error with default options', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const map = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyDisplacementMapFilterToWgpu(state, source, map, dest, {})).not.toThrow();
  });

  it('accepts all edge modes', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const map = makeRenderTarget();
    const dest = makeRenderTarget();
    for (const mode of ['wrap', 'clamp', 'ignore', 'color'] as const) {
      expect(() =>
        applyDisplacementMapFilterToWgpu(state, source, map, dest, { mode, scaleX: 10, scaleY: 10 }),
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
        applyDisplacementMapFilterToWgpu(state, source, map, dest, { componentX: ch, componentY: ch }),
      ).not.toThrow();
    }
  });
});
