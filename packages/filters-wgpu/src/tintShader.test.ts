import { describe, expect, it } from 'vitest';

import { installWgpuMock, makeFilterState, makeRenderTarget } from './testHelper';
import {
  applyWgpuBlitOffsetPass,
  applyWgpuBlitPass,
  applyWgpuInnerClipPass,
  applyWgpuInvertTintPass,
  applyWgpuTintPass,
  getWgpuBlitOffsetShader,
  getWgpuBlitShader,
  getWgpuInnerClipShader,
  getWgpuInvertTintShader,
  getWgpuTintShader,
} from './tintShader';

installWgpuMock();

describe('applyWgpuBlitOffsetPass', () => {
  it('applies without error', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWgpuBlitOffsetPass(state, source, dest, 10, 5)).not.toThrow();
  });

  it('applies with negative offsets', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWgpuBlitOffsetPass(state, source, dest, -10, -5)).not.toThrow();
  });

  it('applies with zero offset (passthrough)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWgpuBlitOffsetPass(state, source, dest, 0, 0)).not.toThrow();
  });
});

describe('applyWgpuBlitPass', () => {
  it('applies without error', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWgpuBlitPass(state, source, dest)).not.toThrow();
  });
});

describe('applyWgpuInnerClipPass', () => {
  it('applies without error', async () => {
    const state = await makeFilterState();
    const glow = makeRenderTarget();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWgpuInnerClipPass(state, glow, source, dest)).not.toThrow();
  });
});

describe('applyWgpuInvertTintPass', () => {
  it('applies without error with red color', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWgpuInvertTintPass(state, source, dest, 0xff0000, 1, 1)).not.toThrow();
  });
});

describe('applyWgpuTintPass', () => {
  it('applies without error with blue color and partial alpha', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWgpuTintPass(state, source, dest, 0x0000ff, 0.5, 0.8)).not.toThrow();
  });

  it('applies with black color (shadow tint)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWgpuTintPass(state, source, dest, 0x000000, 1, 1)).not.toThrow();
  });
});

describe('getWgpuBlitOffsetShader', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getWgpuBlitOffsetShader(state);
    const p2 = getWgpuBlitOffsetShader(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});

describe('getWgpuBlitShader', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getWgpuBlitShader(state);
    const p2 = getWgpuBlitShader(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});

describe('getWgpuInnerClipShader', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getWgpuInnerClipShader(state);
    const p2 = getWgpuInnerClipShader(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});

describe('getWgpuInvertTintShader', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getWgpuInvertTintShader(state);
    const p2 = getWgpuInvertTintShader(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});

describe('getWgpuTintShader', () => {
  it('returns a pipeline lazily and caches it per state', async () => {
    const state = await makeFilterState();
    const p1 = getWgpuTintShader(state);
    const p2 = getWgpuTintShader(state);
    expect(p1).toBe(p2);
    expect(p1.pipeline).toBeDefined();
  });
});
