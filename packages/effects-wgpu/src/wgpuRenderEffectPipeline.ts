import {
  bakeColorLutForRun,
  createColorLutCache,
  fuseColorMatrices,
  getAdjustmentColorMatrix,
  isColorLutAdjustment,
} from '@flighthq/adjustments';
import { createMatrix } from '@flighthq/geometry';
import {
  acquireWgpuRenderTarget,
  beginWgpuRenderTarget,
  createWgpuRenderTarget,
  createWgpuRenderTargetPool,
  destroyWgpuRenderTarget,
  destroyWgpuRenderTargetPool,
  endWgpuRenderTarget,
  getWgpuRenderStateRuntime,
  releaseWgpuRenderTarget,
  resizeWgpuRenderTarget,
} from '@flighthq/render-wgpu';
import type {
  Adjustment,
  RenderEffect,
  RenderEffectPipelineOptions,
  WgpuRenderEffectPipeline,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types';

import { applyColorLutPassToWgpu } from './wgpuColorLutPass';
import { applyColorMatrixPassToWgpu } from './wgpuColorMatrixPass';
import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';
import { getWgpuRenderEffectRunner } from './wgpuRenderEffectRegistry';

// Opt-in post-process pipeline, the Wgpu mirror of effects-gl's renderEffectPipeline. The caller
// opens the frame with renderWgpuBackground (creating the command encoder + canvas pass), then:
//   beginWgpuRenderEffectPipeline → renders the scene into the pipeline's offscreen target
//   ...draw the scene tree...
//   endWgpuRenderEffectPipeline(effects) → pops back to the canvas, then runs the agnostic effect
//     list through the per-state registry ping-ponging pooled targets, and presents to the canvas
//   submitWgpuRenderPass → submits the encoder
// The default render loop imports none of this. The effect list is per-frame data; only the scene
// target and pool are retained. Depth/velocity G-buffers are not yet produced (follow-up); depth- and
// velocity-driven recipes receive null and fall back to their color-only paths.

export function beginWgpuRenderEffectPipeline(state: WgpuRenderState, pipeline: WgpuRenderEffectPipeline): void {
  const w = state.canvas.width;
  const h = state.canvas.height;
  const format = pipeline.options.format === 'rgba16f' ? 'rgba16float' : state.format;

  if (pipeline.sceneTarget === null) {
    pipeline.sceneTarget = createWgpuRenderTarget(state, w, h, format);
  } else {
    resizeWgpuRenderTarget(state, pipeline.sceneTarget, w, h);
  }
  // Clear the scene target to the background colour (not transparent) so the background is part of the
  // image the effects process and the replace-blend present composites — mirroring the Gl pipeline,
  // where renderGlBackground draws into the scene target. Without this the present overwrites the bg.
  const rgba = state.backgroundColorRgba;
  const clearColor =
    rgba !== undefined && rgba.length >= 4 ? { r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] } : undefined;
  beginWgpuRenderTarget(state, pipeline.sceneTarget, state.renderTransform2D ?? createMatrix(), clearColor);
}

export function createWgpuRenderEffectPipeline(
  _state: WgpuRenderState,
  options: Readonly<RenderEffectPipelineOptions> = {},
): WgpuRenderEffectPipeline {
  return {
    options: { ...options },
    sceneTarget: null,
    pool: createWgpuRenderTargetPool(),
    lutCache: createColorLutCache(),
    lutTexture: { texture: null, size: 0, lut: null },
    velocityTexture: null,
  };
}

export function destroyWgpuRenderEffectPipeline(state: WgpuRenderState, pipeline: WgpuRenderEffectPipeline): void {
  if (pipeline.sceneTarget) {
    destroyWgpuRenderTarget(state, pipeline.sceneTarget);
    pipeline.sceneTarget = null;
  }
  destroyWgpuRenderTargetPool(state, pipeline.pool);
  pipeline.lutTexture.texture?.destroy();
  pipeline.lutTexture.texture = null;
  pipeline.lutTexture.size = 0;
  pipeline.lutTexture.lut = null;
  pipeline.lutCache.signature = null;
  pipeline.lutCache.lut = null;
}

export function endWgpuRenderEffectPipeline(
  state: WgpuRenderState,
  pipeline: WgpuRenderEffectPipeline,
  operations: ReadonlyArray<RenderEffect | Adjustment>,
): void {
  const scene = pipeline.sceneTarget;
  if (scene === null) return;

  // Pop the scene render target; restores the canvas pass (loadOp 'load').
  endWgpuRenderTarget(state);

  const format = scene.format;
  const descriptor = { width: scene.width, height: scene.height, format };
  let source: WgpuRenderTarget = scene;
  let scratchA: WgpuRenderTarget | null = null;
  let scratchB: WgpuRenderTarget | null = null;
  // A maximal run of consecutive pointwise adjustments fuses into ONE pass: all matrix-tier → one 4×5
  // matrix (cheaper applyColorMatrixPass); any LUT-tier member → the whole run (matrices folded in) bakes
  // into one ColorLut (applyColorLutPass). An effect (or the end of the stack) breaks the run and flushes
  // it first, preserving stack order.
  let pending: Adjustment[] = [];

  const ensureScratch = (): void => {
    if (scratchA === null) scratchA = acquireWgpuRenderTarget(state, pipeline.pool, descriptor);
    if (scratchB === null) scratchB = acquireWgpuRenderTarget(state, pipeline.pool, descriptor);
  };
  const flushAdjustments = (): void => {
    if (pending.length === 0) return;
    ensureScratch();
    const dest = source === scratchA ? scratchB! : scratchA!;
    if (pending.some(isColorLutAdjustment)) {
      applyColorLutPassToWgpu(state, source, dest, bakeColorLutForRun(pipeline.lutCache, pending), pipeline.lutTexture);
    } else {
      const matrices: (readonly number[])[] = [];
      for (const op of pending) {
        const matrix = getAdjustmentColorMatrix(op);
        if (matrix !== null) matrices.push(matrix);
      }
      applyColorMatrixPassToWgpu(state, source, dest, fuseColorMatrices(matrices));
    }
    source = dest;
    pending = [];
  };

  for (const operation of operations) {
    if (getAdjustmentColorMatrix(operation) !== null || isColorLutAdjustment(operation)) {
      pending.push(operation as Adjustment);
      continue;
    }
    const runner = getWgpuRenderEffectRunner(state, operation.kind);
    if (runner === null) continue;
    flushAdjustments();
    ensureScratch();
    const dest = source === scratchA ? scratchB! : scratchA!;
    runner(
      {
        state,
        source,
        dest,
        pool: pipeline.pool,
        // Depth/velocity G-buffers are not yet produced for Wgpu; depth/velocity-driven recipes
        // fall back to color-only when null. Wiring them is a follow-up (depth needs a sampleable
        // depth attachment; velocity a separate pass), mirroring the Gl seam.
        sceneDepthTexture: null,
        sceneVelocityTexture: pipeline.velocityTexture,
      },
      operation,
    );
    source = dest;
  }
  flushAdjustments();

  presentWgpuRenderEffectResult(state, source);

  if (scratchA !== null) releaseWgpuRenderTarget(pipeline.pool, scratchA);
  if (scratchB !== null) releaseWgpuRenderTarget(pipeline.pool, scratchB);
}

// Sets the velocity G-buffer the pipeline feeds to velocity-driven effects this frame, or null to
// clear it. The Wgpu mirror of setGlRenderEffectVelocityTexture.
export function setWgpuRenderEffectVelocityTexture(
  pipeline: WgpuRenderEffectPipeline,
  texture: GPUTexture | null,
): void {
  pipeline.velocityTexture = texture;
}

// Presents the final effect result to the canvas. Draws source into the canvas color attachment
// (dest null → runtime.canvasTextureView) with replace blend so it overwrites the canvas pixels.
function presentWgpuRenderEffectResult(state: WgpuRenderState, source: Readonly<WgpuRenderTarget>): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.commandEncoder === null) return;
  const pipeline = getWgpuEffectPipeline(state, 'effect.present', PRESENT_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, null, pipeline, () => {});
}

const PRESENT_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleLevel(tex, smp, uv, 0.0);
}`;
