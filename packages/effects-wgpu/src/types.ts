import type { ColorLut, ColorLutCache } from '@flighthq/adjustments/contract';
import type { EffectStateOptions } from '@flighthq/effects/contract';
import type { Entity } from '@flighthq/entity/contract';
import type {
  WgpuRenderPipeline,
  WgpuRenderState,
  WgpuRenderTargetPool,
  WgpuTexture,
  WgpuTextureFormat,
  WgpuTextureRenderTarget,
} from '@flighthq/render-wgpu/contract';

export type WgpuEffectBlendMode = 'premul' | 'replace' | 'erase';

export type WgpuEffectPipeline = Entity & {
  pipeline: WgpuRenderPipeline;
  blendMode: WgpuEffectBlendMode;
  compileForFormat?: (format: WgpuTextureFormat) => WgpuRenderPipeline;
  variants?: Map<WgpuTextureFormat, WgpuRenderPipeline>;
};

export type WgpuDualSourceEffectPipeline = WgpuEffectPipeline;

// GPU-upload memo for the fused color LUT on WebGPU: the uploaded `size³` 3D texture, the axis `size` it
// was created at (the texture is recreated when size changes), and the ColorLut reference last written
// into it (all null/0 before the first upload). applyColorLutPassToWgpu re-uploads only when the incoming
// lut differs by identity from `lut` — the bake cache returns a stable reference for an unchanged run, so
// a static grade uploads once. `texture` is a GPU resource; destroy it on pipeline teardown.
export interface WgpuColorLutTextureCache {
  texture: WgpuTexture | null;
  size: number;
  lut: ColorLut | null;
}

// Retains the GPU resources an effect pass needs across frames: the scene target the pipeline renders
// into and the intermediate-target pool. The per-frame effect list is data passed to
// endWgpuEffectPass, not retained here. Mirrors GlEffectState; shares
// EffectStateOptions with the Gl pipeline.
export interface WgpuEffectState {
  readonly options: Readonly<EffectStateOptions>;
  sceneTarget: WgpuTextureRenderTarget | null;
  readonly pool: WgpuRenderTargetPool;
  // Bake and GPU-upload memos for the fused LUT-tier adjustment run, so a static grade neither re-bakes
  // its size³ cells nor re-uploads its 3D texture every frame. `lutCache` is GC-managed; `lutTexture`
  // owns a GPU texture destroyed by destroyWgpuEffectState.
  readonly lutCache: ColorLutCache;
  readonly lutTexture: WgpuColorLutTextureCache;
  // Per-frame velocity G-buffer fed into ctx.sceneVelocityTexture for velocity-driven effects (motion
  // blur, TAA); null when no velocity pass ran (velocity-driven effects then color-only-fall-back).
  // Depth, by contrast, comes from the scene target directly.
  velocityTexture: WgpuTexture | null;
}

// Why an application of a WGPU effect chain to a render texture did not do what the caller asked. The
// WGPU sibling of GlEffectApplicationExplanation. Registration and per-instance resolution are
// separate axes: BitmapDisplacementEffect can have a registered runner while its map Texture2D is still
// absent or unresolved. Such a stage copies through, and unresolvedIndexes makes that sentinel visible.
export type WgpuEffectApplicationStatus =
  | 'complete'
  | 'no-effects'
  | 'partial-registration'
  | 'partial-resolution'
  | 'source-unavailable'
  | 'stale-destination'
  | 'unregistered-effects'
  | 'unresolved-effects';

export interface WgpuEffectApplicationExplanation {
  readonly registeredCount: number;
  readonly requestedCount: number;
  readonly status: WgpuEffectApplicationStatus;
  readonly unregisteredKinds: readonly string[];
  readonly unresolvedIndexes: readonly number[];
}

// Observed when a pipeline pass drops an effect because its kind has no registered runner. The kind is
// the whole observation: the effect is skipped silently, produces no draw and no error, and nothing
// downstream can tell a skipped effect from one that ran and had no visible result.
export type WgpuEffectStateSkipGuard = (state: WgpuRenderState, kind: string) => void;

// Observed when the WGPU effect pipeline substitutes its supported four-coverage-sample target for a
// different requested count. Both values are explicit so diagnostics report the applied configuration.
export type WgpuEffectStateSampleCountGuard = (
  state: WgpuRenderState,
  requestedSampleCount: number,
  appliedSampleCount: number,
) => void;

export type WgpuEffectApplicationGuard = (
  state: WgpuRenderState,
  explanation: Readonly<WgpuEffectApplicationExplanation>,
) => void;
