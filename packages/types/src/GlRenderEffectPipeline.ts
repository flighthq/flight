import type { ColorLutCache } from './ColorLutCache';
import type { Entity } from './Entity';
import type { GlColorLutTextureCache } from './GlColorLutTextureCache';
import type { GlRenderState } from './GlRenderState';
import type { GlRenderTarget, GlRenderTargetPool } from './GlRenderTarget';
import type { RenderEffect } from './RenderEffect';
import type { RenderTargetDepth, RenderTargetFormat } from './RenderTarget';

// What a Gl effect runner is handed: the state, the input it reads, the output it writes, the pool
// it borrows intermediate targets from, and the scene G-buffer attachments. `source` and `dest` are
// distinct targets the pipeline ping-pongs between stages. `sceneDepthTexture`/`sceneVelocityTexture`
// are the scene target's depth and per-pixel velocity attachments, or null when the scene did not
// produce them — a depth/velocity-dependent recipe reads them when present and falls back to a
// sentinel/color-only path when null. Both are 2D-capable G-buffers: depth comes from a depth-writing
// scene pass; velocity from per-node current-vs-previous transform deltas.
export interface GlRenderEffectContext {
  readonly state: GlRenderState;
  readonly source: Readonly<GlRenderTarget>;
  readonly dest: Readonly<GlRenderTarget>;
  readonly pool: GlRenderTargetPool;
  readonly sceneDepthTexture: WebGLTexture | null;
  readonly sceneVelocityTexture: WebGLTexture | null;
}

// The per-backend realization registered against an effect `type`. A single function over targets —
// not a multi-method per-node renderer. The built-ins are exported as `default*` named constants
// (e.g. through registerGlBloomEffect); register an alternative under the same key to swap algorithms.
export type GlRenderEffectRunner = (ctx: Readonly<GlRenderEffectContext>, effect: Readonly<RenderEffect>) => void;

// Why an applyGlRenderEffectsToRenderTexture call would not write its destination, as plain data.
//
//   complete              every requested effect has a runner; the destination gets written
//   no-effects            an empty chain — a legitimate no-op, NOT a registration miss
//   source-unavailable    the source RenderTexture has no realized GL target yet
//   stale-destination     the call cannot run and a previously published destination therefore keeps
//                         pixels from an older application instead of receiving a replacement
//   unregistered-effects  effects were requested and NONE has a runner; the call returns false and
//                         DEST IS NEVER WRITTEN, so a sprite sampling it reads a never-written texture
//   partial-registration  some effects have runners and some do not; the call succeeds while SILENTLY
//                         DROPPING the unregistered ones, so the output is wrong rather than absent
//   unresolved-effects    every runner is registered but NONE can resolve what its effect names (a
//                         CustomShaderEffect whose shaderKey has no source, say); the call succeeds and
//                         DEST IS WRITTEN with the input COPIED THROUGH UNCHANGED — not dropped, and
//                         not absent, so the output looks like an effect that did nothing
//   partial-resolution    some effects resolve and some do not; the resolvable ones run and the rest
//                         COPY THROUGH, so the chain is short one stage with no other trace
//
// Registration and resolution are two different axes, and the status names keep them apart: a kind is
// registered or not (one answer for every effect of that kind), while resolution is per EFFECT — two
// CustomShaderEffects in one chain can name different shaderKeys, so this question has no kind-level
// answer. That is why the unresolved effects are reported as chain INDEXES and never as kinds.
//
// The four failure statuses are all correct-by-contract, and none is distinguishable from working code
// without a crumb — but they produce different wrong pictures. Unregistered effects are DROPPED (dest
// unwritten, or the chain short a stage); unresolved effects PASS THROUGH (dest written, stage present
// and doing nothing). Naming the right one is what makes the warning actionable.
export type GlRenderEffectApplicationStatus =
  | 'complete'
  | 'no-effects'
  | 'partial-registration'
  | 'partial-resolution'
  | 'source-unavailable'
  | 'stale-destination'
  | 'unregistered-effects'
  | 'unresolved-effects';

export interface GlRenderEffectApplicationExplanation {
  readonly registeredCount: number;
  readonly requestedCount: number;
  readonly status: GlRenderEffectApplicationStatus;
  readonly unregisteredKinds: readonly string[];
  // Positions in the submitted chain, NOT kinds: resolution is per effect instance, so a kind here
  // would be wrong the moment a chain carries two effects of the same kind naming different targets.
  readonly unresolvedIndexes: readonly number[];
}

/**
 * The optional second half of a registration: whether THIS effect instance can resolve into a real
 * pass, given whatever else its runner needs (a registered shader source, a loaded LUT). Passed to
 * registerGlRenderEffect beside the runner rather than to a registry of its own — one call registers
 * both, so there is no second registration to forget and no way to express a runner whose resolver was
 * never installed. A kind registered without one is always resolvable.
 */
export type GlRenderEffectResolver = (state: GlRenderState, effect: Readonly<RenderEffect>) => boolean;

// What one registered kind holds. The resolver rides with the runner rather than in a parallel map, so
// there is no state in which a runner exists and its resolver was never installed.
export interface GlRenderEffectRegistration {
  readonly isResolvable?: GlRenderEffectResolver;
  readonly runner: GlRenderEffectRunner;
}

/**
 * Called when a custom shader source is re-registered under a shaderKey that already carries a
 * DIFFERENT source. The compiled program is cached by key, so the new source never reaches the GPU —
 * the guard exists because that outcome is otherwise indistinguishable from the edit having worked.
 */
export type GlCustomShaderSourceGuard = (
  state: GlRenderState,
  shaderKey: string,
  previousSource: string,
  nextSource: string,
) => void;

// Observed when a pipeline pass drops an effect because its kind has no registered runner. The kind is
// the whole observation: the effect is skipped silently, produces no draw and no error, and nothing
// downstream can tell a skipped effect from one that ran and had no visible result.
export type GlRenderEffectPipelineSkipGuard = (state: GlRenderState, kind: string) => void;

export type GlRenderEffectApplicationGuard = (
  state: GlRenderState,
  explanation: Readonly<GlRenderEffectApplicationExplanation>,
) => void;

export interface RenderEffectPipelineOptions {
  // MSAA on the scene target so going offscreen for effects keeps edge AA. Default 1.
  sampleCount?: number;
  // 'rgba16f' gives bloom/tone-mapping HDR headroom. Default 'rgba8'.
  format?: RenderTargetFormat;
  // Depth attachment for depth-dependent effects (SSAO, DoF, fog). Default 'none'.
  depth?: RenderTargetDepth;
}

// Retains the GPU resources an effect pass needs across frames: the scene target the pipeline renders
// into and the intermediate-target pool. The per-frame effect list is data passed to
// endGlRenderEffectPipeline, not retained here.
export interface GlRenderEffectPipeline extends Entity {
  readonly options: Readonly<RenderEffectPipelineOptions>;
  sceneTarget: GlRenderTarget | null;
  readonly pool: GlRenderTargetPool;
  // Bake and GPU-upload memos for the fused LUT-tier adjustment run, so a static grade neither re-bakes
  // its size³ cells nor re-uploads its 3D texture every frame. `lutCache` is GC-managed; `lutTexture`
  // owns a GPU texture destroyed by destroyGlRenderEffectPipeline.
  readonly lutCache: ColorLutCache;
  readonly lutTexture: GlColorLutTextureCache;
  // Per-frame velocity G-buffer fed into ctx.sceneVelocityTexture for velocity-driven effects (motion
  // blur, TAA). Produced separately by renderGlVelocity and set via setGlRenderEffectVelocityTexture;
  // null when no velocity pass ran (velocity-driven effects then sentinel-fall-back). Depth, by contrast,
  // comes from the scene target directly.
  velocityTexture: WebGLTexture | null;
}
