import {
  beginCanvasRenderTarget,
  createCanvasRenderTarget,
  endCanvasRenderTarget,
  resizeCanvasRenderTarget,
} from '@flighthq/displayobject-canvas';
import { createMatrix } from '@flighthq/geometry';
import type {
  CanvasRenderEffectPipeline,
  CanvasRenderState,
  CanvasRenderTarget,
  CanvasRenderTargetPool,
  RenderEffect,
  RenderEffectPipelineOptions,
} from '@flighthq/types';

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
): CanvasRenderTarget {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const target = pool.free.pop() ?? createCanvasRenderTarget(w, h);
  if (target.width !== w || target.height !== h) resizeCanvasRenderTarget(target, w, h);
  pool.inUse.push(target);
  return target;
}

export function beginCanvasRenderEffectPipeline(state: CanvasRenderState, pipeline: CanvasRenderEffectPipeline): void {
  const w = state.canvas.width;
  const h = state.canvas.height;

  if (pipeline.sceneTarget === null) {
    pipeline.sceneTarget = createCanvasRenderTarget(w, h);
  } else {
    resizeCanvasRenderTarget(pipeline.sceneTarget, w, h);
  }
  // Clear the offscreen scene canvas before redirecting render into it; resize already clears on the
  // grow path, but an unchanged size keeps last frame's pixels otherwise.
  pipeline.sceneTarget.context.clearRect(0, 0, pipeline.sceneTarget.width, pipeline.sceneTarget.height);
  beginCanvasRenderTarget(state, pipeline.sceneTarget, state.renderTransform2D ?? createMatrix());
}

export function createCanvasRenderEffectPipeline(
  _state: CanvasRenderState,
  options: Readonly<RenderEffectPipelineOptions> = {},
): CanvasRenderEffectPipeline {
  return { options: { ...options }, sceneTarget: null, pool: createCanvasRenderTargetPool() };
}

export function createCanvasRenderTargetPool(): CanvasRenderTargetPool {
  return { free: [], inUse: [] };
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
}

export function endCanvasRenderEffectPipeline(
  state: CanvasRenderState,
  pipeline: CanvasRenderEffectPipeline,
  effects: ReadonlyArray<RenderEffect>,
): void {
  const scene = pipeline.sceneTarget;
  if (scene === null) return;

  endCanvasRenderTarget(state);

  const pool = pipeline.pool;
  let source: CanvasRenderTarget = scene;
  let scratchA: CanvasRenderTarget | null = null;
  let scratchB: CanvasRenderTarget | null = null;

  for (const effect of effects) {
    const runner = getCanvasRenderEffectRunner(state, effect.kind);
    if (runner === null) continue;
    if (scratchA === null) scratchA = acquireCanvasRenderTarget(pool, scene.width, scene.height);
    if (scratchB === null) scratchB = acquireCanvasRenderTarget(pool, scene.width, scene.height);
    const dest = source === scratchA ? scratchB : scratchA;
    runner({ state, source, dest, pool }, effect);
    source = dest;
  }

  presentCanvasRenderEffectResult(state, source);

  if (scratchA !== null) releaseCanvasRenderTarget(pool, scratchA);
  if (scratchB !== null) releaseCanvasRenderTarget(pool, scratchB);
}

// Returns a scratch canvas to the pool so a later acquire can reuse it. Pairs with
// acquireCanvasRenderTarget like a bracket.
export function releaseCanvasRenderTarget(pool: CanvasRenderTargetPool, target: CanvasRenderTarget): void {
  const index = pool.inUse.indexOf(target);
  if (index !== -1) pool.inUse.splice(index, 1);
  pool.free.push(target);
}

// Blits the final effect result to the main canvas. Clears first so a transparent scene composites
// correctly, then draws the offscreen source 1:1.
function presentCanvasRenderEffectResult(state: CanvasRenderState, source: Readonly<CanvasRenderTarget>): void {
  const context = state.context;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = 1;
  context.filter = 'none';
  context.clearRect(0, 0, state.canvas.width, state.canvas.height);
  context.drawImage(source.canvas, 0, 0);
  context.restore();
}
