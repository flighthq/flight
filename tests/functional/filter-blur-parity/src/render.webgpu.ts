// WebGPU backend of the blur-parity test.
//
// Native path: the real WebGPU blur is the separable Gaussian shader (applyGaussianBlurFilterToWebGPU)
// run over offscreen WebGPURenderTargets, then composited onto the screen via drawWebGPURenderTargetResult
// — the WebGPU mirror of render.webgl.ts. Two WebGPU-specific concerns:
//   1. Single command encoder: all GPU work (the offscreen target passes + the final composite) must run
//      between renderWebGPUBackground (opens the frame's encoder) and submitWebGPURenderPass (submits it).
//   2. Y-flip: drawWebGPURenderTargetResult composites with a V-flip (expects WebGL bottom-left UV
//      origin), so the source is rendered into its target with a baked vertical flip (d=-1, ty=size) on
//      the node's render-proxy transform, exactly as the reference openfl-functional-blur webgpu column.
import type { Bitmap, BlurFilter, DisplayObject, Matrix, WebGPURenderState, WebGPURenderTarget } from '@flighthq/sdk';
import {
  applyGaussianBlurFilterToWebGPU,
  beginWebGPURenderTarget,
  BitmapKind,
  createBitmap,
  createMatrix,
  createWebGPUCanvasElement,
  createWebGPURenderState,
  createWebGPURenderTarget,
  defaultWebGPUBitmapRenderer,
  destroyWebGPURenderTarget,
  drawWebGPURenderTargetResult,
  enableWebGPUFrameCapture,
  endWebGPURenderTarget,
  getRenderProxy2D,
  prepareDisplayObjectRender,
  registerDefaultWebGPUMaterial,
  registerRenderer,
  renderWebGPUBackground,
  renderWebGPUDisplayObject,
  submitWebGPURenderPass,
} from '@flighthq/sdk';

import { registerFunctionalTarget } from '../../_harness/verify';
import type { NativeBlurSpec, ParityTarget } from './parity';

export async function createParityTarget(width: number, height: number, background: number): Promise<ParityTarget> {
  const pixelRatio = window.devicePixelRatio || 1;
  const canvas = createWebGPUCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const state = await createWebGPURenderState(canvas, { pixelRatio, backgroundColor: background });
  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);
  registerDefaultWebGPUMaterial(state);
  registerRenderer(state, BitmapKind, defaultWebGPUBitmapRenderer);
  // Frame capture lets the verifier read the rendered frame back from the GPU (no canvas presentation).
  enableWebGPUFrameCapture(state);

  registerFunctionalTarget({
    kind: 'webgpu',
    state,
    width,
    height,
    scale: pixelRatio,
    render: (root: DisplayObject) => renderFrame(state, root, []),
  });

  const pending: NativeBlurSpec[] = [];

  return {
    kind: 'webgpu',
    width,
    height,
    scale: pixelRatio,
    // No CSS-filter path on WebGPU — the blur is the GPU shader pass below.
    applyNativeBlur(_node: Bitmap, _filter: Readonly<BlurFilter>): void {},
    drawNativeBlur(spec: Readonly<NativeBlurSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderFrame(state, root, pending);
      pending.length = 0;
    },
  };
}

// One WebGPU frame: open the encoder, draw the scene (reference + native bitmaps), composite each native
// blur (offscreen render → blur → composite), then submit. All passes share the one encoder.
function renderFrame(state: WebGPURenderState, root: DisplayObject, specs: readonly NativeBlurSpec[]): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGPUBackground(state);
  renderWebGPUDisplayObject(state, root);
  // The offscreen targets are referenced by recorded passes in the frame's encoder, so they can only be
  // destroyed after submitWebGPURenderPass submits — WebGPU defers submission to the end of the frame.
  const toDestroy: WebGPURenderTarget[] = [];
  for (const spec of specs) compositeNativeBlur(state, spec, toDestroy);
  submitWebGPURenderPass(state);
  for (const target of toDestroy) destroyWebGPURenderTarget(state, target);
}

function compositeNativeBlur(
  state: WebGPURenderState,
  spec: Readonly<NativeBlurSpec>,
  toDestroy: WebGPURenderTarget[],
): void {
  const size = spec.tile;

  const sourceBitmap = createBitmap();
  sourceBitmap.data.image = spec.source;
  sourceBitmap.data.smoothing = false;
  sourceBitmap.x = 0;
  sourceBitmap.y = 0;

  const sourceTarget = createWebGPURenderTarget(state, size, size);
  const destTarget = createWebGPURenderTarget(state, size, size);
  const tempTarget = createWebGPURenderTarget(state, size, size);

  // Render the source into its target with a baked vertical flip (bottom-left origin for the composite).
  prepareDisplayObjectRender(state, sourceBitmap);
  const sourceProxy = getRenderProxy2D(state, sourceBitmap);
  if (sourceProxy !== undefined) setFlippedTransform(sourceProxy.transform2D, 0, 0, size);

  beginWebGPURenderTarget(state, sourceTarget, _identity);
  renderWebGPUDisplayObject(state, sourceBitmap);
  applyGaussianBlurFilterToWebGPU(state, sourceTarget, destTarget, tempTarget, {
    blurX: spec.blurX,
    blurY: spec.blurY,
  });
  endWebGPURenderTarget(state);

  // Composite the blurred TILE×TILE target at the native tile position. The placement node carries the
  // world×device transform; drawWebGPURenderTargetResult V-flips back to upright.
  const placement = createBitmap();
  placement.x = spec.x;
  placement.y = spec.y;
  prepareDisplayObjectRender(state, placement);
  const placementProxy = getRenderProxy2D(state, placement);
  if (placementProxy !== undefined) drawWebGPURenderTargetResult(state, placementProxy, destTarget, _identity);

  toDestroy.push(sourceTarget, destTarget, tempTarget);
}

// Maps node-local (lx, ly) → target pixel (lx + tx0, size - (ly + ty0)) — content-origin translation with
// a vertical flip so the visual top lands in the last texture rows.
function setFlippedTransform(out: Matrix, tx0: number, ty0: number, size: number): void {
  out.a = 1;
  out.b = 0;
  out.c = 0;
  out.d = -1;
  out.tx = tx0;
  out.ty = size - ty0;
}

const _identity = createMatrix();
