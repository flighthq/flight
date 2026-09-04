import type { RenderTexture } from '@flighthq/types/contract';

import { createRenderTexture, initializeRenderTextureTarget } from './renderTexture';
import { createSampler } from './sampler';

describe('createRenderTexture', () => {
  it('creates a linear render target with identity UVs and no depth by default', () => {
    const texture = createRenderTexture({ height: 32, width: 64 });

    expectTypeOf(texture).toEqualTypeOf<RenderTexture>();
    expect(texture).toMatchObject({
      colorSpace: 'linear',
      flipX: false,
      flipY: false,
      dimension: '2d',
      source: { colorSpace: 'linear', height: 32, width: 64 },
      uvOffset: { x: 0, y: 0 },
      uvRotation: 0,
      uvScale: { x: 1, y: 1 },
      version: 0,
    });
  });

  it('applies sampling, depth, color-space, and uv overrides without aliasing mutable values', () => {
    const sampler = createSampler({ magFilter: 'nearest' });
    const uvOffset = { x: 0.25, y: 0.5 };
    const texture = createRenderTexture({
      colorSpace: 'srgb',
      depth: 'depth-stencil',
      flipY: false,
      height: 16,
      sampler,
      uvOffset,
      width: 8,
    });

    expect(texture.colorSpace).toBe('srgb');
    expect(texture.source.depth).toBe('depth-stencil');
    expect(texture.flipY).toBe(false);
    expect(texture.sampler.magFilter).toBe('nearest');
    expect(texture.sampler).not.toBe(sampler);
    expect(texture.uvOffset).toMatchObject(uvOffset);
    expect(texture.uvOffset).not.toBe(uvOffset);
  });
});
describe('initializeRenderTextureTarget', () => {
  it('is the construction initializer of createRenderTextureTarget', () => {
    expect(typeof initializeRenderTextureTarget).toBe('function');
  });
});
