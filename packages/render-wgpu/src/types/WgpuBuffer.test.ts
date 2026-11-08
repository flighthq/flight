import { describe, expect, it } from 'vitest';

import { WgpuBufferUsage, WgpuMapMode } from './WgpuBuffer.ts';

describe('WgpuBufferUsage', () => {
  it('carries the WGPU buffer usage bits', () => {
    expect(WgpuBufferUsage).toEqual({
      COPY_DST: 8,
      COPY_SRC: 4,
      INDEX: 16,
      INDIRECT: 256,
      MAP_READ: 1,
      MAP_WRITE: 2,
      QUERY_RESOLVE: 512,
      STORAGE: 128,
      UNIFORM: 64,
      VERTEX: 32,
    });
  });
});

describe('WgpuMapMode', () => {
  it('carries the WGPU map mode bits', () => {
    expect(WgpuMapMode).toEqual({ READ: 1, WRITE: 2 });
  });
});
