import {
  bakeColorLutForRun,
  createColorLutCache,
  fuseColorMatrices,
  getAdjustmentColorMatrix,
  isColorLutAdjustment,
} from '@flighthq/adjustments';
import {
  acquireGlRenderTarget,
  beginGlRenderPass,
  clearGlRenderTarget,
  createGlRenderTarget,
  createGlRenderTargetPool,
  destroyGlRenderTarget,
  destroyGlRenderTargetPool,
  drawGlFullscreenPass,
  drawGlLinearToSrgbPass,
  endGlRenderPass,
  releaseGlRenderTarget,
  resizeGlRenderTarget,
} from '@flighthq/render-gl';
import type {
  Adjustment,
  GlRenderEffectPipeline,
  GlRenderState,
  GlRenderTarget,
  RenderEffect,
  RenderEffectPipelineOptions,
} from '@flighthq/types';

import { applyColorLutPassToGl } from './glColorLutPass';
import { applyColorMatrixPassToGl } from './glColorMatrixPass';
import { getGlEffectProgram } from './glEffectProgramCache';
import { getGlRenderEffectRunner } from './glRenderEffectRegistry';

// Opt-in post-process pipeline. The scene renders into the pipeline's (optionally MSAA / HDR) target
// between begin/end; end resolves MSAA, runs the agnostic effect list through the per-state registry
// ping-ponging pooled targets, then presents to the canvas. The default render loop imports none of
// this. The effect list is per-frame data; only the scene target and pool are retained.

export function beginGlRenderEffectPipeline(state: GlRenderState, pipeline: GlRenderEffectPipeline): void {
  const w = state.canvas.width;
  const h = state.canvas.height;
  const { sampleCount, format, depth } = pipeline.options;

  if (pipeline.sceneTarget === null) {
    pipeline.sceneTarget = createGlRenderTarget(state, { width: w, height: h, sampleCount, format, depth });
  } else {
    resizeGlRenderTarget(state, pipeline.sceneTarget, w, h);
  }
  // Reset the declared color space each frame so the frame's producer re-declares it: drawGlScene stamps
  // 'linear' while it draws (the present then encodes once); a 2D display-object frame leaves it 'srgb'
  // (plain-copy present, byte-identical to before this seam existed). A reused pipeline never carries a
  // stale space from a prior frame's content.
  pipeline.sceneTarget.colorSpace = 'srgb';
  // Preserve, don't clear: the frame's scene render fills the target (matching the pre-pass behavior),
  // and the current 2D render transform is inherited — begin no longer sets it.
  beginGlRenderPass(state, pipeline.sceneTarget, { preserveColor: true, preserveDepth: true });
}

export function createGlRenderEffectPipeline(
  _state: GlRenderState,
  options: Readonly<RenderEffectPipelineOptions> = {},
): GlRenderEffectPipeline {
  return {
    options: { ...options },
    sceneTarget: null,
    pool: createGlRenderTargetPool(),
    lutCache: createColorLutCache(),
    lutTexture: { texture: null, lut: null },
    velocityTexture: null,
  };
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
    clearGlRenderTarget(state, dest);
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
    if (runner === null) continue;
    flushAdjustments();
    ensureScratch();
    const dest = source === scratchA ? scratchB! : scratchA!;
    clearGlRenderTarget(state, dest);
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
      operation,
    );
    source = dest;
  }
  flushAdjustments();

  presentGlRenderEffectResult(state, source);

  if (scratchA !== null) releaseGlRenderTarget(pipeline.pool, scratchA);
  if (scratchB !== null) releaseGlRenderTarget(pipeline.pool, scratchB);
}

// Sets the velocity G-buffer the pipeline feeds to velocity-driven effects this frame. Pass the texture
// produced by renderGlVelocity (e.g. `velocityTarget.texture`), or null to clear it.
export function setGlRenderEffectVelocityTexture(pipeline: GlRenderEffectPipeline, texture: WebGLTexture | null): void {
  pipeline.velocityTexture = texture;
}

// Presents the final effect result to the canvas, adapting to the source target's declared color space.
// 'linear' content (a 3D scene declared its target linear) is sRGB-encoded once here via
// drawGlLinearToSrgbPass — the single gamma encode, never in a material shader. 'srgb' content (2D
// display objects, already encoded) is blitted as-is (GL→GL, no orientation flip), byte-identical to
// before this seam existed. A tonemap effect, when present, stays a linear HDR→LDR step upstream and
// never encodes gamma itself.
function presentGlRenderEffectResult(state: GlRenderState, source: Readonly<GlRenderTarget>): void {
  if (source.colorSpace === 'linear') {
    drawGlLinearToSrgbPass(state, source, null);
    return;
  }
  const program = getGlEffectProgram(state, 'effect.present', PRESENT_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], null, () => {});
}

const PRESENT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 o_color;
void main() {
  o_color = texture(u_texture0, v_texCoord);
}`;
