import type { ColorLutCache } from './ColorLutCache';
import type { RenderEffectPipelineOptions } from './GlRenderEffectPipeline';
import type { RenderEffect } from './RenderEffect';
import type { WgpuColorLutTextureCache } from './WgpuColorLutTextureCache';
import type { WgpuRenderState } from './WgpuRenderState';
import type { WgpuRenderTarget, WgpuRenderTargetPool } from './WgpuRenderTarget';

// What a Wgpu effect runner is handed: the state, the input it reads, the output it writes, the pool
// it borrows intermediate targets from, and the scene G-buffer attachments. `source` and `dest` are
// distinct targets the pipeline ping-pongs between stages. `sceneDepthTexture`/`sceneVelocityTexture`
// are the scene's depth and per-pixel velocity attachments, or null when the scene did not produce
// them — a depth/velocity-dependent recipe reads them when present and falls back to a color-only
// path when null. The Wgpu mirror of GlRenderEffectContext.
export interface WgpuRenderEffectContext {
  readonly state: WgpuRenderState;
  readonly source: Readonly<WgpuRenderTarget>;
  readonly dest: Readonly<WgpuRenderTarget>;
  readonly pool: WgpuRenderTargetPool;
  readonly sceneDepthTexture: GPUTexture | null;
  readonly sceneVelocityTexture: GPUTexture | null;
}

// The per-backend realization registered against an effect `type`. A single function over targets —
// not a multi-method per-node renderer. The built-ins are exported as `default*` named constants
// (e.g. through registerWgpuBloomEffect); register an alternative under the same key to swap algorithms.
export type WgpuRenderEffectRunner = (ctx: Readonly<WgpuRenderEffectContext>, effect: Readonly<RenderEffect>) => void;

// Retains the GPU resources an effect pass needs across frames: the scene target the pipeline renders
// into and the intermediate-target pool. The per-frame effect list is data passed to
// endWgpuRenderEffectPipeline, not retained here. Mirrors GlRenderEffectPipeline; shares
// RenderEffectPipelineOptions with the Gl pipeline.
export interface WgpuRenderEffectPipeline {
  readonly options: Readonly<RenderEffectPipelineOptions>;
  sceneTarget: WgpuRenderTarget | null;
  readonly pool: WgpuRenderTargetPool;
  // Bake and GPU-upload memos for the fused LUT-tier adjustment run, so a static grade neither re-bakes
  // its size³ cells nor re-uploads its 3D texture every frame. `lutCache` is GC-managed; `lutTexture`
  // owns a GPU texture destroyed by destroyWgpuRenderEffectPipeline.
  readonly lutCache: ColorLutCache;
  readonly lutTexture: WgpuColorLutTextureCache;
  // Per-frame velocity G-buffer fed into ctx.sceneVelocityTexture for velocity-driven effects (motion
  // blur, TAA); null when no velocity pass ran (velocity-driven effects then color-only-fall-back).
  // Depth, by contrast, comes from the scene target directly.
  velocityTexture: GPUTexture | null;
}

// Why an application of a WGPU effect chain to a render texture did not do what the caller asked. The
// WGPU sibling of GlRenderEffectApplicationExplanation, and deliberately NARROWER than it: GL carries
// `unresolvedIndexes` for per-instance resolvability — a registered runner that still cannot resolve
// what it names, such as a shaderKey with no registered source — and WGPU has no resolvability notion at
// all: no resolver half to registration, and no custom-shader effect on this backend. A field that can
// never be non-empty would be a status the explanation cannot observe, so it is absent rather than
// always-empty, and this comment is here so the asymmetry reads as deliberate.
export type WgpuRenderEffectApplicationStatus =
  | 'complete'
  | 'no-effects'
  | 'partial-registration'
  | 'source-unavailable'
  | 'stale-destination'
  | 'unregistered-effects';

export interface WgpuRenderEffectApplicationExplanation {
  readonly registeredCount: number;
  readonly requestedCount: number;
  readonly status: WgpuRenderEffectApplicationStatus;
  readonly unregisteredKinds: readonly string[];
}

// Observed when a pipeline pass drops an effect because its kind has no registered runner. The kind is
// the whole observation: the effect is skipped silently, produces no draw and no error, and nothing
// downstream can tell a skipped effect from one that ran and had no visible result.
export type WgpuRenderEffectPipelineSkipGuard = (state: WgpuRenderState, kind: string) => void;

// Observed when the WGPU effect pipeline accepts a multisample request it cannot currently honour and
// degrades it to the supported single-sample target. Both values are explicit so a diagnostic cannot
// accidentally report the request as the applied configuration.
export type WgpuRenderEffectPipelineSampleCountGuard = (
  state: WgpuRenderState,
  requestedSampleCount: number,
  appliedSampleCount: number,
) => void;

export type WgpuRenderEffectApplicationGuard = (
  state: WgpuRenderState,
  explanation: Readonly<WgpuRenderEffectApplicationExplanation>,
) => void;
