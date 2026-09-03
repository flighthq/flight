import { withoutRegistryTableEntry, withRegistryTableEntry } from '@flighthq/registry/contract';
import { getTextureSampleColorSpace, getTextureSource, getTextureSourceKind } from '@flighthq/texture/contract';
import type {
  RenderTargetColorSpace,
  Bitmap,
  CompressedImageResource,
  ImageResource,
  RenderTexture,
  TextureColorSpace,
  TextureSourceKind,
  TextureLike,
  WgpuRenderState,
  WgpuTextureEntry,
  WgpuTextureResolver,
} from '@flighthq/types/contract';
import {
  BitmapTextureSourceKind,
  CompressedImageTextureSourceKind,
  ImageTextureSourceKind,
  RenderRegistry,
  RegistryEntryState,
  RenderTargetTextureSourceKind,
} from '@flighthq/types/contract';

import { bindWgpuBitmapTexture, bindWgpuCompressedImageTexture, bindWgpuImageResourceTexture } from './wgpuDraw';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { bindWgpuRenderTexture } from './wgpuRenderTexture';

export function registerStandardWgpuTextureResolvers(state: WgpuRenderState): void {
  registerWgpuBitmapTextureResolver(state);
  registerWgpuImageTextureResolver(state);
  registerWgpuRenderTextureResolver(state);
}

export function registerWgpuBitmapTextureResolver(state: WgpuRenderState): void {
  registerWgpuTextureResolver(state, BitmapTextureSourceKind, resolveWgpuBitmapTexture);
}

export function registerWgpuCompressedImageTextureResolver(state: WgpuRenderState): void {
  registerWgpuTextureResolver(state, CompressedImageTextureSourceKind, resolveWgpuCompressedImageTexture);
}

export function registerWgpuImageTextureResolver(state: WgpuRenderState): void {
  registerWgpuTextureResolver(state, ImageTextureSourceKind, resolveWgpuImageTexture);
}

export function registerWgpuRenderTextureResolver(state: WgpuRenderState): void {
  registerWgpuTextureResolver(state, RenderTargetTextureSourceKind, resolveWgpuRenderTexture);
}

// Registers or replaces one declared source-kind resolver on this render state. The persistent table
// replacement is last-write-wins; passing null removes the key.
export function registerWgpuTextureResolver(
  state: WgpuRenderState,
  sourceKind: TextureSourceKind,
  resolver: WgpuTextureResolver | null,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const table = runtime.registries.textureResolvers;
  runtime.registries.textureResolvers =
    resolver === null
      ? withoutRegistryTableEntry(table, sourceKind)
      : withRegistryTableEntry(table, sourceKind, resolver);
}

// Resolves through one keyed lookup using the source's declared kind. Resolution may realize, upload,
// and cache the GPU entry, but unlike the GL twin it does not bind command-pass state; the draw caller
// binds the returned entry's group explicitly.
export function resolveWgpuTexture(
  state: WgpuRenderState,
  texture: Readonly<TextureLike>,
  premultiply = false,
  workingColorSpace: RenderTargetColorSpace = 'linear',
): WgpuTextureEntry | null {
  const sourceKind = getTextureSourceKind(texture);
  if (sourceKind === null) return null;
  const runtime = getWgpuRenderStateRuntime(state);
  const entry = runtime.registries.textureResolvers.entries.get(sourceKind);
  if (entry?.state !== RegistryEntryState.Bound) {
    runtime.registryMiss?.(RenderRegistry.TextureResolver, sourceKind);
    return null;
  }
  return entry.value(state, texture, premultiply, getTextureSampleColorSpace(texture.colorSpace, workingColorSpace));
}

function resolveWgpuBitmapTexture(
  state: WgpuRenderState,
  texture: Readonly<TextureLike>,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
): WgpuTextureEntry | null {
  const bitmap = getTextureSource(texture) as Readonly<Bitmap> | null;
  return bitmap === null
    ? null
    : bindWgpuBitmapTexture(state, bitmap, texture.sampler.mipmaps, premultiply, colorSpace);
}

function resolveWgpuCompressedImageTexture(
  state: WgpuRenderState,
  texture: Readonly<TextureLike>,
  _premultiply: boolean,
  colorSpace: TextureColorSpace,
): WgpuTextureEntry | null {
  const image = getTextureSource(texture) as Readonly<CompressedImageResource> | null;
  return image === null ? null : bindWgpuCompressedImageTexture(state, image, colorSpace);
}

function resolveWgpuImageTexture(
  state: WgpuRenderState,
  texture: Readonly<TextureLike>,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
): WgpuTextureEntry | null {
  const image = getTextureSource(texture) as Readonly<ImageResource> | null;
  return image === null
    ? null
    : bindWgpuImageResourceTexture(state, image, texture.sampler.mipmaps, premultiply, colorSpace);
}

function resolveWgpuRenderTexture(state: WgpuRenderState, texture: Readonly<TextureLike>): WgpuTextureEntry | null {
  return bindWgpuRenderTexture(state, texture as Readonly<RenderTexture>);
}
