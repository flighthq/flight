import {
  bakeColorLutForRun,
  createColorLutCache,
  fuseColorMatrices,
  getAdjustmentColorMatrix,
  isColorLutAdjustment,
} from '@flighthq/adjustments/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  beginCanvasRenderPass,
  createCanvasTextureRenderTarget,
  endCanvasRenderPass,
  getCanvasActiveRenderPass,
  getCanvasSurfaceCreator,
  resizeCanvasTextureRenderTarget,
} from '@flighthq/scene2d-canvas/contract';
import type {
  Adjustment,
  CanvasRenderEffectPipeline,
  CanvasRenderPass,
  CanvasRenderState,
  CanvasRenderSurfaceCreator,
  CanvasTextureRenderTarget,
  CanvasRenderTargetPool,
  RenderEffect,
  RenderEffectPipelineOptions,
  RenderTargetClear,
  EntityConstruction,
} from '@flighthq/types/contract';

import { applyColorLutPassToCanvas } from './canvasColorLutPass';
import { applyColorMatrixPassToCanvas } from './canvasColorMatrixPass';
import { drawCanvasEffectPass } from './canvasEffectCompositing';
import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';

// Opt-in Canvas 2D post-process pipeline — the parallel of the Gl effect pipeline. The scene renders
// into the pipeline's offscreen canvas between begin/end; end runs the agnostic effect list through the
// per-state registry, ping-ponging pooled offscreen canvases via ctx.filter / draw-op compositing, then
// presents the result to the main canvas. The default render loop imports none of this. The effect list
// is per-frame data; only the scene target and pool are retained. `options.sampleCount`/`format`/`depth`
// are accepted for parity with the Gl pipeline but have no Canvas 2D realization and are ignored.

// Acquires a scratch offscreen canvas from the pool sized to (width, height), or allocates one if none
// are free. Multi-pass effect recipes (bloom) borrow scratch canvases with this and return them with
// releaseCanvasRenderTarget. Every acquire must be matched by a release.
export function acquireCanvasRenderTarget(
  pool: CanvasRenderTargetPool,
  width: number,
  height: number,
): CanvasTextureRenderTarget {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const target = pool.free.pop() ?? createCanvasTextureRenderTarget(pool.creator, w, h);
  if (target.width !== w || target.height !== h) resizeCanvasTextureRenderTarget(target, w, h);
  pool.inUse.push(target);
  return target;
}

// `clear` is the scene target's clear, given explicitly: the background is what you clear to, a per-pass
// value, not a property the render state carries around. Returns the pass the scene draws into; the
// enclosing pass — the screen, ordinarily — is what the finished chain composites back onto.
export function beginCanvasRenderEffectPipeline(
  pass: CanvasRenderPass,
  pipeline: CanvasRenderEffectPipeline,
  clear: Readonly<RenderTargetClear> = { color: [0, 0, 0, 0] },
): CanvasRenderPass {
  const state = pass.state;
  const { height: h, width: w } = pass.viewport;

  if (pipeline.sceneTarget === null) {
    pipeline.sceneTarget = createCanvasTextureRenderTarget(getCanvasSurfaceCreator(state), w, h);
  } else {
    resizeCanvasTextureRenderTarget(pipeline.sceneTarget, w, h);
  }
  return beginCanvasRenderPass(state, pipeline.sceneTarget, clear);
}

export function createCanvasRenderEffectPipeline(
  state: CanvasRenderState,
  options: Readonly<RenderEffectPipelineOptions> = {},
): CanvasRenderEffectPipeline {
  const out = allocateEntity<CanvasRenderEffectPipeline>();
  initializeCanvasRenderEffectPipeline(out, state, options);
  return finishEntity(out);
}

export function createCanvasTextureRenderTargetPool(
  creator: Readonly<CanvasRenderSurfaceCreator>,
): CanvasRenderTargetPool {
  const out = allocateEntity<CanvasRenderTargetPool>();
  initializeCanvasRenderTargetPool(out, creator);
  return finishEntity(out);
}

export function destroyCanvasRenderEffectPipeline(
  _state: CanvasRenderState,
  pipeline: CanvasRenderEffectPipeline,
): void {
  // Canvas elements are plain GC-managed memory with no GPU handles to free; drop references so the
  // pool and scene canvas become eligible for collection.
  pipeline.sceneTarget = null;
  pipeline.pool.free.length = 0;
  pipeline.pool.inUse.length = 0;
  pipeline.lutCache.signature = null;
  pipeline.lutCache.lut = null;
}

export function endCanvasRenderEffectPipeline(
  scenePass: CanvasRenderPass,
  pipeline: CanvasRenderEffectPipeline,
  operations: ReadonlyArray<RenderEffect | Adjustment>,
): void {
  const state = scenePass.state;
  const scene = pipeline.sceneTarget;
  if (scene === null) return;

  endCanvasRenderPass(scenePass);

  const pool = pipeline.pool;
  let source: CanvasTextureRenderTarget = scene;
  let scratchA: CanvasTextureRenderTarget | null = null;
  let scratchB: CanvasTextureRenderTarget | null = null;
  // A maximal run of consecutive pointwise adjustments fuses into ONE pass: all matrix-tier → one 4×5
  // matrix (cheaper applyColorMatrixPass); any LUT-tier member → the whole run (matrices folded in) bakes
  // into one ColorLut (applyColorLutPass). An effect (or the end of the stack) breaks the run and flushes
  // it first, preserving stack order.
  let pending: Adjustment[] = [];

  const ensureScratch = (): void => {
    if (scratchA === null) scratchA = acquireCanvasRenderTarget(pool, scene.width, scene.height);
    if (scratchB === null) scratchB = acquireCanvasRenderTarget(pool, scene.width, scene.height);
  };
  const flushAdjustments = (): void => {
    if (pending.length === 0) return;
    ensureScratch();
    const dest = source === scratchA ? scratchB! : scratchA!;
    if (pending.some(isColorLutAdjustment)) {
      applyColorLutPassToCanvas(source, dest, bakeColorLutForRun(pipeline.lutCache, pending));
    } else {
      const matrices: (readonly number[])[] = [];
      for (const op of pending) {
        const matrix = getAdjustmentColorMatrix(op);
        if (matrix !== null) matrices.push(matrix);
      }
      applyColorMatrixPassToCanvas(source, dest, fuseColorMatrices(matrices));
    }
    source = dest;
    pending = [];
  };

  for (const operation of operations) {
    if (getAdjustmentColorMatrix(operation) !== null || isColorLutAdjustment(operation)) {
      pending.push(operation as Adjustment);
      continue;
    }
    const runner = getCanvasRenderEffectRunner(state, operation.kind);
    flushAdjustments();
    ensureScratch();
    const dest = source === scratchA ? scratchB! : scratchA!;
    // Registration is the backend's proof that an effect kind is realized. An unregistered effect is
    // therefore a pipeline-level identity operation: copy the current source into the next target so a
    // later pass never reads an uninitialized ping-pong target. Keeping this composition rule here
    // avoids per-kind passthrough registrations that would falsely advertise renderer support.
    if (runner === null) drawCanvasEffectPass(dest, source, 'none');
    else runner({ state, source, dest, pool }, operation as Readonly<RenderEffect>);
    source = dest;
  }
  flushAdjustments();

  presentCanvasRenderEffectResult(state, source);

  if (scratchA !== null) releaseCanvasRenderTarget(pool, scratchA);
  if (scratchB !== null) releaseCanvasRenderTarget(pool, scratchB);
}

export function initializeCanvasRenderEffectPipeline(
  out: EntityConstruction<CanvasRenderEffectPipeline>,
  state: CanvasRenderState,
  options: Readonly<RenderEffectPipelineOptions> = {},
): void {
  out.options = { ...options };
  out.sceneTarget = null;
  out.pool = createCanvasTextureRenderTargetPool(getCanvasSurfaceCreator(state));
  out.lutCache = createColorLutCache();
}

export function initializeCanvasRenderTargetPool(
  out: EntityConstruction<CanvasRenderTargetPool>,
  creator: Readonly<CanvasRenderSurfaceCreator>,
): void {
  out.creator = creator;
  out.free = [];
  out.inUse = [];
}

// Returns a scratch canvas to the pool so a later acquire can reuse it. Pairs with
// acquireCanvasRenderTarget like a bracket.
export function releaseCanvasRenderTarget(pool: CanvasRenderTargetPool, target: CanvasTextureRenderTarget): void {
  const index = pool.inUse.indexOf(target);
  if (index !== -1) pool.inUse.splice(index, 1);
  pool.free.push(target);
}

// Blits the final effect result into the pass that enclosed the chain — the screen, ordinarily. The
// enclosing pass is what the finished chain composites onto, so it is read from the pass stack rather
// than from the state's current handles: ending the scene pass restores whatever was installed before it,
// which is nothing at all when a caller ran a chain outside any pass. Presenting there would draw through
// a null context, so the pipeline says so instead.
function presentCanvasRenderEffectResult(state: CanvasRenderState, source: Readonly<CanvasTextureRenderTarget>): void {
  const pass = getCanvasActiveRenderPass(state);
  if (pass === null) {
    throw new Error('endCanvasRenderEffectPipeline: no enclosing pass is open to present the result into');
  }
  const context = pass.context;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = 1;
  context.filter = 'none';
  context.clearRect(0, 0, pass.target.width, pass.target.height);
  context.drawImage(source.canvas, 0, 0);
  context.restore();
}
