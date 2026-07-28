import { getTextureBackingKind } from '@flighthq/texture/contract';
import type {
  Bitmap,
  CompressedImage,
  GlRenderState,
  GlTextureResolver,
  ImageResource,
  Texture,
  TextureBackingKind,
  TextureLike,
} from '@flighthq/types/contract';
import {
  BitmapTextureBackingKind,
  CompressedImageTextureBackingKind,
  ImageTextureBackingKind,
  RenderTextureBackingKind,
  VideoTextureBackingKind,
} from '@flighthq/types/contract';

import {
  bindGlBitmapTexture,
  bindGlCompressedImageTexture,
  bindGlImageResourceTexture,
  bindGlVideoTexture,
} from './glDraw';
import { getGlRenderStateRuntime } from './glRenderState';
import { bindGlRenderTexture } from './glRenderTexture';

export function registerGlBitmapTextureResolver(state: GlRenderState): void {
  registerGlTextureResolver(state, BitmapTextureBackingKind, resolveGlBitmapTexture);
}

export function registerGlCompressedImageTextureResolver(state: GlRenderState): void {
  registerGlTextureResolver(state, CompressedImageTextureBackingKind, resolveGlCompressedImageTexture);
}

export function registerGlImageTextureResolver(state: GlRenderState): void {
  registerGlTextureResolver(state, ImageTextureBackingKind, resolveGlImageTexture);
}

// Installs the render-target realization.
export function registerGlRenderTextureResolver(state: GlRenderState): void {
  registerGlTextureResolver(state, RenderTextureBackingKind, resolveGlRenderTexture);
}

// Registers or replaces one declared backing-kind resolver on this render state. Map.set is
// last-write-wins; passing null removes the key. No registration ordering or matcher scan exists.
export function registerGlTextureResolver(
  state: GlRenderState,
  backingKind: TextureBackingKind,
  resolver: GlTextureResolver | null,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const registry = (runtime.glTextureResolverRegistry ??= new Map());
  if (resolver === null) registry.delete(backingKind);
  else registry.set(backingKind, resolver);
}

// Installs the dynamic host-video specialization.
export function registerGlVideoTextureResolver(state: GlRenderState): void {
  registerGlTextureResolver(state, VideoTextureBackingKind, resolveGlVideoTexture);
}

// Resolves through one keyed lookup using the backing's declared kind. The CPU backing owns its kind;
// a GPU-origin target owns its own. An unbound or undeclared backing is the null sentinel.
export function resolveGlTexture(
  state: GlRenderState,
  texture: Readonly<TextureLike>,
  premultiply = false,
): WebGLTexture | null {
  const registry = getGlRenderStateRuntime(state).glTextureResolverRegistry;
  if (registry == null) return null;
  const backingKind = getTextureBackingKind(texture);
  if (backingKind === null) return null;
  return registry.get(backingKind)?.(state, texture, premultiply) ?? null;
}

function resolveGlBitmapTexture(
  state: GlRenderState,
  texture: Readonly<TextureLike>,
  premultiply: boolean,
): WebGLTexture | null {
  const bitmap = texture.storage.image as Readonly<Bitmap> | null;
  return bitmap === null ? null : bindGlBitmapTexture(state, bitmap, texture.sampler, null, premultiply);
}

function resolveGlCompressedImageTexture(state: GlRenderState, texture: Readonly<TextureLike>): WebGLTexture | null {
  const image = texture.storage.image as Readonly<CompressedImage> | null;
  return image === null ? null : bindGlCompressedImageTexture(state, image, texture.sampler);
}

function resolveGlImageTexture(
  state: GlRenderState,
  texture: Readonly<TextureLike>,
  premultiply: boolean,
): WebGLTexture | null {
  const image = texture.storage.image as Readonly<ImageResource> | null;
  return image === null ? null : bindGlImageResourceTexture(state, image, texture.sampler, null, premultiply);
}

function resolveGlRenderTexture(state: GlRenderState, texture: Readonly<TextureLike>): WebGLTexture | null {
  return bindGlRenderTexture(state, texture as Readonly<Texture>);
}

function resolveGlVideoTexture(state: GlRenderState, texture: Readonly<TextureLike>): WebGLTexture | null {
  const source = (texture.storage.image as Readonly<ImageResource> | null)?.source as
    | HTMLVideoElement
    | null
    | undefined;
  if (source == null || source.readyState < 2 || source.videoWidth <= 0 || source.videoHeight <= 0) return null;
  return bindGlVideoTexture(state, texture);
}
