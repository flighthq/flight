import { applyGaussianBlurFilterToWebGL, clearWebGLFilterTarget } from '@flighthq/filters-webgl';
import type { DisplayObject } from '@flighthq/sdk';
import {
  beginWebGLRenderTarget,
  BitmapKind,
  copyMatrix,
  createMatrix,
  createRenderCache,
  createWebGLCacheState,
  createWebGLRenderState,
  createWebGLRenderTarget,
  defaultWebGLBitmapRenderer,
  defaultWebGLShapeCommands,
  defaultWebGLShapeRenderer,
  defaultWebGLTextRenderer,
  destroyWebGLRenderTarget,
  enableWebGLRenderCache,
  endWebGLRenderTarget,
  ensureWebGLRenderCacheTarget,
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
enableWebGLRenderCache(state);
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

// WebGL has no CSS filter. Bake the panel into a "sharp" render cache, then blur that into a
// separate "blurred" cache — the one composited in place of the node. Two caches are required
// because the blur composites over its destination (premultiplied OVER): blurring in place would
// leave the sharp bake showing through underneath. Returns a callback that re-bakes on resize.
export function applyBackgroundBlur(node: DisplayObject): () => void {
  const blurred = createRenderCache();
  useRenderCache(state, node, blurred);
  const sharp = createRenderCache();
  const cacheState = createWebGLCacheState(state);
  // Force a full re-bake on every refresh — the panel's own revisions do not change on resize.
  cacheState.sceneGraphSyncPolicy = 'refreshDerivedState';

  const refresh = (): void => {
    refreshWebGLRenderCache(cacheState, sharp, node, { padding: 30 });
    const src = getWebGLRenderCacheTarget(state, sharp);
    if (src === null) return;
    const out = ensureWebGLRenderCacheTarget(state, blurred, src.width, src.height);
    const temp = createWebGLRenderTarget(state, src.width, src.height);
    // Run inside a render-target bracket so endWebGLRenderTarget rebinds the screen framebuffer the
    // next render() draws into; clear the output first since the blur composites over it.
    beginWebGLRenderTarget(state, out, createMatrix());
    clearWebGLFilterTarget(state, out);
    applyGaussianBlurFilterToWebGL(state, src, out, temp, { blurX: 10, blurY: 10 });
    endWebGLRenderTarget(state);
    destroyWebGLRenderTarget(state, temp);
    copyMatrix(blurred.transform, sharp.transform);
  };
  refresh();
  return refresh;
}
