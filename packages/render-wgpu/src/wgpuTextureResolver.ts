import { getTextureSourceKind } from '@flighthq/texture/contract';
import type {
  Bitmap,
  CompressedImage,
  ImageResource,
  RenderTexture,
  Texture,
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
  RenderTargetTextureSourceKind,
  VideoTextureSourceKind,
} from '@flighthq/types/contract';

import {
  bindWgpuBitmapTexture,
  bindWgpuCompressedImageTexture,
  bindWgpuImageResourceTexture,
  bindWgpuVideoTexture,
} from './wgpuDraw';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { bindWgpuRenderTexture } from './wgpuRenderTexture';

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

// Registers or replaces one declared source-kind resolver on this render state. Map.set is
// last-write-wins; passing null removes the key.
export function registerWgpuTextureResolver(
  state: WgpuRenderState,
  sourceKind: TextureSourceKind,
  resolver: WgpuTextureResolver | null,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const registry = (runtime.wgpuTextureResolverRegistry ??= new Map());
  if (resolver === null) registry.delete(sourceKind);
  else registry.set(sourceKind, resolver);
}

export function registerWgpuVideoTextureResolver(state: WgpuRenderState): void {
  registerWgpuTextureResolver(state, VideoTextureSourceKind, resolveWgpuVideoTexture);
}

// Resolves through one keyed lookup using the source's declared kind. Resolution may realize, upload,
// and cache the GPU entry, but unlike the GL twin it does not bind command-pass state; the draw caller
// binds the returned entry's group explicitly.
export function resolveWgpuTexture(
  state: WgpuRenderState,
  texture: Readonly<TextureLike>,
  premultiply = false,
): WgpuTextureEntry | null {
  const registry = getWgpuRenderStateRuntime(state).wgpuTextureResolverRegistry;
  if (registry == null) return null;
  const sourceKind = getTextureSourceKind(texture);
  if (sourceKind === null) return null;
  return registry.get(sourceKind)?.(state, texture, premultiply) ?? null;
}

function resolveWgpuBitmapTexture(
  state: WgpuRenderState,
  texture: Readonly<TextureLike>,
  premultiply: boolean,
): WgpuTextureEntry | null {
  const bitmap = texture.storage.image as Readonly<Bitmap> | null;
  return bitmap === null ? null : bindWgpuBitmapTexture(state, bitmap, texture.sampler.mipmaps, premultiply);
}

function resolveWgpuCompressedImageTexture(
  state: WgpuRenderState,
  texture: Readonly<TextureLike>,
): WgpuTextureEntry | null {
  const image = texture.storage.image as Readonly<CompressedImage> | null;
  return image === null ? null : bindWgpuCompressedImageTexture(state, image);
}

function resolveWgpuImageTexture(
  state: WgpuRenderState,
  texture: Readonly<TextureLike>,
  premultiply: boolean,
): WgpuTextureEntry | null {
  const image = texture.storage.image as Readonly<ImageResource> | null;
  return image === null ? null : bindWgpuImageResourceTexture(state, image, texture.sampler.mipmaps, premultiply);
}

function resolveWgpuRenderTexture(state: WgpuRenderState, texture: Readonly<TextureLike>): WgpuTextureEntry | null {
  return bindWgpuRenderTexture(state, texture as Readonly<RenderTexture>);
}

function resolveWgpuVideoTexture(state: WgpuRenderState, texture: Readonly<TextureLike>): WgpuTextureEntry | null {
  return bindWgpuVideoTexture(state, texture as Readonly<Texture>);
}
