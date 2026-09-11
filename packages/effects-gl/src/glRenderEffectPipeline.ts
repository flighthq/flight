import {
  bakeColorLutForRun,
  createColorLutCache,
  fuseColorMatrices,
  getAdjustmentColorMatrix,
  isColorLutAdjustment,
} from '@flighthq/adjustments/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  acquireGlRenderTarget,
  beginGlRenderPass,
  clearGlRenderTarget,
  createGlRenderTarget,
  createGlRenderTargetPool,
  destroyGlRenderTarget,
  destroyGlRenderTargetPool,
  endGlRenderPass,
  presentGlRenderTarget,
  releaseGlRenderTarget,
  resizeGlRenderTarget,
} from '@flighthq/render-gl/contract';
import type {
  Adjustment,
  GlRenderEffectPipeline,
  GlRenderEffectPipelineSkipGuard,
  GlRenderState,
  GlRenderTarget,
  RenderEffect,
  RenderEffectPipelineOptions,
  RenderTargetColorSpace,
  EntityConstruction,
} from '@flighthq/types/contract';

import { applyColorLutPassToGl } from './glColorLutPass';
import { applyColorMatrixPassToGl } from './glColorMatrixPass';
import { getGlRenderEffectRunner } from './glRenderEffectRegistry';

// Opt-in post-process pipeline. The scene renders into the pipeline's (optionally MSAA / HDR) target
// between begin/end; end resolves MSAA, runs the agnostic effect list through the per-state registry
// ping-ponging pooled targets, then presents to the canvas. The default render loop imports none of
// this. The effect list is per-frame data; only the scene target and pool are retained.

export function beginGlRenderEffectPipeline(
  state: GlRenderState,
  pipeline: GlRenderEffectPipeline,
  colorSpace: RenderTargetColorSpace = 'srgb',
): void {
  const w = state.gl.drawingBufferWidth;
  const h = state.gl.drawingBufferHeight;
  const { sampleCount, format, depth } = pipeline.options;

  if (pipeline.sceneTarget === null) {
    pipeline.sceneTarget = createGlRenderTarget(state, {
      width: w,
      height: h,
      sampleCount,
      format,
      depth,
      colorSpace,
    });
  } else {
    resizeGlRenderTarget(state, pipeline.sceneTarget, w, h);
  }
  pipeline.sceneTarget.colorSpace = colorSpace;
  clearGlRenderTarget(state, pipeline.sceneTarget, { color: [0, 0, 0, 0], depth: 1.0 });
  beginGlRenderPass(state, pipeline.sceneTarget);
}

export function createGlRenderEffectPipeline(
  _state: GlRenderState,
  options: Readonly<RenderEffectPipelineOptions> = {},
): GlRenderEffectPipeline {
  const out = allocateEntity<GlRenderEffectPipeline>();
  initializeGlRenderEffectPipeline(out, _state, options);
  return finishEntity(out);
}

export function destroyGlRenderEffectPipeline(state: GlRenderState, pipeline: GlRenderEffectPipeline): void {
  if (pipeline.sceneTarget) {
    destroyGlRenderTarget(state, pipeline.sceneTarget);
    pipeline.sceneTarget = null;
  }
  destroyGlRenderTargetPool(state, pipeline.pool);
  if (pipeline.lutTexture.texture !== null) {
    state.gl.deleteTexture(pipeline.lutTexture.texture);
    pipeline.lutTexture.texture = null;
  }
  pipeline.lutTexture.lut = null;
  pipeline.lutCache.signature = null;
  pipeline.lutCache.lut = null;
}

export function endGlRenderEffectPipeline(
  state: GlRenderState,
  pipeline: GlRenderEffectPipeline,
  operations: ReadonlyArray<RenderEffect | Adjustment>,
): void {
  const scene = pipeline.sceneTarget;
  if (scene === null) return;

  endGlRenderPass(state);

  const format = pipeline.options.format ?? 'rgba8';
  // Intermediate ping-pong targets carry the scene's declared color space, so after the last effect the
  // final `source` still reports whether its content is linear (encode at present) or sRGB (plain copy).
  const descriptor = { width: scene.width, height: scene.height, format, colorSpace: scene.colorSpace };
  let source: GlRenderTarget = scene;
  let scratchA: GlRenderTarget | null = null;
  let scratchB: GlRenderTarget | null = null;
  // A maximal run of consecutive pointwise adjustments fuses into ONE pass: all matrix-tier → one 4×5
  // matrix (cheaper applyColorMatrixPass); any LUT-tier member → the whole run (matrices folded in) bakes
  // into one ColorLut (applyColorLutPass). An effect (or the end of the stack) breaks the run and flushes
  // it first, preserving stack order.
  let pending: Adjustment[] = [];

  const ensureScratch = (): void => {
    if (scratchA === null) scratchA = acquireGlRenderTarget(state, pipeline.pool, descriptor);
    if (scratchB === null) scratchB = acquireGlRenderTarget(state, pipeline.pool, descriptor);
  };
  // Hand every pass a clean destination. scratchA/scratchB ping-pong across the chain, so a target
  // reused two passes later still holds an earlier pass's output; clearing means a non-covering effect
  // never composites onto stale content.
  const flushAdjustments = (): void => {
    if (pending.length === 0) return;
    ensureScratch();
    const dest = source === scratchA ? scratchB! : scratchA!;
    clearGlRenderTarget(state, dest, { color: [0, 0, 0, 0] });
    if (pending.some(isColorLutAdjustment)) {
      applyColorLutPassToGl(state, source, dest, bakeColorLutForRun(pipeline.lutCache, pending), pipeline.lutTexture);
    } else {
      const matrices: (readonly number[])[] = [];
      for (const op of pending) {
        const matrix = getAdjustmentColorMatrix(op);
        if (matrix !== null) matrices.push(matrix);
      }
      applyColorMatrixPassToGl(state, source, dest, fuseColorMatrices(matrices));
    }
    source = dest;
    pending = [];
  };

  for (const operation of operations) {
    if (getAdjustmentColorMatrix(operation) !== null || isColorLutAdjustment(operation)) {
      pending.push(operation as Adjustment);
      continue;
    }
    const runner = getGlRenderEffectRunner(state, operation.kind);
    if (runner === null) {
      reportGlRenderEffectPipelineSkip(state, operation.kind);
      continue;
    }
    flushAdjustments();
    ensureScratch();
    const dest = source === scratchA ? scratchB! : scratchA!;
    clearGlRenderTarget(state, dest, { color: [0, 0, 0, 0] });
    // Depth/velocity always come from the original scene target, not the ping-ponged `source`.
    runner(
      {
        state,
        source,
        dest,
        pool: pipeline.pool,
        sceneDepthTexture: scene.depthTexture,
        sceneVelocityTexture: pipeline.velocityTexture,
      },
      operation as Readonly<RenderEffect>,
    );
    source = dest;
  }
  flushAdjustments();

  presentGlRenderTarget(state, source);

  if (scratchA !== null) releaseGlRenderTarget(pipeline.pool, scratchA);
  if (scratchB !== null) releaseGlRenderTarget(pipeline.pool, scratchB);
}

export function initializeGlRenderEffectPipeline(
  out: EntityConstruction<GlRenderEffectPipeline>,
  _state: GlRenderState,
  options: Readonly<RenderEffectPipelineOptions> = {},
): void {
  out.options = { ...options };
  out.sceneTarget = null;
  out.pool = createGlRenderTargetPool();
  out.lutCache = createColorLutCache();
  out.lutTexture = { texture: null, lut: null };
  out.velocityTexture = null;
}

// Sets the velocity G-buffer the pipeline feeds to velocity-driven effects this frame. Pass the texture
// produced by renderGlVelocity (e.g. `velocityTarget.texture`), or null to clear it.
// The diagnostics seam. Core stays message-free; enableGlRenderEffectGuards installs the reporter that
// turns a dropped effect into a caller-facing warning. Mirrors setGlRenderEffectApplicationGuard, which
// covers the render-texture path — this one covers the pipeline path, where the drop is a bare `continue`.
export function setGlRenderEffectPipelineSkipGuard(
  state: GlRenderState,
  guard: GlRenderEffectPipelineSkipGuard | null,
): void {
  if (guard === null) _skipGuards.delete(state);
  else _skipGuards.set(state, guard);
}

export function setGlRenderEffectVelocityTexture(pipeline: GlRenderEffectPipeline, texture: WebGLTexture | null): void {
  pipeline.velocityTexture = texture;
}

function reportGlRenderEffectPipelineSkip(state: GlRenderState, kind: string): void {
  _skipGuards.get(state)?.(state, kind);
}

const _skipGuards = new WeakMap<GlRenderState, GlRenderEffectPipelineSkipGuard>();
