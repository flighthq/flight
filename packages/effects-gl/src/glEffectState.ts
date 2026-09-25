import {
  bakeColorLutForRun,
  createColorLutCache,
  fuseColorMatrices,
  getAdjustmentColorMatrix,
  isColorLutAdjustment,
} from '@flighthq/adjustments/contract';
import { srgbChannelToLinear } from '@flighthq/color/contract';
import {
  acquireGlTextureRenderTarget,
  beginGlRenderPass,
  clearGlRenderTarget,
  createGlTextureRenderTarget,
  createGlTextureRenderTargetPool,
  destroyGlTextureRenderTarget,
  destroyGlTextureRenderTargetPool,
  endGlRenderPass,
  presentGlRenderTarget,
  releaseGlTextureRenderTarget,
  resizeGlTextureRenderTarget,
} from '@flighthq/render-gl/contract';
import type {
  Adjustment,
  GlEffectState,
  GlEffectStateSkipGuard,
  GlRenderPass,
  GlRenderState,
  GlTextureRenderTarget,
  Effect,
  EffectStateOptions,
  NonEntityCreateResult,
  RenderTargetClear,
  RenderTargetColorSpace,
} from '@flighthq/types/contract';

import { applyColorLutPassToGl } from './glColorLutPass.ts';
import { applyColorMatrixPassToGl } from './glColorMatrixPass.ts';
import { getGlEffectRunner } from './glEffectRegistry.ts';

// Opt-in post-process pipeline. The scene renders into the pipeline's (optionally MSAA / HDR) target
// between begin/end; end resolves MSAA, runs the agnostic effect list through the per-state registry
// ping-ponging pooled targets, then presents to the canvas. The default render loop imports none of
// this. The effect list is per-frame data; only the scene target and pool are retained.

export function beginGlEffectPass(
  state: GlRenderState,
  pipeline: GlEffectState,
  clear: Readonly<RenderTargetClear> = { color: [0, 0, 0, 0], depth: 1.0 },
  colorSpace: RenderTargetColorSpace = 'srgb',
): GlRenderPass {
  const w = state.gl.drawingBufferWidth;
  const h = state.gl.drawingBufferHeight;
  const { sampleCount, format, depth } = pipeline.options;

  if (pipeline.sceneTarget === null) {
    pipeline.sceneTarget = createGlTextureRenderTarget(state, {
      width: w,
      height: h,
      sampleCount,
      format,
      depth,
      colorSpace,
    });
  } else {
    resizeGlTextureRenderTarget(state, pipeline.sceneTarget, w, h);
  }
  pipeline.sceneTarget.colorSpace = colorSpace;
  return beginGlRenderPass(state, pipeline.sceneTarget, colorSpace === 'linear' ? linearizeClear(clear) : clear);
}

export function createGlEffectState(
  _state: GlRenderState,
  options: Readonly<EffectStateOptions> = {},
): NonEntityCreateResult<GlEffectState, 'descriptor'> {
  return {
    options: { ...options },
    sceneTarget: null,
    pool: createGlTextureRenderTargetPool(),
    lutCache: createColorLutCache(),
    lutTexture: { texture: null, lut: null },
    velocityTexture: null,
  };
}

export function destroyGlEffectState(state: GlRenderState, pipeline: GlEffectState): void {
  if (pipeline.sceneTarget) {
    destroyGlTextureRenderTarget(pipeline.sceneTarget);
    pipeline.sceneTarget = null;
  }
  destroyGlTextureRenderTargetPool(pipeline.pool);
  if (pipeline.lutTexture.texture !== null) {
    state.gl.deleteTexture(pipeline.lutTexture.texture);
    pipeline.lutTexture.texture = null;
  }
  pipeline.lutTexture.lut = null;
  pipeline.lutCache.signature = null;
  pipeline.lutCache.lut = null;
}

export function endGlEffectPass(
  pass: GlRenderPass,
  pipeline: GlEffectState,
  operations: ReadonlyArray<Effect | Adjustment>,
): void {
  const state = pass.state;
  const scene = pipeline.sceneTarget;
  if (scene === null) return;

  endGlRenderPass(pass);

  const format = pipeline.options.format ?? 'rgba8';
  // Intermediate ping-pong targets carry the scene's declared color space, so after the last effect the
  // final `source` still reports whether its content is linear (encode at present) or sRGB (plain copy).
  const descriptor = { width: scene.width, height: scene.height, format, colorSpace: scene.colorSpace };
  let source: GlTextureRenderTarget = scene;
  let scratchA: GlTextureRenderTarget | null = null;
  let scratchB: GlTextureRenderTarget | null = null;
  // A maximal run of consecutive pointwise adjustments fuses into ONE pass: all matrix-tier → one 4×5
  // matrix (cheaper applyColorMatrixPass); any LUT-tier member → the whole run (matrices folded in) bakes
  // into one ColorLut (applyColorLutPass). An effect (or the end of the stack) breaks the run and flushes
  // it first, preserving stack order.
  let pending: Adjustment[] = [];

  const ensureScratch = (): void => {
    if (scratchA === null) scratchA = acquireGlTextureRenderTarget(state, pipeline.pool, descriptor);
    if (scratchB === null) scratchB = acquireGlTextureRenderTarget(state, pipeline.pool, descriptor);
  };
  // Hand every pass a clean destination. scratchA/scratchB ping-pong across the chain, so a target
  // reused two passes later still holds an earlier pass's output; clearing means a non-covering effect
  // never composites onto stale content.
  const flushAdjustments = (): void => {
    if (pending.length === 0) return;
    ensureScratch();
    const dest = source === scratchA ? scratchB! : scratchA!;
    clearGlRenderTarget(dest, { color: [0, 0, 0, 0] });
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
    const runner = getGlEffectRunner(state, operation.kind);
    if (runner === null) {
      reportGlEffectStateSkip(state, operation.kind);
      continue;
    }
    flushAdjustments();
    ensureScratch();
    const dest = source === scratchA ? scratchB! : scratchA!;
    clearGlRenderTarget(dest, { color: [0, 0, 0, 0] });
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
      operation as Readonly<Effect>,
    );
    source = dest;
  }
  flushAdjustments();

  presentGlRenderTarget(state, source);

  if (scratchA !== null) releaseGlTextureRenderTarget(pipeline.pool, scratchA);
  if (scratchB !== null) releaseGlTextureRenderTarget(pipeline.pool, scratchB);
}

// Sets the velocity G-buffer the pipeline feeds to velocity-driven effects this frame. Pass the texture
// produced by renderGlVelocity (e.g. `velocityTarget.texture`), or null to clear it.
// The diagnostics seam. Core stays message-free; enableGlEffectGuards installs the reporter that
// turns a dropped effect into a caller-facing warning. Mirrors setGlEffectApplicationGuard, which
// covers the render-texture path — this one covers the pipeline path, where the drop is a bare `continue`.
export function setGlEffectStateSkipGuard(state: GlRenderState, guard: GlEffectStateSkipGuard | null): void {
  if (guard === null) _skipGuards.delete(state);
  else _skipGuards.set(state, guard);
}

export function setGlEffectVelocityTexture(pipeline: GlEffectState, texture: WebGLTexture | null): void {
  pipeline.velocityTexture = texture;
}

function reportGlEffectStateSkip(state: GlRenderState, kind: string): void {
  _skipGuards.get(state)?.(state, kind);
}

function linearizeClear(clear: Readonly<RenderTargetClear>): RenderTargetClear {
  const out: RenderTargetClear = {};
  if (clear.color !== undefined) {
    const [r, g, b, a] = clear.color;
    out.color = [srgbChannelToLinear(r), srgbChannelToLinear(g), srgbChannelToLinear(b), a];
  }
  if (clear.colors !== undefined) {
    out.colors = clear.colors.map((c) =>
      c === undefined
        ? undefined
        : [srgbChannelToLinear(c[0]), srgbChannelToLinear(c[1]), srgbChannelToLinear(c[2]), c[3]],
    );
  }
  if (clear.depth !== undefined) out.depth = clear.depth;
  if (clear.stencil !== undefined) out.stencil = clear.stencil;
  return out;
}

const _skipGuards = new WeakMap<GlRenderState, GlEffectStateSkipGuard>();
