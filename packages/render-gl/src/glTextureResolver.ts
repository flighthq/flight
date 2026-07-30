import { getTextureSourceKind } from '@flighthq/texture/contract';
import type {
  Bitmap,
  CompressedImage,
  GlRenderState,
  GlTextureResolver,
  ImageResource,
  RenderTexture,
  TextureSourceKind,
  TextureLike,
} from '@flighthq/types/contract';
import {
  BitmapTextureSourceKind,
  CompressedImageTextureSourceKind,
  ImageTextureSourceKind,
  RenderTargetTextureSourceKind,
  VideoTextureSourceKind,
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
  registerGlTextureResolver(state, BitmapTextureSourceKind, resolveGlBitmapTexture);
}

export function registerGlCompressedImageTextureResolver(state: GlRenderState): void {
  registerGlTextureResolver(state, CompressedImageTextureSourceKind, resolveGlCompressedImageTexture);
}

export function registerGlImageTextureResolver(state: GlRenderState): void {
  registerGlTextureResolver(state, ImageTextureSourceKind, resolveGlImageTexture);
}

// Installs the render-target realization.
export function registerGlRenderTextureResolver(state: GlRenderState): void {
  registerGlTextureResolver(state, RenderTargetTextureSourceKind, resolveGlRenderTexture);
}

// Registers or replaces one declared source-kind resolver on this render state. Map.set is
// last-write-wins; passing null removes the key. No registration ordering or matcher scan exists.
export function registerGlTextureResolver(
  state: GlRenderState,
  sourceKind: TextureSourceKind,
  resolver: GlTextureResolver | null,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const registry = (runtime.glTextureResolverRegistry ??= new Map());
  if (resolver === null) registry.delete(sourceKind);
  else registry.set(sourceKind, resolver);
}

// Installs the dynamic host-video specialization.
export function registerGlVideoTextureResolver(state: GlRenderState): void {
  registerGlTextureResolver(state, VideoTextureSourceKind, resolveGlVideoTexture);
}

// Resolves through one keyed lookup using the source's declared kind. Resolution is deliberately not
// pure: each built-in resolver leaves its result bound to TEXTURE_2D on the active texture unit because
// GL upload and sampler application require that binding. Callers must not reorder this call across
// activeTexture/bind operations as though it only returned a handle. The CPU source owns its kind; a
// GPU-origin target owns its own. An unbound or undeclared backing is the null sentinel.
export function resolveGlTexture(
  state: GlRenderState,
  texture: Readonly<TextureLike>,
  premultiply = false,
): WebGLTexture | null {
  const registry = getGlRenderStateRuntime(state).glTextureResolverRegistry;
  if (registry == null) return null;
  const sourceKind = getTextureSourceKind(texture);
  if (sourceKind === null) return null;
  return registry.get(sourceKind)?.(state, texture, premultiply) ?? null;
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
  return bindGlRenderTexture(state, texture as Readonly<RenderTexture>);
}

function resolveGlVideoTexture(state: GlRenderState, texture: Readonly<TextureLike>): WebGLTexture | null {
  const source = (texture.storage.image as Readonly<ImageResource> | null)?.source as
    | HTMLVideoElement
    | null
    | undefined;
  if (source == null || source.readyState < 2 || source.videoWidth <= 0 || source.videoHeight <= 0) return null;
  return bindGlVideoTexture(state, texture);
}
