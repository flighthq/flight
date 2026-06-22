import { describe, expect, it } from 'vitest';

import {
  applyWgpuBlitOffsetPass,
  applyWgpuBlitPass,
  getWgpuBlitOffsetShader,
  getWgpuBlitShader,
} from './wgpuBlitShader';
import { installWgpuMock, makeFilterState, makeRenderTarget } from './wgpuTestHelper';

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
