import type { BlurFilter } from '@flighthq/filters';
import { applyGaussianBlurFilterToWebGL, clearWebGLFilterTarget } from '@flighthq/filters-webgl';
import type { DisplayObject, Matrix, WebGLRenderTarget } from '@flighthq/sdk';
import {
  beginWebGLRenderTarget,
  BitmapKind,
  computeNodeBoundsRectangle,
  computeRenderCacheTransform,
  computeRenderTargetSize,
  copyMatrix,
  createMatrix,
  createRectangle,
  createWebGLCanvasElement,
  createWebGLRenderState,
  createWebGLRenderTarget,
  defaultWebGLBitmapRenderer,
  defaultWebGLRichTextRenderer,
  drawWebGLRenderTargetResult,
  endWebGLRenderTarget,
  getRenderProxy2D,
  prepareDisplayObjectRender,
  registerDefaultWebGLMaterial,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  RichTextKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0xffffffff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, BitmapKind, defaultWebGLBitmapRenderer);
registerRenderer(state, RichTextKind, defaultWebGLRichTextRenderer);
registerDefaultWebGLMaterial(state);
export const scale = pixelRatio;
export const width = 800;
export const height = 400;

// WebGL has no CSS filter binding, so it realizes the blur with the offscreen filter path:
// render each node into a WebGLRenderTarget at its logical size, run the separable box-blur
// passes (applyBlurFilterToWebGL, target → target), then composite the blurred target back
// onto the screen with drawWebGLRenderTargetResult. Targets are allocated once and reused.
//
// The composite applies the node's scene transform (which carries the stage's pixelRatio
// scale), so a Gaussian σ in target pixels lands on screen as σ CSS pixels — matching the
// canvas/DOM computeBlurFilterCSS paths.
type BlurEntry = {
  node: DisplayObject;
  filter: Readonly<BlurFilter>;
  source: WebGLRenderTarget;
  blurred: WebGLRenderTarget;
  scratch: WebGLRenderTarget;
  cacheTransform: Matrix;
  sceneTransform: Matrix;
};

export function applyBlurFilters(list: { node: DisplayObject; filter: BlurFilter }[]): void {
  for (const { node, filter } of list) {
    computeNodeBoundsRectangle(_bounds, node, node);
    const { width: w, height: h } = computeRenderTargetSize(_bounds, blurPadding(filter), 1, 1);
    _entries.push({
      node,
      filter,
      source: createWebGLRenderTarget(state, { width: w, height: h }),
      blurred: createWebGLRenderTarget(state, { width: w, height: h }),
      scratch: createWebGLRenderTarget(state, { width: w, height: h }),
      cacheTransform: createMatrix(),
      sceneTransform: createMatrix(),
    });
  }
}

export function render(root: DisplayObject): void {
  // One prepare pass builds the render nodes and their scene transforms. Capture each blurred
  // node's scene transform now — the offscreen pass below overwrites transform2D in place.
  prepareDisplayObjectRender(state, root);
  for (const entry of _entries) {
    const renderProxy = getRenderProxy2D(state, entry.node);
    if (renderProxy !== undefined) copyMatrix(entry.sceneTransform, renderProxy.transform2D);
  }

  // Offscreen: render + blur each node into its own target. We set the render node's transform
  // directly to a content-origin translation rather than re-preparing — prepare only recomputes
  // transforms for *dirty* nodes, and these are already clean, so a second prepare would leave
  // them at their scene position and miss the target entirely.
  for (const entry of _entries) {
    const { node, filter, source, blurred, scratch } = entry;
    const padding = blurPadding(filter);
    computeNodeBoundsRectangle(_bounds, node, node);
    computeRenderCacheTransform(entry.cacheTransform, _bounds, padding, padding);

    const renderProxy = getRenderProxy2D(state, node);
    if (renderProxy === undefined) continue;
    setTranslation(renderProxy.transform2D, padding - _bounds.x, padding - _bounds.y);

    beginWebGLRenderTarget(state, source, _identity);
    clearWebGLFilterTarget(state, source);
    renderWebGLDisplayObject(state, node);
    // The BlurFilter intent maps to a true Gaussian, matching the CSS blur() the DOM and Canvas
    // columns use. Run it while the render target is still active: the filter passes bind their
    // own framebuffers and never restore the previous one, so endWebGLRenderTarget must run after
    // them — it rebinds the screen framebuffer that the composite draws into.
    applyGaussianBlurFilterToWebGL(state, source, blurred, scratch, filter);
    endWebGLRenderTarget(state);
  }

  // Main pass: restore scene transforms, hide the blurred source nodes so the sharp originals are
  // not drawn into the scene (transparent images would otherwise show both sharp and blurred), draw
  // the rest of the tree (labels, background), then composite each blurred target and restore.
  for (const entry of _entries) {
    const renderProxy = getRenderProxy2D(state, entry.node);
    if (renderProxy === undefined) continue;
    copyMatrix(renderProxy.transform2D, entry.sceneTransform);
    renderProxy.visible = false;
  }
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
  for (const entry of _entries) {
    const renderProxy = getRenderProxy2D(state, entry.node);
    if (renderProxy === undefined) continue;
    renderProxy.visible = true;
    drawWebGLRenderTargetResult(state, renderProxy, entry.blurred, entry.cacheTransform);
  }
}

// Box blur of standard deviation σ spreads a few σ past the bounds; pad generously so the
// tail is not clipped at the target edge.
function blurPadding(filter: Readonly<BlurFilter>): number {
  return Math.ceil(Math.max(filter.blurX ?? 4, filter.blurY ?? 4) * 2.5);
}

function setTranslation(out: Matrix, tx: number, ty: number): void {
  out.a = 1;
  out.b = 0;
  out.c = 0;
  out.d = 1;
  out.tx = tx;
  out.ty = ty;
}

const _entries: BlurEntry[] = [];
const _bounds = createRectangle();
const _identity = createMatrix();
