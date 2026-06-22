import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
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
  RenderEffect,
  RenderEffectPipelineOptions,
  WgpuRenderEffectPipeline,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types';

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
  return { options: { ...options }, sceneTarget: null, pool: createWgpuRenderTargetPool(), velocityTexture: null };
}

export function destroyWgpuRenderEffectPipeline(state: WgpuRenderState, pipeline: WgpuRenderEffectPipeline): void {
  if (pipeline.sceneTarget) {
    destroyWgpuRenderTarget(state, pipeline.sceneTarget);
    pipeline.sceneTarget = null;
  }
  destroyWgpuRenderTargetPool(state, pipeline.pool);
}

export function endWgpuRenderEffectPipeline(
  state: WgpuRenderState,
  pipeline: WgpuRenderEffectPipeline,
  effects: ReadonlyArray<RenderEffect>,
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

  for (const effect of effects) {
    const runner = getWgpuRenderEffectRunner(state, effect.kind);
    if (runner === null) continue;
    if (scratchA === null) scratchA = acquireWgpuRenderTarget(state, pipeline.pool, descriptor);
    if (scratchB === null) scratchB = acquireWgpuRenderTarget(state, pipeline.pool, descriptor);
    const dest = source === scratchA ? scratchB : scratchA;
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
      effect,
    );
    source = dest;
  }

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
  drawWgpuFilterPass(state, source as WgpuRenderTarget, null, pipeline, () => {});
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
