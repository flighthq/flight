import type { CreateRenderTextureOptions, Texture } from '@flighthq/types/contract';

import { copySampler } from './sampler';
import { createTexture } from './texture';

// Creates a universal Texture with a GPU-origin produced backing. Backend allocation stays lazy;
// renderIntoGlRenderTexture realizes the target in one state and resolveGlTexture later returns its
// color attachment without a CPU upload.
export function createRenderTexture(options: Readonly<CreateRenderTextureOptions>): Texture {
  const colorSpace = options.colorSpace ?? 'linear';
  const texture = createTexture({
    colorSpace: options.colorSpace ?? 'linear',
    flipX: options.flipX ?? false,
    flipY: options.flipY ?? false,
    storage: {
      dimension: '2d',
      image: null,
      target: {
        colorAttachments: options.colorAttachments,
        colorFormats: options.colorFormats,
        colorSpace,
        clearColors: options.clearColors,
        clearDepth: options.clearDepth,
        depth: options.depth,
        format: options.format,
        height: options.height,
        sampleCount: options.sampleCount,
        width: options.width,
      },
    },
    uvRotation: options.uvRotation,
  });
  if (options.sampler !== undefined) copySampler(texture.sampler, options.sampler);
  if (options.uvOffset !== undefined) {
    texture.uvOffset.x = options.uvOffset.x;
    texture.uvOffset.y = options.uvOffset.y;
  }
  if (options.uvScale !== undefined) {
    texture.uvScale.x = options.uvScale.x;
    texture.uvScale.y = options.uvScale.y;
  }
  return texture;
}
