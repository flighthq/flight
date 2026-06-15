import { applyGaussianBlurFilterToWebGPU, clearWebGPUFilterTarget } from '@flighthq/filters-webgpu';
import type { DisplayObject, RenderCache, WebGPURenderState, WebGPURenderTarget } from '@flighthq/sdk';
import {
  beginWebGPURenderTarget,
  BitmapKind,
  computeNodeBoundsRectangle,
  computeRenderCacheTransform,
  createMatrix,
  createRectangle,
  createRenderCache,
  createWebGPUCacheState,
  createWebGPURenderState,
  createWebGPURenderTarget,
  defaultWebGPUBitmapRenderer,
  defaultWebGPUShapeCommands,
  defaultWebGPUShapeRenderer,
  defaultWebGPUTextRenderer,
  enableWebGPURenderCache,
  endWebGPURenderTarget,
  ensureWebGPURenderCacheTarget,
  getWebGPURenderCacheTarget,
  invalidateNodeLocalTransform,
  prepareDisplayObjectRender,
  refreshWebGPURenderCache,
  registerRenderer,
  registerWebGPUShapeCommands,
  renderWebGPUBackground,
  renderWebGPUDisplayObject,
  resizeWebGPURenderTarget,
  ShapeKind,
  submitWebGPURenderPass,
  TextKind,
  useRenderCache,
} from '@flighthq/sdk';

// Padding the blur halo spreads into; shared by the pre-prepare transform and the pixel bake
// so the cache placement and the baked target agree. Set above the σ=10 Gaussian radius (3σ=30)
// so the tail fades out instead of being clipped at the target edge.
const BLUR_PADDING = 38;

const pixelRatio = window.devicePixelRatio || 1;
const canvas = document.createElement('canvas');
canvas.width = window.innerWidth * pixelRatio;
canvas.height = window.innerHeight * pixelRatio;
canvas.style.width = `${window.innerWidth}px`;
canvas.style.height = `${window.innerHeight}px`;
document.body.appendChild(canvas);

export const container = canvas;
export const state = await createWebGPURenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0x000000ff,
});
registerRenderer(state, BitmapKind, defaultWebGPUBitmapRenderer);
registerRenderer(state, ShapeKind, defaultWebGPUShapeRenderer);
registerRenderer(state, TextKind, defaultWebGPUTextRenderer);
registerWebGPUShapeCommands(defaultWebGPUShapeCommands);
enableWebGPURenderCache(state);
export const scale = pixelRatio;

export function setSize(w: number, h: number): void {
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

export function render(root: DisplayObject): void {
  // The blurred cache's placement transform is pure math (bounds + padding), independent of the
  // GPU bake. It must be set BEFORE prepare: the render-cache adapter folds cache.transform into
  // the panel's composite matrix during the prepare/adapt pass, and the panel never invalidates
  // on its own — so if we wrote the transform during the bake (which runs after prepare), prepare
  // would fold a stale identity and the composite would be misplaced. Set it here and invalidate
  // the panel so this frame's adapt re-folds the current value.
  prepareBlurTransform();
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGPUBackground(state);
  // WebGPU records into a per-frame command encoder, so — unlike WebGL — the pixels must be baked
  // inside the frame (after renderWebGPUBackground opens the encoder), not at setup.
  bakeBackgroundBlur();
  renderWebGPUDisplayObject(state, root);
  submitWebGPURenderPass(state);
}

// Mirrors render.webgl.ts (sharp cache blurred into the composited cache), but defers the bake to
// within render(). Returns a callback that flags a re-bake — call it on resize.
export function applyBackgroundBlur(node: DisplayObject): () => void {
  _blurNode = node;
  _blurredCache = createRenderCache();
  useRenderCache(state, node, _blurredCache);
  _sharpCache = createRenderCache();
  _blurCacheState = createWebGPUCacheState(state);
  // Force a full re-bake on every refresh — the panel's own revisions do not change on resize.
  _blurCacheState.sceneGraphSyncPolicy = 'refreshDerivedState';
  _needsBlurBake = true;
  return () => {
    _needsBlurBake = true;
  };
}

// Sets the blurred cache's placement transform (and forces the panel's adapt fold to re-run this
// frame) before the prepare pass consumes it. Pure CPU math — no GPU work, safe before the encoder
// opens. Does not clear _needsBlurBake; the pixel bake below owns that.
function prepareBlurTransform(): void {
  if (!_needsBlurBake || _blurNode === null || _blurredCache === null) return;
  computeNodeBoundsRectangle(_bounds, _blurNode, _blurNode);
  computeRenderCacheTransform(_blurredCache.transform, _bounds, BLUR_PADDING, BLUR_PADDING);
  // The panel never invalidates on its own (its revisions don't change on resize), so without this
  // the prepare/adapt pass would skip it and keep a stale composite transform.
  invalidateNodeLocalTransform(_blurNode);
}

function bakeBackgroundBlur(): void {
  if (
    !_needsBlurBake ||
    _blurNode === null ||
    _blurredCache === null ||
    _sharpCache === null ||
    _blurCacheState === null
  ) {
    return;
  }
  _needsBlurBake = false;

  // Bake the panel into the sharp cache, then blur it into the composited cache. The blur runs
  // after refreshWebGPURenderCache returns: refresh hands the live encoder and the resumed canvas
  // pass back to the screen state, and leaves the sharp target readable. We only blur when the
  // refresh actually re-baked (its return value), and wrap the blur in a render-target bracket —
  // the blur functions leave no active pass, so the bracket restores the canvas pass that the
  // subsequent renderWebGPUDisplayObject draws into. The cache's placement transform is set
  // earlier by prepareBlurTransform().
  if (!refreshWebGPURenderCache(_blurCacheState, _sharpCache, _blurNode, { padding: BLUR_PADDING })) return;

  const src = getWebGPURenderCacheTarget(state, _sharpCache);
  if (src === null) return;
  const out = ensureWebGPURenderCacheTarget(state, _blurredCache, src.width, src.height);
  // Reuse one persistent scratch target — destroying it would free a texture still referenced by
  // the not-yet-submitted command encoder ("destroyed texture used in a submit").
  if (_blurTemp === null) {
    _blurTemp = createWebGPURenderTarget(state, src.width, src.height);
  } else if (_blurTemp.width !== src.width || _blurTemp.height !== src.height) {
    resizeWebGPURenderTarget(state, _blurTemp, src.width, src.height);
  }

  beginWebGPURenderTarget(state, out, _identity);
  clearWebGPUFilterTarget(state, out);
  applyGaussianBlurFilterToWebGPU(state, src, out, _blurTemp, { blurX: 10, blurY: 10 });
  endWebGPURenderTarget(state);
}

let _blurNode: DisplayObject | null = null;
let _blurredCache: RenderCache | null = null;
let _sharpCache: RenderCache | null = null;
let _blurCacheState: WebGPURenderState | null = null;
let _blurTemp: WebGPURenderTarget | null = null;
let _needsBlurBake = false;
const _bounds = createRectangle();
const _identity = createMatrix();
