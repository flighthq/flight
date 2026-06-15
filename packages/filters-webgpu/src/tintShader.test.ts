import { describe, expect, it } from 'vitest';

import { installWebGPUMock, makeFilterState, makeRenderTarget } from './testHelper';
import {
  applyWebGPUBlitOffsetPass,
  applyWebGPUBlitPass,
  applyWebGPUInnerClipPass,
  applyWebGPUInvertTintPass,
  applyWebGPUTintPass,
  getWebGPUBlitOffsetShader,
  getWebGPUBlitShader,
  getWebGPUInnerClipShader,
  getWebGPUInvertTintShader,
  getWebGPUTintShader,
} from './tintShader';

installWebGPUMock();

describe('applyWebGPUBlitOffsetPass', () => {
  it('applies without error', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWebGPUBlitOffsetPass(state, source, dest, 10, 5)).not.toThrow();
  });

  it('applies with negative offsets', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWebGPUBlitOffsetPass(state, source, dest, -10, -5)).not.toThrow();
  });

  it('applies with zero offset (passthrough)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWebGPUBlitOffsetPass(state, source, dest, 0, 0)).not.toThrow();
  });
});

describe('applyWebGPUBlitPass', () => {
  it('applies without error', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWebGPUBlitPass(state, source, dest)).not.toThrow();
  });
});

describe('applyWebGPUInnerClipPass', () => {
  it('applies without error', async () => {
    const state = await makeFilterState();
    const glow = makeRenderTarget();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWebGPUInnerClipPass(state, glow, source, dest)).not.toThrow();
  });
});

describe('applyWebGPUInvertTintPass', () => {
  it('applies without error with red color', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWebGPUInvertTintPass(state, source, dest, 0xff0000, 1, 1)).not.toThrow();
  });
});

describe('applyWebGPUTintPass', () => {
  it('applies without error with blue color and partial alpha', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWebGPUTintPass(state, source, dest, 0x0000ff, 0.5, 0.8)).not.toThrow();
  });

  it('applies with black color (shadow tint)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWebGPUTintPass(state, source, dest, 0x000000, 1, 1)).not.toThrow();
  });
});

describe('getWebGPUBlitOffsetShader', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getWebGPUBlitOffsetShader(state);
    const p2 = getWebGPUBlitOffsetShader(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});

describe('getWebGPUBlitShader', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getWebGPUBlitShader(state);
    const p2 = getWebGPUBlitShader(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});

describe('getWebGPUInnerClipShader', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getWebGPUInnerClipShader(state);
    const p2 = getWebGPUInnerClipShader(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});

describe('getWebGPUInvertTintShader', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getWebGPUInvertTintShader(state);
    const p2 = getWebGPUInvertTintShader(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});

describe('getWebGPUTintShader', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getWebGPUTintShader(state);
    const p2 = getWebGPUTintShader(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});
