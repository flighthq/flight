import { createCanvasFromImageResource } from '@flighthq/image';
import type { DomRenderState, ImageResource } from '@flighthq/types';

import { getDomRenderStateRuntime } from './domRenderState';

// Which representation resolveDomImageSource will draw: the host `element` (zero copy), a
// `data`-materialized canvas (transcode on first resolve / version bump), or `none`. The shakeable
// diagnostic for the otherwise-silent data→element transcode; see explainCanvasImageSource.
export type DomImageSourceKind = 'data' | 'element' | 'none';

// Reports how a resource resolves on the DOM backend without materializing anything.
export function explainDomImageSource(image: Readonly<ImageResource>): DomImageSourceKind {
  if (image.source !== null) return 'element';
  if (image.data !== null) return 'data';
  return 'none';
}

// Resolves a (possibly data-only) ImageResource to a CanvasImageSource the DOM bitmap path can draw
// into its per-node canvas. An element-backed resource returns its host `source` directly; a data-only
// Surface materializes an HTMLCanvasElement from its pixels and caches it per render state, rebuilding
// only on a `version` bump. The DOM twin of resolveCanvasImageSource — same renderer-owned,
// version-keyed derived cache, never written back onto the shared resource. Returns null when the
// resource has neither pixel form.
export function resolveDomImageSource(state: DomRenderState, image: Readonly<ImageResource>): CanvasImageSource | null {
  if (image.source !== null) return image.source;
  if (image.data === null) return null;

  const runtime = getDomRenderStateRuntime(state);
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
