import { createEntity } from '@flighthq/entity/contract';
import { cloneVector2, createVector2 } from '@flighthq/geometry/contract';
import type { RenderTexture, RenderTextureOptions } from '@flighthq/types/contract';

import { cloneSampler, createSampler } from './sampler';

// Creates the backend-neutral identity for a render target. The GL backing is allocated lazily by
// renderIntoGlRenderTexture, so constructing one has no GPU or DOM side effects. flipY defaults true:
// GL framebuffer textures use a bottom-left origin, while material UVs expect the image-oriented
// top-left convention used by Texture and VideoTexture.
export function createRenderTexture(options: Readonly<RenderTextureOptions>): RenderTexture {
  return createEntity({
    colorSpace: options.colorSpace ?? 'linear',
    depth: options.depth ?? false,
    flipX: options.flipX ?? false,
    flipY: options.flipY ?? true,
    height: options.height,
    sampler: options.sampler ? cloneSampler(options.sampler) : createSampler(),
    uvOffset: options.uvOffset ? cloneVector2(options.uvOffset) : createVector2(0, 0),
    uvRotation: options.uvRotation ?? 0,
    uvScale: options.uvScale ? cloneVector2(options.uvScale) : createVector2(1, 1),
    width: options.width,
  });
}
