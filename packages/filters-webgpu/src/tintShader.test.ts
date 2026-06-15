import { describe, expect, it } from 'vitest';

import { installWebGPUMock, makeFilterState, makeRenderTarget } from './testHelper';
import {
  applyBlitOffsetPassWebGPU,
  applyBlitPassWebGPU,
  applyInnerClipPass,
  applyInvertTintPassWebGPU,
  applyTintPassWebGPU,
  getBlitOffsetShaderWebGPU,
  getBlitShaderWebGPU,
  getInnerClipShader,
  getInvertTintShaderWebGPU,
  getTintShaderWebGPU,
} from './tintShader';

installWebGPUMock();

describe('applyBlitOffsetPassWebGPU', () => {
  it('applies without error', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyBlitOffsetPassWebGPU(state, source, dest, 10, 5)).not.toThrow();
  });

  it('applies with negative offsets', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyBlitOffsetPassWebGPU(state, source, dest, -10, -5)).not.toThrow();
  });

  it('applies with zero offset (passthrough)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyBlitOffsetPassWebGPU(state, source, dest, 0, 0)).not.toThrow();
  });
});

describe('applyBlitPassWebGPU', () => {
  it('applies without error', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyBlitPassWebGPU(state, source, dest)).not.toThrow();
  });
});

describe('applyInnerClipPass', () => {
  it('applies without error', async () => {
    const state = await makeFilterState();
    const glow = makeRenderTarget();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyInnerClipPass(state, glow, source, dest)).not.toThrow();
  });
});

describe('applyInvertTintPassWebGPU', () => {
  it('applies without error with red color', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyInvertTintPassWebGPU(state, source, dest, 0xff0000, 1, 1)).not.toThrow();
  });
});

describe('applyTintPassWebGPU', () => {
  it('applies without error with blue color and partial alpha', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyTintPassWebGPU(state, source, dest, 0x0000ff, 0.5, 0.8)).not.toThrow();
  });

  it('applies with black color (shadow tint)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyTintPassWebGPU(state, source, dest, 0x000000, 1, 1)).not.toThrow();
  });
});

describe('getBlitOffsetShaderWebGPU', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getBlitOffsetShaderWebGPU(state);
    const p2 = getBlitOffsetShaderWebGPU(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});

describe('getBlitShaderWebGPU', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getBlitShaderWebGPU(state);
    const p2 = getBlitShaderWebGPU(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});

describe('getInnerClipShader', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getInnerClipShader(state);
    const p2 = getInnerClipShader(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});

describe('getInvertTintShaderWebGPU', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getInvertTintShaderWebGPU(state);
    const p2 = getInvertTintShaderWebGPU(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});

describe('getTintShaderWebGPU', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getTintShaderWebGPU(state);
    const p2 = getTintShaderWebGPU(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});
