import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { cloneSampler, createTexture } from '@flighthq/texture/contract';
import type {
  CreateExternalTextureOptions,
  EntityConstruction,
  ExternalTexture,
  GlRenderState,
  GlTextureRealization,
  Texture,
  TextureLike,
} from '@flighthq/types/contract';
import { ExternalTextureSourceKind } from '@flighthq/types/contract';

import { applyGlSamplerState, bindGlTextureRealization } from './glDraw';
import { getGlRenderStateRuntime } from './glRenderState';
import { registerGlTextureResolver } from './glTextureResolver';

export function createExternalGlTexture(
  state: GlRenderState,
  handle: WebGLTexture,
  options: Readonly<CreateExternalTextureOptions>,
): Texture {
  const source = allocateEntity<ExternalTexture>();
  source.height = options.height;
  source.kind = ExternalTextureSourceKind;
  source.version = 0;
  source.width = options.width;
  const texture = createTexture({
    colorSpace: options.colorSpace,
    sampler: options.sampler ? cloneSampler(options.sampler) : undefined,
    dimension: '2d',
    source,
  });
  const runtime = getGlRenderStateRuntime(state);
  (runtime.context.glExternalTextureCache ??= new WeakMap()).set(source, handle);
  registerGlTextureResolver(state, ExternalTextureSourceKind, resolveExternalGlTexture);
  return texture;
}

export function disposeExternalGlTexture(state: GlRenderState, texture: Readonly<Texture>): boolean {
  const source = getExternalTextureSource(texture);
  return source === null
    ? false
    : (getGlRenderStateRuntime(state).context.glExternalTextureCache?.delete(source) ?? false);
}

function resolveExternalGlTexture(state: GlRenderState, texture: Readonly<TextureLike>): GlTextureRealization | null {
  const source = getExternalTextureSource(texture);
  if (source === null) return null;
  const runtime = getGlRenderStateRuntime(state);
  const handle = runtime.context.glExternalTextureCache?.get(source);
  if (handle === undefined) return null;
  bindGlTextureRealization(state, { straightAlpha: false, texture: handle });
  applyGlSamplerState(state, runtime, handle, texture.sampler);
  return { straightAlpha: false, texture: handle };
}

function getExternalTextureSource(texture: Readonly<TextureLike>): ExternalTexture | null {
  if (texture.dimension !== '2d' || texture.source?.kind !== ExternalTextureSourceKind) return null;
  return texture.source as ExternalTexture;
}
