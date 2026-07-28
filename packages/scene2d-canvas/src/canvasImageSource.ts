import { createCanvasFromImageResource } from '@flighthq/image/contract';
import { getTextureBackingKind, getTextureHeight, getTextureWidth } from '@flighthq/texture/contract';
import type {
  CanvasImageSourceKind,
  CanvasRenderState,
  CanvasTextureResolver,
  ImageResource,
  Texture,
  TextureBackingKind,
} from '@flighthq/types/contract';
import {
  BitmapTextureBackingKind,
  CompressedImageTextureBackingKind,
  ImageTextureBackingKind,
  RenderTextureBackingKind,
  VideoTextureBackingKind,
} from '@flighthq/types/contract';

import { getCanvasRenderStateRuntime } from './canvasRenderState';
import { bindCanvasRenderTexture } from './canvasRenderTexture';

// Reports how a resource will resolve on the Canvas backend without drawing or materializing anything
// — the shakeable diagnostic for the otherwise-silent data→element transcode. `element` is free;
// `data` means resolveCanvasImageSource transcodes the pixels into a cached canvas on first use and
// after every `version` bump (a CPU copy the GL/wgpu data path does not incur, since those upload raw
// texels natively). A guard or dev tool surfaces this so the cost is legible, per the diagnostics rule.
export function explainCanvasImageSource(image: Readonly<ImageResource>): CanvasImageSourceKind {
  if (image.source !== null) return 'element';
  if (image.data !== null) return 'data';
  return 'none';
}

export function registerCanvasImageTextureResolver(state: CanvasRenderState): void {
  registerCanvasTextureResolver(state, ImageTextureBackingKind, resolveCanvasImageTexture);
  registerCanvasTextureResolver(state, BitmapTextureBackingKind, resolveCanvasImageTexture);
  registerCanvasTextureResolver(state, CompressedImageTextureBackingKind, resolveCanvasImageTexture);
}

export function registerCanvasRenderTextureResolver(state: CanvasRenderState): void {
  registerCanvasTextureResolver(state, RenderTextureBackingKind, resolveCanvasRenderTexture);
}

export function registerCanvasTextureResolver(
  state: CanvasRenderState,
  backingKind: TextureBackingKind,
  resolver: CanvasTextureResolver | null,
): void {
  const runtime = getCanvasRenderStateRuntime(state);
  const registry = (runtime.canvasTextureResolverRegistry ??= new Map());
  if (resolver === null) registry.delete(backingKind);
  else registry.set(backingKind, resolver);
}

export function registerCanvasVideoTextureResolver(state: CanvasRenderState): void {
  registerCanvasTextureResolver(state, VideoTextureBackingKind, resolveCanvasImageTexture);
}

// Resolves a (possibly data-only) ImageResource to a CanvasImageSource the 2D context can draw. An
// element-backed resource returns its host `source` directly with no copy. A data-only resource — a
// generated Bitmap with no element — materializes an HTMLCanvasElement from its raw pixels and caches
// it per render state, re-materializing only when `version` bumps (see invalidateImageResource).
// Returns null when the resource carries neither pixel form.
//
// This is the Canvas parallel to the GL backend's bindGlImageResourceTexture: derived, renderer-owned
// state keyed on the caller's explicit invalidation signal, never written back onto the shared
// resource. It closes the gap where a data-only Bitmap previously drew nothing on Canvas/DOM unless
// the caller manually built an element (createImageResourceFromBitmap) first. The transcode cost is
// reportable via explainCanvasImageSource rather than hidden.
export function resolveCanvasImageSource(
  state: CanvasRenderState,
  image: Readonly<ImageResource>,
): CanvasImageSource | null {
  if (image.source !== null) return image.source;
  if (image.data === null) return null;

  const runtime = getCanvasRenderStateRuntime(state);
  let cache = runtime.imageResourceElementCache;
  if (cache === undefined) {
    cache = new WeakMap();
    runtime.imageResourceElementCache = cache;
  }

  let entry = cache.get(image);
  if (entry === undefined || entry.version !== image.version) {
    // data is non-null here, so the transcode never returns null.
    entry = { element: createCanvasFromImageResource(image)!, version: image.version };
    cache.set(image, entry);
  }
  return entry.element;
}

// Resolves one 2D Texture through its declared backing kind. Callers explicitly register only the
// backing families they use, keeping render-target machinery out of ordinary image bundles.
export function resolveCanvasTexture(state: CanvasRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  if (texture.storage.dimension !== '2d') return null;
  const registry = getCanvasRenderStateRuntime(state).canvasTextureResolverRegistry;
  if (registry == null) return null;
  const backingKind = getTextureBackingKind(texture);
  if (backingKind === null) return null;
  return registry.get(backingKind)?.(state, texture) ?? null;
}

// Resolves a Texture's uv window as a standalone drawable for Canvas patterns. Identity windows return
// the backing directly. Sub-rect/flip windows are materialized once per render state and refreshed when
// either the backing or Texture state changes, so atlas-region fills repeat the region rather than the
// entire atlas. A null state supports the GL/WGPU/DOM raster fallbacks for element-backed images.
export function resolveCanvasTextureWindowSource(
  state: CanvasRenderState | null,
  texture: Readonly<Texture>,
): CanvasImageSource | null {
  if (texture.storage.dimension !== '2d') return null;
  const image = texture.storage.image;
  const source =
    state !== null
      ? resolveCanvasTexture(state, texture)
      : (image?.source ?? (image !== null && image.data !== null ? createCanvasFromImageResource(image) : null));
  if (source === null) return null;

  const uvOffsetX = texture.uvOffset.x;
  const uvOffsetY = texture.uvOffset.y;
  const uvRotation = texture.uvRotation;
  const uvScaleX = texture.uvScale.x;
  const uvScaleY = texture.uvScale.y;
  if (
    uvOffsetX === 0 &&
    uvOffsetY === 0 &&
    uvScaleX === 1 &&
    uvScaleY === 1 &&
    !texture.flipX &&
    !texture.flipY &&
    uvRotation === 0
  ) {
    return source;
  }

  const backingWidth = getTextureWidth(texture);
  const backingHeight = getTextureHeight(texture);
  const sourceWidth = Math.abs(uvScaleX * backingWidth);
  const sourceHeight = Math.abs(uvScaleY * backingHeight);
  if (backingWidth <= 0 || backingHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0) return null;

  const imageVersion = image?.version ?? -1;
  const runtime = state !== null ? getCanvasRenderStateRuntime(state) : null;
  const cache = runtime !== null ? (runtime.textureWindowElementCache ??= new WeakMap()) : null;
  let entry = cache?.get(texture);
  if (
    entry !== undefined &&
    entry.source === source &&
    entry.imageVersion === imageVersion &&
    entry.textureVersion === texture.version &&
    entry.uvOffsetX === uvOffsetX &&
    entry.uvOffsetY === uvOffsetY &&
    entry.uvRotation === uvRotation &&
    entry.uvScaleX === uvScaleX &&
    entry.uvScaleY === uvScaleY &&
    entry.flipX === texture.flipX &&
    entry.flipY === texture.flipY
  ) {
    return entry.element;
  }

  const element = document.createElement('canvas');
  element.width = Math.max(1, Math.ceil(sourceWidth));
  element.height = Math.max(1, Math.ceil(sourceHeight));
  const context = element.getContext('2d');
  if (context === null) return null;
  context.imageSmoothingEnabled = !texture.sampler.magFilter.startsWith('nearest');

  const sourceX = Math.min(uvOffsetX * backingWidth, (uvOffsetX + uvScaleX) * backingWidth);
  const sourceY = Math.min(uvOffsetY * backingHeight, (uvOffsetY + uvScaleY) * backingHeight);
  const flipX = texture.flipX !== uvScaleX < 0;
  const flipY = texture.flipY !== uvScaleY < 0;
  context.save();
  context.translate(flipX ? element.width : 0, flipY ? element.height : 0);
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  context.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, element.width, element.height);
  context.restore();

  entry = {
    element,
    flipX: texture.flipX,
    flipY: texture.flipY,
    imageVersion,
    source,
    textureVersion: texture.version,
    uvOffsetX,
    uvOffsetY,
    uvRotation,
    uvScaleX,
    uvScaleY,
  };
  cache?.set(texture, entry);
  return element;
}

function resolveCanvasImageTexture(state: CanvasRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  const image = texture.storage.image;
  return image != null ? resolveCanvasImageSource(state, image) : null;
}

function resolveCanvasRenderTexture(state: CanvasRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  return bindCanvasRenderTexture(state, texture);
}
