import { createEntity } from '@flighthq/entity/contract';
import { cloneSampler, createTexture } from '@flighthq/texture/contract';
import type { CreateExternalTextureOptions, GlRenderState, Texture, TextureLike } from '@flighthq/types/contract';
import { ExternalTextureSourceKind } from '@flighthq/types/contract';

import { applyGlSamplerState } from './glDraw';
import { getGlRenderStateRuntime } from './glRenderState';
import { registerGlTextureResolver } from './glTextureResolver';

export function createExternalGlTexture(
  state: GlRenderState,
  handle: WebGLTexture,
  options: Readonly<CreateExternalTextureOptions>,
): Texture {
  const texture = createTexture({
    colorSpace: options.colorSpace,
    sampler: options.sampler ? cloneSampler(options.sampler) : undefined,
    storage: {
      dimension: '2d',
      image: null,
      target: createEntity({
        colorAttachments: 1,
        depth: 'none' as const,
        format: 'rgba8' as const,
        height: options.height,
        kind: ExternalTextureSourceKind,
        sampleCount: 1,
        version: 0,
        width: options.width,
      }),
    },
  });
  const runtime = getGlRenderStateRuntime(state);
  (runtime.glExternalTextureCache ??= new WeakMap()).set(texture, handle);
  registerGlTextureResolver(state, ExternalTextureSourceKind, resolveExternalGlTexture);
  return texture;
}

export function disposeExternalGlTexture(state: GlRenderState, texture: Readonly<Texture>): boolean {
  return getGlRenderStateRuntime(state).glExternalTextureCache?.delete(texture as Texture) ?? false;
}

function resolveExternalGlTexture(state: GlRenderState, texture: Readonly<TextureLike>): WebGLTexture | null {
  const runtime = getGlRenderStateRuntime(state);
  const handle = runtime.glExternalTextureCache?.get(texture as Texture);
  if (handle === undefined) return null;
  state.gl.bindTexture(state.gl.TEXTURE_2D, handle);
  applyGlSamplerState(state, runtime, handle, texture.sampler);
  return handle;
}
