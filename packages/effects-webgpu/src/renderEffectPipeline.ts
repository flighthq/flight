import { drawWebGPUFilterPass } from '@flighthq/filters-webgpu';
import { createMatrix } from '@flighthq/geometry';
import {
  acquireWebGPURenderTarget,
  beginWebGPURenderTarget,
  createWebGPURenderTarget,
  createWebGPURenderTargetPool,
  destroyWebGPURenderTarget,
  destroyWebGPURenderTargetPool,
  endWebGPURenderTarget,
  getWebGPURenderStateRuntime,
  releaseWebGPURenderTarget,
  resizeWebGPURenderTarget,
} from '@flighthq/render-webgpu';
import type {
  RenderEffect,
  RenderEffectPipelineOptions,
  WebGPURenderEffectPipeline,
  WebGPURenderState,
  WebGPURenderTarget,
} from '@flighthq/types';

import { getWebGPUEffectPipeline } from './effectProgramCache';
import { getWebGPURenderEffectRunner } from './renderEffectRegistry';

// Opt-in post-process pipeline, the WebGPU mirror of effects-webgl's renderEffectPipeline. The caller
// opens the frame with renderWebGPUBackground (creating the command encoder + canvas pass), then:
//   beginWebGPURenderEffectPipeline → renders the scene into the pipeline's offscreen target
//   ...draw the scene tree...
//   endWebGPURenderEffectPipeline(effects) → pops back to the canvas, then runs the agnostic effect
//     list through the per-state registry ping-ponging pooled targets, and presents to the canvas
//   submitWebGPURenderPass → submits the encoder
// The default render loop imports none of this. The effect list is per-frame data; only the scene
// target and pool are retained. Depth/velocity G-buffers are not yet produced (follow-up); depth- and
// velocity-driven recipes receive null and fall back to their color-only paths.

export function beginWebGPURenderEffectPipeline(state: WebGPURenderState, pipeline: WebGPURenderEffectPipeline): void {
  const w = state.canvas.width;
  const h = state.canvas.height;
  const format = pipeline.options.format === 'rgba16f' ? 'rgba16float' : state.format;

  if (pipeline.sceneTarget === null) {
    pipeline.sceneTarget = createWebGPURenderTarget(state, w, h, format);
  } else {
    resizeWebGPURenderTarget(state, pipeline.sceneTarget, w, h);
  }
  // Clear the scene target to the background colour (not transparent) so the background is part of the
  // image the effects process and the replace-blend present composites — mirroring the WebGL pipeline,
  // where renderWebGLBackground draws into the scene target. Without this the present overwrites the bg.
  const rgba = state.backgroundColorRGBA;
  const clearColor =
    rgba !== undefined && rgba.length >= 4 ? { r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] } : undefined;
  beginWebGPURenderTarget(state, pipeline.sceneTarget, state.renderTransform2D ?? createMatrix(), clearColor);
}

export function createWebGPURenderEffectPipeline(
  _state: WebGPURenderState,
  options: Readonly<RenderEffectPipelineOptions> = {},
): WebGPURenderEffectPipeline {
  return { options: { ...options }, sceneTarget: null, pool: createWebGPURenderTargetPool(), velocityTexture: null };
}

export function destroyWebGPURenderEffectPipeline(
  state: WebGPURenderState,
  pipeline: WebGPURenderEffectPipeline,
): void {
  if (pipeline.sceneTarget) {
    destroyWebGPURenderTarget(state, pipeline.sceneTarget);
    pipeline.sceneTarget = null;
  }
  destroyWebGPURenderTargetPool(state, pipeline.pool);
}

export function endWebGPURenderEffectPipeline(
  state: WebGPURenderState,
  pipeline: WebGPURenderEffectPipeline,
  effects: ReadonlyArray<RenderEffect>,
): void {
  const scene = pipeline.sceneTarget;
  if (scene === null) return;

  // Pop the scene render target; restores the canvas pass (loadOp 'load').
  endWebGPURenderTarget(state);

  const format = scene.format;
  const descriptor = { width: scene.width, height: scene.height, format };
  let source: WebGPURenderTarget = scene;
  let scratchA: WebGPURenderTarget | null = null;
  let scratchB: WebGPURenderTarget | null = null;

  for (const effect of effects) {
    const runner = getWebGPURenderEffectRunner(state, effect.type);
    if (runner === null) continue;
    if (scratchA === null) scratchA = acquireWebGPURenderTarget(state, pipeline.pool, descriptor);
    if (scratchB === null) scratchB = acquireWebGPURenderTarget(state, pipeline.pool, descriptor);
    const dest = source === scratchA ? scratchB : scratchA;
    runner(
      {
        state,
        source,
        dest,
        pool: pipeline.pool,
        // Depth/velocity G-buffers are not yet produced for WebGPU; depth/velocity-driven recipes
        // fall back to color-only when null. Wiring them is a follow-up (depth needs a sampleable
        // depth attachment; velocity a separate pass), mirroring the WebGL seam.
        sceneDepthTexture: null,
        sceneVelocityTexture: pipeline.velocityTexture,
      },
      effect,
    );
    source = dest;
  }

  presentWebGPURenderEffectResult(state, source);

  if (scratchA !== null) releaseWebGPURenderTarget(pipeline.pool, scratchA);
  if (scratchB !== null) releaseWebGPURenderTarget(pipeline.pool, scratchB);
}

// Sets the velocity G-buffer the pipeline feeds to velocity-driven effects this frame, or null to
// clear it. The WebGPU mirror of setWebGLRenderEffectVelocityTexture.
export function setWebGPURenderEffectVelocityTexture(
  pipeline: WebGPURenderEffectPipeline,
  texture: GPUTexture | null,
): void {
  pipeline.velocityTexture = texture;
}

// Presents the final effect result to the canvas. Draws source into the canvas color attachment
// (dest null → runtime.canvasTextureView) with replace blend so it overwrites the canvas pixels.
function presentWebGPURenderEffectResult(state: WebGPURenderState, source: Readonly<WebGPURenderTarget>): void {
  const runtime = getWebGPURenderStateRuntime(state);
  if (runtime.commandEncoder === null) return;
  const pipeline = getWebGPUEffectPipeline(state, 'effect.present', PRESENT_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, null, pipeline, () => {});
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
