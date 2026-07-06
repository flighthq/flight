import { applyGaussianBlurFilterToGl } from '@flighthq/filters-gl';
import type { DisplayObject } from '@flighthq/sdk';
import {
  beginGlRenderTarget,
  BitmapKind,
  clearGlRenderTarget,
  copyMatrix,
  createGlCacheState,
  createGlRenderState,
  createGlRenderTarget,
  createMatrix,
  createRenderCache,
  defaultGlBitmapRenderer,
  defaultGlBeginFill,
  defaultGlDrawRectangle,
  defaultGlEndFill,
  defaultGlShapeRenderer,
  defaultGlTextLabelRenderer,
  destroyGlRenderTarget,
  enableGlRenderCache,
  endGlRenderTarget,
  ensureGlRenderCacheTarget,
  getGlRenderCacheTarget,
  invalidateNodeLocalTransform,
  prepareDisplayObjectRender,
  refreshGlRenderCache,
  registerDefaultGlMaterial,
  registerGlShapeCommands,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
  ShapeKind,
  TextLabelKind,
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
export const state = createGlRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0x000000ff,
});
registerRenderer(state, BitmapKind, defaultGlBitmapRenderer);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);
registerGlShapeCommands([defaultGlBeginFill, defaultGlDrawRectangle, defaultGlEndFill]);
registerDefaultGlMaterial(state);
enableGlRenderCache(state);
export const scale = pixelRatio;

export function setSize(w: number, h: number): void {
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
}

// Gl has no CSS filter. Bake the panel into a "sharp" render cache, then blur that into a
// separate "blurred" cache — the one composited in place of the node. Two caches are required
// because the blur composites over its destination (premultiplied OVER): blurring in place would
// leave the sharp bake showing through underneath. Returns a callback that re-bakes on resize.
export function applyBackgroundBlur(node: DisplayObject): () => void {
  const blurred = createRenderCache();
  useRenderCache(state, node, blurred);
  const sharp = createRenderCache();
  const cacheState = createGlCacheState(state);
  // Force a full re-bake on every refresh — the panel's own revisions do not change on resize.
  cacheState.sceneGraphSyncPolicy = 'refreshDerivedState';

  const refresh = (): void => {
    refreshGlRenderCache(cacheState, sharp, node, { padding: 30 });
    const src = getGlRenderCacheTarget(state, sharp);
    if (src === null) return;
    const out = ensureGlRenderCacheTarget(state, blurred, src.width, src.height);
    const temp = createGlRenderTarget(state, { width: src.width, height: src.height });
    // Run inside a render-target bracket so endGlRenderTarget rebinds the screen framebuffer the
    // next render() draws into; clear the output first since the blur composites over it.
    beginGlRenderTarget(state, out, createMatrix());
    clearGlRenderTarget(state, out);
    applyGaussianBlurFilterToGl(state, src, out, temp, { blurX: 10, blurY: 10 });
    endGlRenderTarget(state);
    destroyGlRenderTarget(state, temp);
    copyMatrix(blurred.transform, sharp.transform);
    // The panel never invalidates on its own (its revisions do not change on resize), so the
    // prepare/adapt pass would otherwise skip it and keep folding the previous layout's placement
    // transform into the composite — leaving the blurred panel stale/offset from the re-laid-out
    // scene. Force the adapt fold to re-run with the new transform on the next prepare. Mirrors the
    // prepareBlurTransform()/invalidateNodeLocalTransform() step the Wgpu backend documents.
    invalidateNodeLocalTransform(node);
  };
  refresh();
  return refresh;
}
