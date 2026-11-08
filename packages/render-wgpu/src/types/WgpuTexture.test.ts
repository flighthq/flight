import { describe, expect, it } from 'vitest';

import { WgpuTextureUsage } from './WgpuTexture.ts';

describe('WgpuTextureUsage', () => {
  it('carries the WGPU texture usage bits', () => {
    expect(WgpuTextureUsage).toEqual({
      COPY_DST: 2,
      COPY_SRC: 1,
      RENDER_ATTACHMENT: 16,
      STORAGE_BINDING: 8,
      TEXTURE_BINDING: 4,
    });
  });
});
