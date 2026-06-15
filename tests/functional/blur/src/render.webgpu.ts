import type { BlurFilter } from '@flighthq/filters';
import { applyGaussianBlurFilterToWebGPU, clearWebGPUFilterTarget } from '@flighthq/filters-webgpu';
import type { DisplayObject, Matrix, WebGPURenderTarget } from '@flighthq/sdk';
import {
  beginWebGPURenderTarget,
  BitmapKind,
  computeBoundsRectangle,
  computeImageRenderCacheTransform,
  computeRenderTargetSize,
  copyMatrix,
  createMatrix,
  createRectangle,
  createWebGPUCanvasElement,
  createWebGPURenderState,
  createWebGPURenderTarget,
  defaultWebGPUBitmapRenderer,
  drawWebGPURenderTargetResult,
  endWebGPURenderTarget,
  getDisplayObjectRenderNode,
  prepareDisplayObjectRender,
  registerRenderer,
  renderWebGPUBackground,
  renderWebGPUDisplayObject,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGPUCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, {
  backgroundColor: 0xffffffff,
});
registerRenderer(state, BitmapKind, defaultWebGPUBitmapRenderer);
export const scale = pixelRatio;
export const width = 800;
export const height = 400;

// WebGPU offscreen filter path: render each node into a WebGPURenderTarget at its
// logical size, run the separable Gaussian-blur passes (applyGaussianBlurFilterToWebGPU,
// target → target), then composite the blurred target back onto the screen via
// drawWebGPURenderTargetResult. Targets are allocated once and reused.
//
// WebGPU render targets use a "bottom-left origin" convention so that
// drawWebGPURenderTargetResult's V-flip (v0=1, v1=0) composites them upright. We achieve
// this by rendering into the target with a Y-inverted render transform: scene y=0 (top)
// maps to NDC y=-1 (bottom), which WebGPU stores at the last texture row (UV y=1=top
// in the bottom-left convention). The Y-inversion matrix for a target of height h is
// { a:1, b:0, c:0, d:-1, tx:0, ty:h }.
type BlurEntry = {
  node: DisplayObject;
  filter: Readonly<BlurFilter>;
  source: WebGPURenderTarget;
  blurred: WebGPURenderTarget;
  scratch: WebGPURenderTarget;
  cacheTransform: Matrix;
  sceneTransform: Matrix;
  yInvertedTransform: Matrix;
};

export function applyBlurFilters(list: { node: DisplayObject; filter: BlurFilter }[]): void {
  for (const { node, filter } of list) {
    computeBoundsRectangle(_bounds, node, node);
    const { width: w, height: h } = computeRenderTargetSize(_bounds, blurPadding(filter), 1, 1);
    const yInv = createMatrix();
    yInv.a = 1;
    yInv.b = 0;
    yInv.c = 0;
    yInv.d = -1;
    yInv.tx = 0;
    yInv.ty = h;
    _entries.push({
      node,
      filter,
      source: createWebGPURenderTarget(state, w, h),
      blurred: createWebGPURenderTarget(state, w, h),
      scratch: createWebGPURenderTarget(state, w, h),
      cacheTransform: createMatrix(),
      sceneTransform: createMatrix(),
      yInvertedTransform: yInv,
    });
  }
}

export function render(root: DisplayObject): void {
  // One prepare pass builds the render nodes and their scene transforms. Capture each
  // blurred node's scene transform before the offscreen pass overwrites transform2D.
  prepareDisplayObjectRender(state, root);
  for (const entry of _entries) {
    const renderNode = getDisplayObjectRenderNode(state, entry.node);
    if (renderNode !== undefined) copyMatrix(entry.sceneTransform, renderNode.transform2D);
  }

  // Offscreen: render + blur each node into its own target.
  for (const entry of _entries) {
    const { node, filter, source, blurred, scratch } = entry;
    const padding = blurPadding(filter);
    computeBoundsRectangle(_bounds, node, node);
    computeImageRenderCacheTransform(entry.cacheTransform, _bounds, padding, padding);

    const renderNode = getDisplayObjectRenderNode(state, node);
    if (renderNode === undefined) continue;

    // Translate the node to render-target space (origin at padding offset from bounds).
    setTranslation(renderNode.transform2D, padding - _bounds.x, padding - _bounds.y);

    // Use the Y-inverted render transform so the render target uses bottom-left UV
    // convention, which drawWebGPURenderTargetResult's V-flip expects.
    beginWebGPURenderTarget(state, source, entry.yInvertedTransform);
    clearWebGPUFilterTarget(state, source);
    renderWebGPUDisplayObject(state, node);
    // Apply the blur while the render target is active. Filter passes manage their own
    // render passes; endWebGPURenderTarget restores the main canvas pass afterward.
    applyGaussianBlurFilterToWebGPU(state, source, blurred, scratch, filter);
    endWebGPURenderTarget(state);
  }

  // Main pass: composite blurred targets back onto the canvas.
  renderWebGPUBackground(state);
  for (const entry of _entries) {
    const renderNode = getDisplayObjectRenderNode(state, entry.node);
    if (renderNode === undefined) continue;
    copyMatrix(renderNode.transform2D, entry.sceneTransform);
    drawWebGPURenderTargetResult(state, renderNode, entry.blurred, entry.cacheTransform);
  }
}

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
