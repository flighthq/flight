import type { BlurFilter } from '@flighthq/filters';
import { applyGaussianBlurFilterToWebGPU } from '@flighthq/filters-webgpu';
import type { DisplayObject, Matrix, WebGPURenderTarget } from '@flighthq/sdk';
import {
  beginWebGPURenderTarget,
  BitmapKind,
  computeNodeBoundsRectangle,
  computeRenderCacheTransform,
  computeRenderTargetSize,
  copyMatrix,
  createMatrix,
  createRectangle,
  createWebGPUCanvasElement,
  createWebGPURenderState,
  createWebGPURenderTarget,
  defaultWebGPUBitmapRenderer,
  defaultWebGPURichTextRenderer,
  defaultWebGPUShapeCommands,
  defaultWebGPUShapeRenderer,
  drawWebGPURenderTargetResult,
  endWebGPURenderTarget,
  getRenderProxy2D,
  prepareDisplayObjectRender,
  registerDefaultWebGPUMaterial,
  registerRenderer,
  registerWebGPUShapeCommands,
  renderWebGPUBackground,
  renderWebGPUDisplayObject,
  RichTextKind,
  ShapeKind,
  submitWebGPURenderPass,
} from '@flighthq/sdk';

import { registerWebGPUFunctionalTarget } from '../../../../functional/_harness/verify';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGPUCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, {
  pixelRatio,
  backgroundColor: 0xffffffff,
});
registerRenderer(state, BitmapKind, defaultWebGPUBitmapRenderer);
registerRenderer(state, ShapeKind, defaultWebGPUShapeRenderer);
registerWebGPUShapeCommands(defaultWebGPUShapeCommands);
registerRenderer(state, RichTextKind, defaultWebGPURichTextRenderer);
registerDefaultWebGPUMaterial(state);
export const scale = pixelRatio;
export const width = 800;
export const height = 400;

// WebGPU offscreen filter path: render each node into a WebGPURenderTarget at its logical
// size, run the separable Gaussian-blur passes (applyGaussianBlurFilterToWebGPU, target →
// target), then composite the blurred target back onto the screen via
// drawWebGPURenderTargetResult. Targets are allocated once and reused.
//
// Y-axis convention: drawWebGPURenderTargetResult composites with a V-flip (v0=1, v1=0),
// expecting render targets in WebGL's bottom-left UV origin — i.e. the visual top of the
// content stored in the *last* texture rows. WebGPU textures are top-left origin, so we bake
// a vertical flip directly into the node's render transform (d=-1, ty=h) when drawing into
// the target. The flip must live in renderProxy.transform2D, not in the renderTransform passed
// to beginWebGPURenderTarget: the WebGPU quad shader builds its matrix from transform2D alone
// and ignores state.renderTransform2D at draw time.
type BlurEntry = {
  node: DisplayObject;
  filter: Readonly<BlurFilter>;
  source: WebGPURenderTarget;
  blurred: WebGPURenderTarget;
  scratch: WebGPURenderTarget;
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
      source: createWebGPURenderTarget(state, w, h),
      blurred: createWebGPURenderTarget(state, w, h),
      scratch: createWebGPURenderTarget(state, w, h),
      cacheTransform: createMatrix(),
      sceneTransform: createMatrix(),
    });
  }
}

export function render(root: DisplayObject): void {
  // One prepare pass builds the render nodes and their scene transforms. Capture each
  // blurred node's scene transform before the offscreen pass overwrites transform2D.
  prepareDisplayObjectRender(state, root);
  for (const entry of _entries) {
    const renderProxy = getRenderProxy2D(state, entry.node);
    if (renderProxy !== undefined) copyMatrix(entry.sceneTransform, renderProxy.transform2D);
  }

  // Unlike WebGL (immediate-mode, implicit submission), WebGPU records all GPU work into a
  // single command encoder created by renderWebGPUBackground and flushed by
  // submitWebGPURenderPass. The offscreen target passes and the final composite must all run
  // between those two calls. Within one command buffer, passes execute in submission order,
  // so each blurred target is fully written before the composite samples it.
  renderWebGPUBackground(state);

  // Offscreen: render + blur each node into its own target. beginWebGPURenderTarget begins the
  // target pass with loadOp 'clear' (so the target starts transparent — no separate clear is
  // needed) and endWebGPURenderTarget resumes the canvas pass with loadOp 'load', preserving
  // the cleared background.
  for (const entry of _entries) {
    const { node, filter, source, blurred, scratch } = entry;
    const padding = blurPadding(filter);
    computeNodeBoundsRectangle(_bounds, node, node);
    const { height: h } = computeRenderTargetSize(_bounds, padding, 1, 1);
    computeRenderCacheTransform(entry.cacheTransform, _bounds, padding, padding);

    const renderProxy = getRenderProxy2D(state, node);
    if (renderProxy === undefined) continue;

    // Map the node into target space with a baked vertical flip (see header note).
    setFlippedTransform(renderProxy.transform2D, padding - _bounds.x, padding - _bounds.y, h);

    beginWebGPURenderTarget(state, source, _identity);
    renderWebGPUDisplayObject(state, node);
    applyGaussianBlurFilterToWebGPU(state, source, blurred, scratch, filter);
    endWebGPURenderTarget(state);
  }

  // Main pass: restore scene transforms, hide the blurred source nodes so the sharp originals
  // are not drawn (transparent images would show both sharp and blurred), render the full scene
  // (background shape + labels), then composite each blurred target and restore visibility.
  for (const entry of _entries) {
    const renderProxy = getRenderProxy2D(state, entry.node);
    if (renderProxy === undefined) continue;
    copyMatrix(renderProxy.transform2D, entry.sceneTransform);
    renderProxy.visible = false;
  }
  renderWebGPUDisplayObject(state, root);
  for (const entry of _entries) {
    const renderProxy = getRenderProxy2D(state, entry.node);
    if (renderProxy === undefined) continue;
    renderProxy.visible = true;
    drawWebGPURenderTargetResult(state, renderProxy, entry.blurred, entry.cacheTransform);
  }

  submitWebGPURenderPass(state);
}

function blurPadding(filter: Readonly<BlurFilter>): number {
  return Math.ceil(Math.max(filter.blurX ?? 4, filter.blurY ?? 4) * 2.5);
}

// Maps node-local (lx, ly) → target pixel (lx + tx0, h - (ly + ty0)): the standard
// content-origin translation with a vertical flip so the visual top lands in the last
// texture rows (WebGL bottom-left convention for drawWebGPURenderTargetResult).
function setFlippedTransform(out: Matrix, tx0: number, ty0: number, h: number): void {
  out.a = 1;
  out.b = 0;
  out.c = 0;
  out.d = -1;
  out.tx = tx0;
  out.ty = h - ty0;
}

const _entries: BlurEntry[] = [];
const _bounds = createRectangle();
const _identity = createMatrix();

registerWebGPUFunctionalTarget(state, scale);
