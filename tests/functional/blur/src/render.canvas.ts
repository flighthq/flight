import { type BlurFilter, blurFilterToCSS } from '@flighthq/filters';
import type { Bitmap, DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  computeBoundsRectangle,
  computeImageRenderCacheTransform,
  computeRenderTargetSize,
  createCanvasElement,
  createCanvasRenderState,
  createImageSourceFromCanvas,
  createMatrix,
  createRectangle,
  defaultCanvasBitmapRenderer,
  enableCanvasRenderImageCache,
  prepareDisplayObjectRender,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  setImageRenderCache,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xffffffff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);
enableCanvasRenderImageCache(state);
export const scale = pixelRatio;
export const width = 800;
export const height = 400;

// Bake each blurred bitmap once into an offscreen canvas and register it as the node's
// image-render cache. The expensive ctx.filter blur runs here a single time; every
// subsequent render() blits the cached bitmap through the image-cache renderer instead of
// re-running the filter — the bake-once pattern a game would use for a static effect.
//
// (setCanvasCSSFilter would re-run ctx.filter on every draw, so it is deliberately not used
// here. The convenience capture API can't bake a filter yet — it has no padding for the blur
// to bleed into and reuses one image source per state — so this bakes through the underlying
// setImageRenderCache with a per-node offscreen canvas.)
export function applyBlurFilters(list: { node: DisplayObject; filter: BlurFilter }[]): void {
  for (const { node, filter } of list) {
    const image = (node as Bitmap).data.image;
    if (image === null || image.src === null) continue;

    computeBoundsRectangle(_bounds, node, node);
    const padding = blurPadding(filter);
    const { width: w, height: h } = computeRenderTargetSize(_bounds, padding, 1, 1);

    const cacheCanvas = document.createElement('canvas');
    cacheCanvas.width = w;
    cacheCanvas.height = h;
    const ctx = cacheCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    // blurFilterToCSS returns null for anisotropic blur (blurX !== blurY); fall back to no blur.
    ctx.filter = blurFilterToCSS(filter) ?? 'none';
    ctx.drawImage(image.src, padding - _bounds.x, padding - _bounds.y);

    const transform = createMatrix();
    computeImageRenderCacheTransform(transform, _bounds, padding, padding);
    setImageRenderCache(node, { source: createImageSourceFromCanvas(cacheCanvas), transform });
  }
}

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}

// Box blur of standard deviation σ spreads a few σ past the bounds; pad generously so the
// tail is not clipped at the cache edge.
function blurPadding(filter: Readonly<BlurFilter>): number {
  return Math.ceil(Math.max(filter.blurX ?? 4, filter.blurY ?? 4) * 2.5);
}

const _bounds = createRectangle();
