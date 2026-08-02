import { describe, expect, it } from 'vitest';

import { WGPU_MESH_FRAGMENT_TAIL } from './wgpuMeshFragmentTail';

describe('WGPU_MESH_FRAGMENT_TAIL', () => {
  it('declares the premultiply helper the preludes return through', () => {
    expect(WGPU_MESH_FRAGMENT_TAIL).toContain('fn flightPremultipliedOutput(color : vec4f) -> vec4f');
  });

  it('scales rgb by alpha and leaves alpha itself unchanged', () => {
    expect(WGPU_MESH_FRAGMENT_TAIL).toContain('vec4f(color.rgb * color.a, color.a)');
  });
});
