import { getTextureSampleColorSpace, getTextureSource, getTextureSourceKind } from '@flighthq/texture/contract';
import type {
  RenderTargetColorSpace,
  Bitmap,
  CompressedImage,
  GlRenderState,
  GlTextureResolver,
  Image,
  RenderTexture,
  TextureColorSpace,
  TextureSourceKind,
  TextureLike,
} from '@flighthq/types/contract';
import {
  BitmapTextureSourceKind,
  CompressedImageTextureSourceKind,
  ImageTextureSourceKind,
  RenderRegistry,
  RenderTargetTextureSourceKind,
} from '@flighthq/types/contract';

import { bindGlBitmapTexture, bindGlCompressedImageTexture, bindGlImageResourceTexture } from './glDraw';
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

export function registerStandardGlTextureResolvers(state: GlRenderState): void {
  registerGlBitmapTextureResolver(state);
  registerGlImageTextureResolver(state);
  registerGlRenderTextureResolver(state);
}

// Resolves through one keyed lookup using the source's declared kind. Resolution is deliberately not
// pure: each built-in resolver leaves its result bound to TEXTURE_2D on the active texture unit because
// GL upload and sampler application require that binding. Callers must not reorder this call across
// activeTexture/bind operations as though it only returned a handle. The CPU source owns its kind; a
// GPU-origin target owns its own. An unbound or undeclared source is the null sentinel.
// `workingColorSpace` is the space the DESTINATION composites in, not a claim about this texture —
// `texture.colorSpace` already says what the content is. The sample format is derived from the pair by
// getTextureSampleColorSpace, so a path flips one value (its working space) rather than misdescribing
// every texture it draws. 3D composites linear; 2D composites in the encoded domain and passes 'srgb'.
export function resolveGlTexture(
  state: GlRenderState,
  texture: Readonly<TextureLike>,
  premultiply = false,
  workingColorSpace: RenderTargetColorSpace = 'linear',
): WebGLTexture | null {
  const sourceKind = getTextureSourceKind(texture);
  if (sourceKind === null) return null;
  const runtime = getGlRenderStateRuntime(state);
  const resolver = runtime.glTextureResolverRegistry?.get(sourceKind);
  if (resolver === undefined) {
    runtime.registryMiss?.(RenderRegistry.TextureResolver, sourceKind);
    return null;
  }
  return resolver(state, texture, premultiply, getTextureSampleColorSpace(texture.colorSpace, workingColorSpace));
}

function resolveGlBitmapTexture(
  state: GlRenderState,
  texture: Readonly<TextureLike>,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
): WebGLTexture | null {
  const bitmap = getTextureSource(texture) as Readonly<Bitmap> | null;
  return bitmap === null ? null : bindGlBitmapTexture(state, bitmap, texture.sampler, null, premultiply, colorSpace);
}

function resolveGlCompressedImageTexture(
  state: GlRenderState,
  texture: Readonly<TextureLike>,
  _premultiply: boolean,
  colorSpace: TextureColorSpace,
): WebGLTexture | null {
  const image = getTextureSource(texture) as Readonly<CompressedImage> | null;
  return image === null ? null : bindGlCompressedImageTexture(state, image, texture.sampler, null, colorSpace);
}

function resolveGlImageTexture(
  state: GlRenderState,
  texture: Readonly<TextureLike>,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
): WebGLTexture | null {
  const image = getTextureSource(texture) as Readonly<Image> | null;
  return image === null
    ? null
    : bindGlImageResourceTexture(state, image, texture.sampler, null, premultiply, colorSpace);
}

function resolveGlRenderTexture(state: GlRenderState, texture: Readonly<TextureLike>): WebGLTexture | null {
  return bindGlRenderTexture(state, texture as Readonly<RenderTexture>);
}
