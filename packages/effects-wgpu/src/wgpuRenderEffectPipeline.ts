import {
  bakeColorLutForRun,
  createColorLutCache,
  fuseColorMatrices,
  getAdjustmentColorMatrix,
  isColorLutAdjustment,
} from '@flighthq/adjustments/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  acquireWgpuTextureRenderTarget,
  beginWgpuRenderPass,
  createWgpuTextureRenderTarget,
  createWgpuRenderTargetPool,
  destroyWgpuTextureRenderTarget,
  destroyWgpuRenderTargetPool,
  endWgpuRenderPass,
  getWgpuActiveRenderPass,
  getWgpuRenderStateRuntime,
  resumeWgpuRenderPass,
  releaseWgpuTextureRenderTarget,
  resizeWgpuTextureRenderTarget,
} from '@flighthq/render-wgpu/contract';
import type {
  Adjustment,
  RenderEffect,
  RenderEffectPipelineOptions,
  RenderTargetClear,
  RenderTargetColorSpace,
  WgpuRenderEffectPipeline,
  WgpuRenderEffectPipelineSampleCountGuard,
  WgpuRenderEffectPipelineSkipGuard,
  WgpuRenderPass,
  WgpuRenderState,
  WgpuTextureRenderTarget,
  EntityConstruction,
} from '@flighthq/types/contract';

import { applyColorLutPassToWgpu } from './wgpuColorLutPass';
import { applyColorMatrixPassToWgpu } from './wgpuColorMatrixPass';
import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';
import { getWgpuRenderEffectRunner } from './wgpuRenderEffectRegistry';

// Opt-in post-process pipeline, the Wgpu mirror of effects-gl's renderEffectPipeline. The caller opens a
// pass on the screen, then:
//   beginWgpuRenderEffectPipeline(pass, …) -> opens a pass into the pipeline's offscreen scene target
//   ...draw the scene tree into the returned pass...
//   endWgpuRenderEffectPipeline(scenePass, pipeline, effects) -> ends it, runs the agnostic effect list
//     through the per-state registry ping-ponging pooled targets, and presents into the enclosing pass
// The default render loop imports none of this. The effect list is per-frame data; only the scene target
// and pool are retained. Depth/velocity G-buffers are not yet produced (follow-up); depth- and
// velocity-driven recipes receive null and fall back to their color-only paths.

// `clear` is the scene target's clear, given explicitly: the background is what you clear to, a per-pass
// value, not a property the render state carries around. It defaults to transparent black with the depth
// buffer reset, which is what an effect chain compositing over the frame beneath it wants.
export function beginWgpuRenderEffectPipeline(
  pass: WgpuRenderPass,
  pipeline: WgpuRenderEffectPipeline,
  clear: Readonly<RenderTargetClear> = { color: [0, 0, 0, 0], depth: 1.0 },
  colorSpace: RenderTargetColorSpace = 'srgb',
): WgpuRenderPass {
  const state = pass.state;
  const { height: h, width: w } = pass.viewport;
  const format = pipeline.options.format === 'rgba16f' ? 'rgba16float' : state.format;

  if (pipeline.sceneTarget === null) {
    pipeline.sceneTarget = createWgpuTextureRenderTarget(state, w, h, format, colorSpace, pipeline.options.sampleCount);
  } else {
    resizeWgpuTextureRenderTarget(state, pipeline.sceneTarget, w, h, pipeline.options.sampleCount);
  }
  pipeline.sceneTarget.colorSpace = colorSpace;
  return beginWgpuRenderPass(state, pipeline.sceneTarget, colorSpace === 'linear' ? linearizeClear(clear) : clear);
}

export function createWgpuRenderEffectPipeline(
  state: WgpuRenderState,
  options: Readonly<RenderEffectPipelineOptions> = {},
): WgpuRenderEffectPipeline {
  const out = allocateEntity<WgpuRenderEffectPipeline>();
  initializeWgpuRenderEffectPipeline(out, state, options);
  return finishEntity(out);
}

export function destroyWgpuRenderEffectPipeline(state: WgpuRenderState, pipeline: WgpuRenderEffectPipeline): void {
  if (pipeline.sceneTarget) {
    destroyWgpuTextureRenderTarget(pipeline.sceneTarget);
    pipeline.sceneTarget = null;
  }
  destroyWgpuRenderTargetPool(pipeline.pool);
  pipeline.lutTexture.texture?.destroy();
  pipeline.lutTexture.texture = null;
  pipeline.lutTexture.size = 0;
  pipeline.lutTexture.lut = null;
  pipeline.lutCache.signature = null;
  pipeline.lutCache.lut = null;
}

export function endWgpuRenderEffectPipeline(
  scenePass: WgpuRenderPass,
  pipeline: WgpuRenderEffectPipeline,
  operations: ReadonlyArray<RenderEffect | Adjustment>,
): void {
  const state = scenePass.state;
  const scene = pipeline.sceneTarget;
  if (scene === null) return;

  // End the scene pass; the enclosing pass resumes with loadOp 'load' and receives the presented result.
  endWgpuRenderPass(scenePass);

  const format = scene.format;
  const descriptor = { width: scene.width, height: scene.height, format, colorSpace: scene.colorSpace };
  let source: WgpuTextureRenderTarget = scene;
  let scratchA: WgpuTextureRenderTarget | null = null;
  let scratchB: WgpuTextureRenderTarget | null = null;
  // A maximal run of consecutive pointwise adjustments fuses into ONE pass: all matrix-tier → one 4×5
  // matrix (cheaper applyColorMatrixPass); any LUT-tier member → the whole run (matrices folded in) bakes
  // into one ColorLut (applyColorLutPass). An effect (or the end of the stack) breaks the run and flushes
  // it first, preserving stack order.
  let pending: Adjustment[] = [];

  const ensureScratch = (): void => {
    if (scratchA === null) scratchA = acquireWgpuTextureRenderTarget(state, pipeline.pool, descriptor);
    if (scratchB === null) scratchB = acquireWgpuTextureRenderTarget(state, pipeline.pool, descriptor);
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
    if (runner === null) {
      reportWgpuRenderEffectPipelineSkip(state, operation.kind);
      continue;
    }
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
      operation as Readonly<RenderEffect>,
    );
    source = dest;
  }
  flushAdjustments();

  presentWgpuRenderEffectResult(state, source);
  // The effect chain recorded its fullscreen passes beside the enclosing pass; hand that pass its
  // encoder back so the caller's own end closes a live bracket.
  const enclosing = getWgpuActiveRenderPass(state);
  if (enclosing !== null && enclosing.encoder === null) resumeWgpuRenderPass(enclosing);

  if (scratchA !== null) releaseWgpuTextureRenderTarget(pipeline.pool, scratchA);
  if (scratchB !== null) releaseWgpuTextureRenderTarget(pipeline.pool, scratchB);
}

export function initializeWgpuRenderEffectPipeline(
  out: EntityConstruction<WgpuRenderEffectPipeline>,
  state: WgpuRenderState,
  options: Readonly<RenderEffectPipelineOptions> = {},
): void {
  const requestedSampleCount = options.sampleCount ?? 1;
  const appliedSampleCount = requestedSampleCount > 1 ? 4 : 1;
  if (requestedSampleCount !== appliedSampleCount) {
    _sampleCountGuards.get(state)?.(state, requestedSampleCount, appliedSampleCount);
  }
  out.options = { ...options, sampleCount: appliedSampleCount };
  out.sceneTarget = null;
  out.pool = createWgpuRenderTargetPool();
  out.lutCache = createColorLutCache();
  out.lutTexture = { texture: null, size: 0, lut: null };
  out.velocityTexture = null;
}

// The diagnostics seam for sample-count substitutions. Core stays free of warning strings and
// @flighthq/log; the separately-importable guard module installs the reporter when wanted.
export function setWgpuRenderEffectPipelineSampleCountGuard(
  state: WgpuRenderState,
  guard: WgpuRenderEffectPipelineSampleCountGuard | null,
): void {
  if (guard === null) _sampleCountGuards.delete(state);
  else _sampleCountGuards.set(state, guard);
}

// Sets the velocity G-buffer the pipeline feeds to velocity-driven effects this frame, or null to
// clear it. The Wgpu mirror of setGlRenderEffectVelocityTexture.
// The diagnostics seam. Core stays message-free; enableWgpuRenderEffectGuards installs the reporter that
// turns a dropped effect into a caller-facing warning. Mirrors setWgpuRenderEffectApplicationGuard, which
// covers the render-texture path — this one covers the pipeline path, where the drop is a bare `continue`.
export function setWgpuRenderEffectPipelineSkipGuard(
  state: WgpuRenderState,
  guard: WgpuRenderEffectPipelineSkipGuard | null,
): void {
  if (guard === null) _skipGuards.delete(state);
  else _skipGuards.set(state, guard);
}

export function setWgpuRenderEffectVelocityTexture(
  pipeline: WgpuRenderEffectPipeline,
  texture: GPUTexture | null,
): void {
  pipeline.velocityTexture = texture;
}

// Presents the final effect result into the enclosing pass. Draws source into that pass's color
// attachment (dest null → the active pass's colorView) with replace blend, overwriting its pixels.
function presentWgpuRenderEffectResult(state: WgpuRenderState, source: Readonly<WgpuTextureRenderTarget>): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.commandEncoder === null) return;
  const linear = source.colorSpace === 'linear';
  const pipeline = getWgpuEffectPipeline(
    state,
    linear ? 'effect.present.linear' : 'effect.present',
    linear ? LINEAR_PRESENT_FRAGMENT_WGSL : PRESENT_FRAGMENT_WGSL,
    'premul',
  );
  drawWgpuEffectPass(state, source as WgpuTextureRenderTarget, null, pipeline, () => {});
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

const LINEAR_PRESENT_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn linearToSrgb(c0 : vec3f) -> vec3f {
  let c = max(c0, vec3f(0.0));
  let low = c * 12.92;
  let high = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3f(0.0031308), c));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let linear = textureSampleLevel(tex, smp, uv, 0.0);
  return vec4f(linearToSrgb(linear.rgb), linear.a);
}`;

function reportWgpuRenderEffectPipelineSkip(state: WgpuRenderState, kind: string): void {
  _skipGuards.get(state)?.(state, kind);
}

// sRGB → linear conversion matching the inverse of the present shader's linearToSrgb. Callers
// specify clear colors as screen-appearance (sRGB) values; a linear scene target must store the
// linearized form so the present shader's gamma encoding reconstructs the intended screen color.
function srgbComponentToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearizeClear(clear: Readonly<RenderTargetClear>): RenderTargetClear {
  const out: RenderTargetClear = {};
  if (clear.color !== undefined) {
    const [r, g, b, a] = clear.color;
    out.color = [srgbComponentToLinear(r), srgbComponentToLinear(g), srgbComponentToLinear(b), a];
  }
  if (clear.colors !== undefined) {
    out.colors = clear.colors.map((c) =>
      c === undefined
        ? undefined
        : [srgbComponentToLinear(c[0]), srgbComponentToLinear(c[1]), srgbComponentToLinear(c[2]), c[3]],
    );
  }
  if (clear.depth !== undefined) out.depth = clear.depth;
  if (clear.stencil !== undefined) out.stencil = clear.stencil;
  return out;
}

const _skipGuards = new WeakMap<WgpuRenderState, WgpuRenderEffectPipelineSkipGuard>();
const _sampleCountGuards = new WeakMap<WgpuRenderState, WgpuRenderEffectPipelineSampleCountGuard>();
