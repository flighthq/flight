import { createEntity } from '@flighthq/entity/contract';
import { cloneSampler, createTexture } from '@flighthq/texture/contract';
import type {
  CreateExternalTextureOptions,
  ExternalTexture,
  Texture,
  TextureLike,
  WgpuRenderState,
  WgpuTextureEntry,
} from '@flighthq/types/contract';
import { ExternalTextureSourceKind } from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime, getWgpuSampler } from './wgpuRenderState';
import { registerWgpuTextureResolver } from './wgpuTextureResolver';

export function createExternalWgpuTexture(
  state: WgpuRenderState,
  handle: GPUTexture,
  options: Readonly<CreateExternalTextureOptions>,
): Texture {
  const source = createEntity({
    height: options.height,
    kind: ExternalTextureSourceKind,
    version: 0,
    width: options.width,
  }) as ExternalTexture;
  const texture = createTexture({
    colorSpace: options.colorSpace,
    sampler: options.sampler ? cloneSampler(options.sampler) : undefined,
    dimension: '2d',
    source,
  });
  const view = handle.createView();
  // The external source fixes its own filtering, so the entry carries the sampler and the draw policy
  // does not override it. Bind groups are built per sampler on demand rather than captured here.
  const sampler = getExternalWgpuSampler(state, texture);
  (getWgpuRenderStateRuntime(state).context.wgpuExternalTextureCache ??= new WeakMap()).set(
    source,
    createEntity({
      bindings: new Map(),
      mipLevelCount: 1,
      sampler,
      texture: handle,
      view,
    }),
  );
  registerWgpuTextureResolver(state, ExternalTextureSourceKind, resolveExternalWgpuTexture);
  return texture;
}

export function disposeExternalWgpuTexture(state: WgpuRenderState, texture: Readonly<Texture>): boolean {
  const source = getExternalTextureSource(texture);
  return source === null
    ? false
    : (getWgpuRenderStateRuntime(state).context.wgpuExternalTextureCache?.delete(source) ?? false);
}

function getExternalWgpuSampler(state: WgpuRenderState, texture: Readonly<Texture>): GPUSampler {
  const sampler = texture.sampler;
  const minFilter: GPUFilterMode = sampler.minFilter.startsWith('nearest') ? 'nearest' : 'linear';
  const magFilter: GPUFilterMode = sampler.magFilter.startsWith('nearest') ? 'nearest' : 'linear';
  const mipmapFilter: GPUMipmapFilterMode | undefined = sampler.mipmaps
    ? sampler.minFilter.endsWith('mipmap-nearest')
      ? 'nearest'
      : sampler.minFilter.endsWith('mipmap-linear')
        ? 'linear'
        : undefined
    : undefined;
  return getWgpuSampler(state, minFilter, magFilter, sampler.wrapU, sampler.wrapV, mipmapFilter, sampler.anisotropy);
}

function resolveExternalWgpuTexture(state: WgpuRenderState, texture: Readonly<TextureLike>): WgpuTextureEntry | null {
  const source = getExternalTextureSource(texture);
  return source === null
    ? null
    : (getWgpuRenderStateRuntime(state).context.wgpuExternalTextureCache?.get(source) ?? null);
}

function getExternalTextureSource(texture: Readonly<TextureLike>): ExternalTexture | null {
  if (texture.dimension !== '2d' || texture.source?.kind !== ExternalTextureSourceKind) return null;
  return texture.source as ExternalTexture;
}
