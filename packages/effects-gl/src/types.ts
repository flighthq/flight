import type { ColorLut, ColorLutCache } from '@flighthq/adjustments/contract';
import type { EffectStateOptions } from '@flighthq/effects/contract';
import type { GlRenderState, GlTextureRenderTarget, GlTextureRenderTargetPool } from '@flighthq/render-gl/contract';

// Render GL owns the registration contracts embedded in GlRenderState. Re-exporting the same
// identities keeps the effects-gl contract entry convenient without introducing a render→effects
// project cycle or a structurally duplicated registry shape.
export type {
  GlEffectContext,
  GlEffectRegistration,
  GlEffectResolver,
  GlEffectRunner,
} from '@flighthq/render-gl/contract';

// GPU-upload memo for the fused color LUT on WebGL 2: the uploaded `size³` 3D texture and the ColorLut
// reference last written into it. A stable LUT reference lets the effect pipeline skip re-uploading.
export interface GlColorLutTextureCache {
  texture: WebGLTexture | null;
  lut: ColorLut | null;
}

export type GlEffectApplicationStatus =
  | 'complete'
  | 'no-effects'
  | 'partial-registration'
  | 'partial-resolution'
  | 'source-unavailable'
  | 'stale-destination'
  | 'unregistered-effects'
  | 'unresolved-effects';

export interface GlEffectApplicationExplanation {
  readonly registeredCount: number;
  readonly requestedCount: number;
  readonly status: GlEffectApplicationStatus;
  readonly unregisteredKinds: readonly string[];
  // Positions in the submitted chain, not kinds: resolution is per effect instance.
  readonly unresolvedIndexes: readonly number[];
}

export type GlCustomShaderSourceGuard = (
  state: GlRenderState,
  shaderKey: string,
  previousSource: string,
  nextSource: string,
) => void;

export type GlEffectStateSkipGuard = (state: GlRenderState, kind: string) => void;

export type GlEffectApplicationGuard = (
  state: GlRenderState,
  explanation: Readonly<GlEffectApplicationExplanation>,
) => void;

// Retains the GPU resources an effect pass needs across frames. The effect list is per-frame data.
export interface GlEffectState {
  readonly options: Readonly<EffectStateOptions>;
  sceneTarget: GlTextureRenderTarget | null;
  readonly pool: GlTextureRenderTargetPool;
  readonly lutCache: ColorLutCache;
  readonly lutTexture: GlColorLutTextureCache;
  velocityTexture: WebGLTexture | null;
}
