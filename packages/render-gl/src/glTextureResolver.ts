import { createKeyedTable, withoutRegistryTableEntry, withRegistryTableEntry } from '@flighthq/registry/contract';
import { getTextureSampleColorSpace, getTextureSource, getTextureSourceKind } from '@flighthq/texture/contract';
import type {
  RenderTargetColorSpace,
  Bitmap,
  CompressedImageResource,
  GlRenderState,
  GlTextureRealization,
  GlTextureResolver,
  ImageResource,
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
  RegistryEntryState,
  RenderTargetTextureSourceKind,
} from '@flighthq/types/contract';

import {
  bindGlBitmapTexture,
  bindGlCompressedImageTexture,
  bindGlImageResourceTexture,
  bindGlTextureRealization,
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

// Registers or replaces one declared source-kind resolver on this render state. The persistent table
// replacement is last-write-wins; passing null removes the key. No registration ordering or matcher
// scan exists.
export function registerGlTextureResolver(
  state: GlRenderState,
  sourceKind: TextureSourceKind,
  resolver: GlTextureResolver | null,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const table = runtime.registries.textureResolvers;
  runtime.registries.textureResolvers =
    resolver === null
      ? withoutRegistryTableEntry(table, sourceKind)
      : withRegistryTableEntry(table, sourceKind, resolver);
}

export function registerStandardGlTextureResolvers(state: GlRenderState): void {
  registerGlBitmapTextureResolver(state);
  registerGlImageTextureResolver(state);
  registerGlRenderTextureResolver(state);
}

// Resolves through one keyed lookup using the source's declared kind, then centrally binds the full
// realization so the handle and alpha interpretation enter the context shadow atomically. Resolution
// may still bind transiently while uploading; callers must not reorder this call across active-texture
// operations as though it were pure. The CPU source owns its kind; a
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
  const entry = runtime.registries.textureResolvers.entries.get(sourceKind);
  if (entry?.state !== RegistryEntryState.Bound) {
    runtime.registryMiss?.(RenderRegistry.TextureResolver, sourceKind);
    return null;
  }
  const realization = entry.value(
    state,
    texture,
    premultiply,
    getTextureSampleColorSpace(texture.colorSpace, workingColorSpace),
  );
  return realization === null ? null : bindGlTextureRealization(state, realization);
}

function resolveGlBitmapTexture(
  state: GlRenderState,
  texture: Readonly<TextureLike>,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
): GlTextureRealization | null {
  const bitmap = getTextureSource(texture) as Readonly<Bitmap> | null;
  if (bitmap === null) return null;
  return {
    straightAlpha: false,
    texture: bindGlBitmapTexture(state, bitmap, texture.sampler, null, premultiply, colorSpace),
  };
}

function resolveGlCompressedImageTexture(
  state: GlRenderState,
  texture: Readonly<TextureLike>,
  _premultiply: boolean,
  colorSpace: TextureColorSpace,
): GlTextureRealization | null {
  const image = getTextureSource(texture) as Readonly<CompressedImageResource> | null;
  if (image === null) return null;
  return {
    straightAlpha: true,
    texture: bindGlCompressedImageTexture(state, image, texture.sampler, null, colorSpace),
  };
}

function resolveGlImageTexture(
  state: GlRenderState,
  texture: Readonly<TextureLike>,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
): GlTextureRealization | null {
  const image = getTextureSource(texture) as Readonly<ImageResource> | null;
  if (image === null) return null;
  return {
    straightAlpha: false,
    texture: bindGlImageResourceTexture(state, image, texture.sampler, null, premultiply, colorSpace),
  };
}

function resolveGlRenderTexture(state: GlRenderState, texture: Readonly<TextureLike>): GlTextureRealization | null {
  const handle = bindGlRenderTexture(state, texture as Readonly<RenderTexture>);
  return handle === null ? null : { straightAlpha: false, texture: handle };
}

const _standardGlTextureResolvers = withRegistryTableEntry(
  withRegistryTableEntry(
    withRegistryTableEntry(
      createKeyedTable<GlTextureResolver>('GlTextureResolver', 'Unregistered'),
      BitmapTextureSourceKind,
      resolveGlBitmapTexture,
    ),
    ImageTextureSourceKind,
    resolveGlImageTexture,
  ),
  RenderTargetTextureSourceKind,
  resolveGlRenderTexture,
);

export { _standardGlTextureResolvers as standardGlTextureResolvers };
