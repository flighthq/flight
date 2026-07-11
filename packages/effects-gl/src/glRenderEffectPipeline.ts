import { fuseColorMatrices, getAdjustmentColorMatrix } from '@flighthq/adjustments';
import { createMatrix } from '@flighthq/geometry';
import {
  acquireGlRenderTarget,
  beginGlRenderTarget,
  clearGlRenderTarget,
  createGlRenderTarget,
  createGlRenderTargetPool,
  destroyGlRenderTarget,
  destroyGlRenderTargetPool,
  drawGlFullscreenPass,
  endGlRenderTarget,
  releaseGlRenderTarget,
  resizeGlRenderTarget,
  resolveGlRenderTarget,
} from '@flighthq/render-gl';
import type {
  Adjustment,
  GlRenderEffectPipeline,
  GlRenderState,
  GlRenderTarget,
  RenderEffect,
  RenderEffectPipelineOptions,
} from '@flighthq/types';

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
  beginGlRenderTarget(state, pipeline.sceneTarget, state.renderTransform2D ?? createMatrix());
}

export function createGlRenderEffectPipeline(
  _state: GlRenderState,
  options: Readonly<RenderEffectPipelineOptions> = {},
): GlRenderEffectPipeline {
  return { options: { ...options }, sceneTarget: null, pool: createGlRenderTargetPool(), velocityTexture: null };
}

export function destroyGlRenderEffectPipeline(state: GlRenderState, pipeline: GlRenderEffectPipeline): void {
  if (pipeline.sceneTarget) {
    destroyGlRenderTarget(state, pipeline.sceneTarget);
    pipeline.sceneTarget = null;
  }
  destroyGlRenderTargetPool(state, pipeline.pool);
}

export function endGlRenderEffectPipeline(
  state: GlRenderState,
  pipeline: GlRenderEffectPipeline,
  operations: ReadonlyArray<RenderEffect | Adjustment>,
): void {
  const scene = pipeline.sceneTarget;
  if (scene === null) return;

  endGlRenderTarget(state);
  resolveGlRenderTarget(state, scene);

  const format = pipeline.options.format ?? 'rgba8';
  const descriptor = { width: scene.width, height: scene.height, format };
  let source: GlRenderTarget = scene;
  let scratchA: GlRenderTarget | null = null;
  let scratchB: GlRenderTarget | null = null;
  // A maximal run of consecutive matrix-tier adjustments fuses into one matrix and one pass; an effect
  // (or the end of the stack) breaks the run and flushes it first, preserving stack order.
  let pending: (readonly number[])[] = [];

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
    applyColorMatrixPassToGl(state, source, dest, fuseColorMatrices(pending));
    source = dest;
    pending = [];
  };

  for (const operation of operations) {
    const matrix = getAdjustmentColorMatrix(operation);
    if (matrix !== null) {
      pending.push(matrix);
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

// Blits the final effect result to the canvas (GL→GL, no orientation flip).
function presentGlRenderEffectResult(state: GlRenderState, source: Readonly<GlRenderTarget>): void {
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
