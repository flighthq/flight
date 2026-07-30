import { getTextureBackingKind } from '@flighthq/texture/contract';
import type {
  Bitmap,
  CompressedImage,
  ImageResource,
  RenderTexture,
  Texture,
  TextureBackingKind,
  TextureLike,
  WgpuRenderState,
  WgpuTextureEntry,
  WgpuTextureResolver,
} from '@flighthq/types/contract';
import {
  BitmapTextureBackingKind,
  CompressedImageTextureBackingKind,
  ImageTextureBackingKind,
  RenderTextureBackingKind,
  VideoTextureBackingKind,
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
  registerWgpuTextureResolver(state, BitmapTextureBackingKind, resolveWgpuBitmapTexture);
}

export function registerWgpuCompressedImageTextureResolver(state: WgpuRenderState): void {
  registerWgpuTextureResolver(state, CompressedImageTextureBackingKind, resolveWgpuCompressedImageTexture);
}

export function registerWgpuImageTextureResolver(state: WgpuRenderState): void {
  registerWgpuTextureResolver(state, ImageTextureBackingKind, resolveWgpuImageTexture);
}

export function registerWgpuRenderTextureResolver(state: WgpuRenderState): void {
  registerWgpuTextureResolver(state, RenderTextureBackingKind, resolveWgpuRenderTexture);
}

// Registers or replaces one declared backing-kind resolver on this render state. Map.set is
// last-write-wins; passing null removes the key.
export function registerWgpuTextureResolver(
  state: WgpuRenderState,
  backingKind: TextureBackingKind,
  resolver: WgpuTextureResolver | null,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const registry = (runtime.wgpuTextureResolverRegistry ??= new Map());
  if (resolver === null) registry.delete(backingKind);
  else registry.set(backingKind, resolver);
}

export function registerWgpuVideoTextureResolver(state: WgpuRenderState): void {
  registerWgpuTextureResolver(state, VideoTextureBackingKind, resolveWgpuVideoTexture);
}

// Resolves through one keyed lookup using the backing's declared kind. Resolution may realize, upload,
// and cache the GPU entry, but unlike the GL twin it does not bind command-pass state; the draw caller
// binds the returned entry's group explicitly.
export function resolveWgpuTexture(
  state: WgpuRenderState,
  texture: Readonly<TextureLike>,
  premultiply = false,
): WgpuTextureEntry | null {
  const registry = getWgpuRenderStateRuntime(state).wgpuTextureResolverRegistry;
  if (registry == null) return null;
  const backingKind = getTextureBackingKind(texture);
  if (backingKind === null) return null;
  return registry.get(backingKind)?.(state, texture, premultiply) ?? null;
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
