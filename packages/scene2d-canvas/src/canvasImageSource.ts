import { createCanvasFromImageResource } from '@flighthq/image';
import type { CanvasImageSourceKind, CanvasRenderState, ImageResource } from '@flighthq/types';

import { getCanvasRenderStateRuntime } from './canvasRenderState';

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

// Resolves a (possibly data-only) ImageResource to a CanvasImageSource the 2D context can draw. An
// element-backed resource returns its host `source` directly with no copy. A data-only resource — a
// generated Surface with no element — materializes an HTMLCanvasElement from its raw pixels and caches
// it per render state, re-materializing only when `version` bumps (see invalidateImageResource).
// Returns null when the resource carries neither pixel form.
//
// This is the Canvas parallel to the GL backend's bindGlImageResourceTexture: derived, renderer-owned
// state keyed on the caller's explicit invalidation signal, never written back onto the shared
// resource. It closes the gap where a data-only Surface previously drew nothing on Canvas/DOM unless
// the caller manually built an element (createImageResourceFromSurface) first. The transcode cost is
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
