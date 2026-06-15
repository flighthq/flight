import { describe, expect, it } from 'vitest';

import { installWebGPUMock, makeFilterState, makeRenderTarget } from './testHelper';
import {
  applyBlitOffsetPass,
  applyBlitPass,
  applyInnerClipPass,
  applyInvertTintPass,
  applyTintPass,
  getBlitOffsetShader,
  getBlitShader,
  getInnerClipShader,
  getInvertTintShader,
  getTintShader,
} from './tintShader';

installWebGPUMock();

describe('applyBlitOffsetPass', () => {
  it('applies without error', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyBlitOffsetPass(state, source, dest, 10, 5)).not.toThrow();
  });

  it('applies with negative offsets', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyBlitOffsetPass(state, source, dest, -10, -5)).not.toThrow();
  });

  it('applies with zero offset (passthrough)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyBlitOffsetPass(state, source, dest, 0, 0)).not.toThrow();
  });
});

describe('applyBlitPass', () => {
  it('applies without error', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyBlitPass(state, source, dest)).not.toThrow();
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

describe('applyInvertTintPass', () => {
  it('applies without error with red color', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyInvertTintPass(state, source, dest, 0xff0000, 1, 1)).not.toThrow();
  });
});

describe('applyTintPass', () => {
  it('applies without error with blue color and partial alpha', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyTintPass(state, source, dest, 0x0000ff, 0.5, 0.8)).not.toThrow();
  });

  it('applies with black color (shadow tint)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyTintPass(state, source, dest, 0x000000, 1, 1)).not.toThrow();
  });
});

describe('getBlitOffsetShader', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getBlitOffsetShader(state);
    const p2 = getBlitOffsetShader(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});

describe('getBlitShader', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getBlitShader(state);
    const p2 = getBlitShader(state);
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

describe('getInvertTintShader', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getInvertTintShader(state);
    const p2 = getInvertTintShader(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});

describe('getTintShader', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getTintShader(state);
    const p2 = getTintShader(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});
