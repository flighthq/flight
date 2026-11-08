import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';
import type { ExternalTexture } from '@flighthq/render/contract';
import type { CreateExternalTextureOptions } from '@flighthq/render/contract';
import { cloneSampler, createTexture } from '@flighthq/texture/contract';
import type { Texture, TextureLike } from '@flighthq/texture/contract';
import { ExternalTextureSourceKind } from '@flighthq/texture/contract';

import type {
  WgpuFilterMode,
  WgpuMipmapFilterMode,
  WgpuRenderState,
  WgpuSampler,
  WgpuTexture,
  WgpuTextureEntry,
  WgpuTextureView,
} from './contract.render-wgpu-types.ts';
import { getWgpuRenderStateRuntime, getWgpuSampler } from './wgpuRenderState.ts';
import { registerWgpuTextureResolver } from './wgpuTextureResolver.ts';

export function createExternalWgpuTexture(
  state: WgpuRenderState,
  handle: WgpuTexture,
  options: Readonly<CreateExternalTextureOptions>,
): Texture {
  const source = allocateEntity<ExternalTexture>();
  initializeExternalWgpuTextureSource(source, options);
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
    (() => {
      const entry = allocateEntity<WgpuTextureEntry>();
      initializeExternalWgpuTextureEntry(entry, sampler, handle, view);
      return finishEntity(entry);
    })(),
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

export function initializeExternalWgpuTextureEntry(
  out: EntityConstruction<WgpuTextureEntry>,
  sampler: WgpuSampler,
  texture: WgpuTexture,
  view: WgpuTextureView,
): void {
  out.bindings = new Map();
  out.mipLevelCount = 1;
  out.sampler = sampler;
  out.texture = texture;
  out.view = view;
}

export function initializeExternalWgpuTextureSource(
  out: EntityConstruction<ExternalTexture>,
  options: Readonly<CreateExternalTextureOptions>,
): void {
  out.height = options.height;
  out.kind = ExternalTextureSourceKind;
  out.version = 0;
  out.width = options.width;
}

function getExternalWgpuSampler(state: WgpuRenderState, texture: Readonly<Texture>): WgpuSampler {
  const sampler = texture.sampler;
  const minFilter: WgpuFilterMode = sampler.minFilter.startsWith('nearest') ? 'nearest' : 'linear';
  const magFilter: WgpuFilterMode = sampler.magFilter.startsWith('nearest') ? 'nearest' : 'linear';
  const mipmapFilter: WgpuMipmapFilterMode | undefined = sampler.mipmaps
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
