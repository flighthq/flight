import { applyGaussianBlurFilterToWebGL } from '@flighthq/filters-webgl';
import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createRenderCache,
  createWebGLCacheState,
  createWebGLRenderState,
  createWebGLRenderTarget,
  defaultWebGLBitmapRenderer,
  defaultWebGLShapeCommands,
  defaultWebGLShapeRenderer,
  defaultWebGLTextRenderer,
  destroyWebGLRenderTarget,
  getWebGLRenderCacheTarget,
  prepareDisplayObjectRender,
  refreshWebGLRenderCache,
  registerRenderer,
  registerWebGLShapeCommands,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  ShapeKind,
  TextKind,
  useRenderCache,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = document.createElement('canvas');
canvas.width = window.innerWidth * pixelRatio;
canvas.height = window.innerHeight * pixelRatio;
canvas.style.width = `${window.innerWidth}px`;
canvas.style.height = `${window.innerHeight}px`;
document.body.appendChild(canvas);

export const container = canvas;
export const state = createWebGLRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0x000000ff,
});
registerRenderer(state, BitmapKind, defaultWebGLBitmapRenderer);
registerRenderer(state, ShapeKind, defaultWebGLShapeRenderer);
registerRenderer(state, TextKind, defaultWebGLTextRenderer);
registerWebGLShapeCommands(defaultWebGLShapeCommands);
export const scale = pixelRatio;

export function setSize(w: number, h: number): void {
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}

// WebGL has no CSS filter; bake the static panel into a render cache once, blur the cached
// texture with the offscreen Gaussian filter, then composite it each frame in place of the node.
export function applyBackgroundBlur(node: DisplayObject): void {
  const cache = createRenderCache();
  useRenderCache(state, node, cache);
  const cacheState = createWebGLCacheState(state);
  refreshWebGLRenderCache(cacheState, cache, node, { padding: 30 });
  const target = getWebGLRenderCacheTarget(state, cache);
  if (target === null) return;
  const temp = createWebGLRenderTarget(state, target.width, target.height);
  applyGaussianBlurFilterToWebGL(state, target, target, temp, { blurX: 10, blurY: 10 });
  destroyWebGLRenderTarget(state, temp);
}
