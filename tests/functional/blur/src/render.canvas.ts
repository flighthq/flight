import { type BlurFilter, computeBlurFilterCSS } from '@flighthq/filters';
import type { Bitmap, DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  computeNodeBoundsRectangle,
  computeRenderCacheTransform,
  computeRenderTargetSize,
  createCanvasElement,
  createCanvasRenderState,
  createRectangle,
  createRenderCache,
  defaultCanvasBitmapRenderer,
  defaultCanvasRichTextRenderer,
  enableCanvasRenderCache,
  ensureCanvasRenderCacheTarget,
  prepareDisplayObjectRender,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  RichTextKind,
  useRenderCache,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0xffffffff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);
registerRenderer(state, RichTextKind, defaultCanvasRichTextRenderer);
enableCanvasRenderCache(state);
export const scale = pixelRatio;
export const width = 800;
export const height = 400;

// Bake each blurred bitmap once into its render cache: attach a RenderCache to the node, draw
// the CSS-blurred bitmap into the cache's canvas target, and record the transform that places
// it back in scene space. The expensive ctx.filter blur runs here a single time; every
// subsequent render() blits the cached canvas through the render-cache renderer instead of
// re-running the filter — the bake-once pattern a game would use for a static effect.
//
// This is the custom-bake path: the content (a filtered image) is drawn by hand into the
// cache target rather than engine-baked from the subtree, since the blur is a CSS filter the
// normal render pass does not apply.
export function applyBlurFilters(list: { node: DisplayObject; filter: BlurFilter }[]): void {
  for (const { node, filter } of list) {
    const image = (node as Bitmap).data.image;
    if (image === null || image.src === null) continue;

    computeNodeBoundsRectangle(_bounds, node, node);
    const padding = blurPadding(filter);
    const { width: w, height: h } = computeRenderTargetSize(_bounds, padding, 1, 1);

    const cache = createRenderCache();
    useRenderCache(state, node, cache);
    const target = ensureCanvasRenderCacheTarget(state, cache, w, h);

    const ctx = target.context;
    ctx.clearRect(0, 0, target.canvas.width, target.canvas.height);
    ctx.imageSmoothingEnabled = true;
    // computeBlurFilterCSS returns null for anisotropic blur (blurX !== blurY); fall back to no blur.
    ctx.filter = computeBlurFilterCSS(filter) ?? 'none';
    ctx.drawImage(image.src, padding - _bounds.x, padding - _bounds.y);
    ctx.filter = 'none';

    computeRenderCacheTransform(cache.transform, _bounds, padding, padding);
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
