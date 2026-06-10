import type { BitmapFilter } from '@flighthq/filters';
import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createWebGLElement,
  createWebGLRenderState,
  defaultWebGLBitmapRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLDisplayObject,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0xffffffff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, BitmapKind, defaultWebGLBitmapRenderer);
export const scale = pixelRatio;
export const width = 800;
export const height = 400;

export function applyFilters(_list: { node: DisplayObject; filter: BitmapFilter }[]): void {
  // WebGL has no CSS filter binding. It realizes a blur via the offscreen filter path:
  // render the node to a WebGLRenderTarget, applyWebGLBlurFilter (with caller-provided
  // scratch via webglFilterScratchCount), then draw the result back as an image cache.
  // Not wired in this demo — the WebGL view shows the bitmaps unfiltered.
}

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}
