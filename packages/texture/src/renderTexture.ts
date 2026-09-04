import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CreateRenderTextureOptions, RenderTarget, RenderTexture } from '@flighthq/types/contract';
import { RenderTargetTextureSourceKind } from '@flighthq/types/contract';

import { copySampler } from './sampler';
import { createTexture } from './texture';

// Creates a universal Texture with a GPU-origin render-target source. Backend allocation stays lazy;
// renderIntoGlRenderTexture realizes the target in one state and resolveGlTexture later returns its
// color attachment without a CPU upload.
export function createRenderTexture(options: Readonly<CreateRenderTextureOptions>): RenderTexture {
  const colorSpace = options.colorSpace ?? 'linear';
  const texture = createTexture({
    colorSpace: options.colorSpace ?? 'linear',
    flipX: options.flipX ?? false,
    flipY: options.flipY ?? false,
    dimension: '2d',
    source: (() => {
      const out = allocateEntity<RenderTarget>();
      out.colorAttachments = options.colorAttachments;
      out.colorFormats = options.colorFormats;
      out.colorSpace = colorSpace;
      out.clearColors = options.clearColors;
      out.clearDepth = options.clearDepth;
      out.depth = options.depth;
      out.format = options.format;
      out.height = options.height;
      out.kind = RenderTargetTextureSourceKind;
      out.sampleCount = options.sampleCount;
      out.version = 0;
      out.width = options.width;
      return finishEntity(out) as RenderTarget;
    })(),
    uvRotation: options.uvRotation,
  }) as RenderTexture;
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
