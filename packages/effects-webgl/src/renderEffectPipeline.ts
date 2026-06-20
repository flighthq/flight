import { createMatrix } from '@flighthq/geometry';
import {
  acquireWebGLRenderTarget,
  beginWebGLRenderTarget,
  createWebGLRenderTarget,
  createWebGLRenderTargetPool,
  destroyWebGLRenderTarget,
  destroyWebGLRenderTargetPool,
  drawWebGLFullscreenPass,
  endWebGLRenderTarget,
  releaseWebGLRenderTarget,
  resizeWebGLRenderTarget,
  resolveWebGLRenderTarget,
} from '@flighthq/render-webgl';
import type {
  RenderEffect,
  RenderEffectPipelineOptions,
  WebGLRenderEffectPipeline,
  WebGLRenderState,
  WebGLRenderTarget,
} from '@flighthq/types';

import { getWebGLEffectProgram } from './effectProgramCache';
import { getWebGLRenderEffectRunner } from './renderEffectRegistry';

// Opt-in post-process pipeline. The scene renders into the pipeline's (optionally MSAA / HDR) target
// between begin/end; end resolves MSAA, runs the agnostic effect list through the per-state registry
// ping-ponging pooled targets, then presents to the canvas. The default render loop imports none of
// this. The effect list is per-frame data; only the scene target and pool are retained.

export function beginWebGLRenderEffectPipeline(state: WebGLRenderState, pipeline: WebGLRenderEffectPipeline): void {
  const w = state.canvas.width;
  const h = state.canvas.height;
  const { sampleCount, format, depth } = pipeline.options;

  if (pipeline.sceneTarget === null) {
    pipeline.sceneTarget = createWebGLRenderTarget(state, { width: w, height: h, sampleCount, format, depth });
  } else {
    resizeWebGLRenderTarget(state, pipeline.sceneTarget, w, h);
  }
  beginWebGLRenderTarget(state, pipeline.sceneTarget, state.renderTransform2D ?? createMatrix());
}

export function createWebGLRenderEffectPipeline(
  _state: WebGLRenderState,
  options: Readonly<RenderEffectPipelineOptions> = {},
): WebGLRenderEffectPipeline {
  return { options: { ...options }, sceneTarget: null, pool: createWebGLRenderTargetPool(), velocityTexture: null };
}

export function destroyWebGLRenderEffectPipeline(state: WebGLRenderState, pipeline: WebGLRenderEffectPipeline): void {
  if (pipeline.sceneTarget) {
    destroyWebGLRenderTarget(state, pipeline.sceneTarget);
    pipeline.sceneTarget = null;
  }
  destroyWebGLRenderTargetPool(state, pipeline.pool);
}

export function endWebGLRenderEffectPipeline(
  state: WebGLRenderState,
  pipeline: WebGLRenderEffectPipeline,
  effects: ReadonlyArray<RenderEffect>,
): void {
  const scene = pipeline.sceneTarget;
  if (scene === null) return;

  endWebGLRenderTarget(state);
  resolveWebGLRenderTarget(state, scene);

  const format = pipeline.options.format ?? 'rgba8';
  const descriptor = { width: scene.width, height: scene.height, format };
  let source: WebGLRenderTarget = scene;
  let scratchA: WebGLRenderTarget | null = null;
  let scratchB: WebGLRenderTarget | null = null;

  for (const effect of effects) {
    const runner = getWebGLRenderEffectRunner(state, effect.type);
    if (runner === null) continue;
    if (scratchA === null) scratchA = acquireWebGLRenderTarget(state, pipeline.pool, descriptor);
    if (scratchB === null) scratchB = acquireWebGLRenderTarget(state, pipeline.pool, descriptor);
    const dest = source === scratchA ? scratchB : scratchA;
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
      effect,
    );
    source = dest;
  }

  presentWebGLRenderEffectResult(state, source);

  if (scratchA !== null) releaseWebGLRenderTarget(pipeline.pool, scratchA);
  if (scratchB !== null) releaseWebGLRenderTarget(pipeline.pool, scratchB);
}

// Sets the velocity G-buffer the pipeline feeds to velocity-driven effects this frame. Pass the texture
// produced by renderWebGLVelocity (e.g. `velocityTarget.texture`), or null to clear it.
export function setWebGLRenderEffectVelocityTexture(
  pipeline: WebGLRenderEffectPipeline,
  texture: WebGLTexture | null,
): void {
  pipeline.velocityTexture = texture;
}

// Blits the final effect result to the canvas (GL→GL, no orientation flip).
function presentWebGLRenderEffectResult(state: WebGLRenderState, source: Readonly<WebGLRenderTarget>): void {
  const program = getWebGLEffectProgram(state, 'effect.present', PRESENT_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, program, [source.texture], null, () => {});
}

const PRESENT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 o_color;
void main() {
  o_color = texture(u_texture0, v_texCoord);
}`;
