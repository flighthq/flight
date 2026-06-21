// WebGPU backend of the filter-outer-glow-parity test. Mechanical port of render.webgl.ts to the WebGPU offscreen-filter
// flow (see filter-blur-parity/render.webgl.ts for the annotated reference): render the source into an
// offscreen target with a baked vertical flip, run applyOuterGlowFilterToWebGPU over offscreen targets, then composite the
// result at the native tile via drawWebGPURenderTargetResult. All GPU work runs inside the single frame
// encoder (renderWebGPUBackground → submitWebGPURenderPass); the offscreen targets are destroyed only
// AFTER submit (the encoder still references them). NOTE: generated without capture validation.
import type { DisplayObject, Matrix, WebGPURenderState, WebGPURenderTarget } from '@flighthq/sdk';
import {
  applyOuterGlowFilterToWebGPU,
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
import type { NativeGlowSpec, ParityTarget } from './parity';

export async function createParityTarget(width: number, height: number, background: number): Promise<ParityTarget> {
  const pixelRatio = window.devicePixelRatio || 1;
  const canvas = createWebGPUCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const state = await createWebGPURenderState(canvas, { pixelRatio, backgroundColor: background });
  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);
  registerDefaultWebGPUMaterial(state);
  registerRenderer(state, BitmapKind, defaultWebGPUBitmapRenderer);
  enableWebGPUFrameCapture(state);

  registerFunctionalTarget({
    kind: 'webgpu',
    state,
    width,
    height,
    scale: pixelRatio,
    render: (root: DisplayObject) => renderFrame(state, root, []),
  });

  const pending: NativeGlowSpec[] = [];

  return {
    kind: 'webgpu',
    width,
    height,
    scale: pixelRatio,
    applyNativeGlow(): void {},
    drawNativeGlow(spec: Readonly<NativeGlowSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderFrame(state, root, pending);
      pending.length = 0;
    },
  };
}

function renderFrame(state: WebGPURenderState, root: DisplayObject, specs: readonly NativeGlowSpec[]): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGPUBackground(state);
  renderWebGPUDisplayObject(state, root);
  const toDestroy: WebGPURenderTarget[] = [];
  for (const spec of specs) compositeNative(state, spec, toDestroy);
  submitWebGPURenderPass(state);
  for (const target of toDestroy) destroyWebGPURenderTarget(state, target);
}

function compositeNative(
  state: WebGPURenderState,
  spec: Readonly<NativeGlowSpec>,
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
  const scratch0 = createWebGPURenderTarget(state, size, size);
  const scratch1 = createWebGPURenderTarget(state, size, size);
  const scratch2 = createWebGPURenderTarget(state, size, size);

  prepareDisplayObjectRender(state, sourceBitmap);
  const sourceProxy = getRenderProxy2D(state, sourceBitmap);
  if (sourceProxy !== undefined) setFlippedTransform(sourceProxy.transform2D, size);

  beginWebGPURenderTarget(state, sourceTarget, _identity);
  renderWebGPUDisplayObject(state, sourceBitmap);
  applyOuterGlowFilterToWebGPU(state, sourceTarget, destTarget, [scratch0, scratch1, scratch2], {
    color: spec.filter.color,
    alpha: spec.filter.alpha,
    blurX: spec.filter.blurX,
    blurY: spec.filter.blurY,
    strength: spec.filter.strength,
    quality: spec.filter.quality,
    knockout: spec.filter.knockout,
  });
  endWebGPURenderTarget(state);

  const placement = createBitmap();
  placement.x = spec.x;
  placement.y = spec.y;
  prepareDisplayObjectRender(state, placement);
  const placementProxy = getRenderProxy2D(state, placement);
  if (placementProxy !== undefined) drawWebGPURenderTargetResult(state, placementProxy, destTarget, _identity);

  toDestroy.push(sourceTarget, destTarget, scratch0, scratch1, scratch2);
}

function setFlippedTransform(out: Matrix, size: number): void {
  out.a = 1;
  out.b = 0;
  out.c = 0;
  out.d = -1;
  out.tx = 0;
  out.ty = size;
}

const _identity = createMatrix();
