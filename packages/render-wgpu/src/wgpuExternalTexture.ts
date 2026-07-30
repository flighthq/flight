import { createEntity } from '@flighthq/entity/contract';
import { cloneSampler, createTexture } from '@flighthq/texture/contract';
import type {
  CreateExternalTextureOptions,
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
  const view = handle.createView();
  const sampler = getExternalWgpuSampler(state, texture);
  const bindGroup = state.device.createBindGroup({
    layout: getWgpuRenderStateRuntime(state).textureBindGroupLayout,
    entries: [
      { binding: 0, resource: view },
      { binding: 1, resource: sampler },
    ],
  });
  (getWgpuRenderStateRuntime(state).wgpuExternalTextureCache ??= new WeakMap()).set(texture, {
    bindGroup,
    texture: handle,
    view,
  });
  registerWgpuTextureResolver(state, ExternalTextureSourceKind, resolveExternalWgpuTexture);
  return texture;
}

export function disposeExternalWgpuTexture(state: WgpuRenderState, texture: Readonly<Texture>): boolean {
  return getWgpuRenderStateRuntime(state).wgpuExternalTextureCache?.delete(texture as Texture) ?? false;
}

function getExternalWgpuSampler(state: WgpuRenderState, texture: Readonly<Texture>): GPUSampler {
  const sampler = texture.sampler;
  const filter: GPUFilterMode = sampler.magFilter.startsWith('nearest') ? 'nearest' : 'linear';
  const mipmapFilter: GPUMipmapFilterMode | undefined = sampler.mipmaps
    ? sampler.minFilter.endsWith('mipmap-nearest')
      ? 'nearest'
      : sampler.minFilter.endsWith('mipmap-linear')
        ? 'linear'
        : undefined
    : undefined;
  return getWgpuSampler(state, filter, sampler.wrapU, sampler.wrapV, mipmapFilter, sampler.anisotropy);
}

function resolveExternalWgpuTexture(state: WgpuRenderState, texture: Readonly<TextureLike>): WgpuTextureEntry | null {
  return getWgpuRenderStateRuntime(state).wgpuExternalTextureCache?.get(texture as Texture) ?? null;
}
