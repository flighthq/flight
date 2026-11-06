import type { ColorLut, ColorLutCache } from '@flighthq/adjustments/contract';
import type { Effect, EffectStateOptions } from '@flighthq/effects/contract';
import type { GlRenderState, GlTextureRenderTarget, GlTextureRenderTargetPool } from '@flighthq/render-gl/contract';

// GPU-upload memo for the fused color LUT on WebGL 2: the uploaded `size³` 3D texture and the ColorLut
// reference last written into it. A stable LUT reference lets the effect pipeline skip re-uploading.
export interface GlColorLutTextureCache {
  texture: WebGLTexture | null;
  lut: ColorLut | null;
}

// What a GL effect runner is handed: the state, the input it reads, the output it writes, the pool
// it borrows intermediate targets from, and the scene G-buffer attachments.
export interface GlEffectContext {
  readonly state: GlRenderState;
  readonly source: Readonly<GlTextureRenderTarget>;
  readonly dest: Readonly<GlTextureRenderTarget>;
  readonly pool: GlTextureRenderTargetPool;
  readonly sceneDepthTexture: WebGLTexture | null;
  readonly sceneVelocityTexture: WebGLTexture | null;
}

export type GlEffectRunner = (ctx: Readonly<GlEffectContext>, effect: Readonly<Effect>) => void;

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

export type GlEffectResolver = (state: GlRenderState, effect: Readonly<Effect>) => boolean;

export interface GlEffectRegistration {
  readonly isResolvable?: GlEffectResolver;
  readonly runner: GlEffectRunner;
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
