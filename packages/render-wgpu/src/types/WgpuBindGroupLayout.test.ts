import { describe, expect, it } from 'vitest';

import { WgpuShaderStage } from './WgpuBindGroupLayout.ts';

describe('WgpuShaderStage', () => {
  it('carries the WGPU shader stage bits', () => {
    expect(WgpuShaderStage).toEqual({ COMPUTE: 4, FRAGMENT: 2, VERTEX: 1 });
  });
});
