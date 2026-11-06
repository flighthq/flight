import type { ColorLutCache } from './ColorLutCache.ts';
import type { Effect } from './Effect.ts';
import type { GlColorLutTextureCache } from './GlColorLutTextureCache.ts';
import type { GlRenderState } from './GlRenderState.ts';
import type { GlTextureRenderTarget, GlTextureRenderTargetPool } from './GlRenderTarget.ts';
import type { RenderTargetDepth, RenderTargetFormat } from './RenderTarget.ts';

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

export interface EffectStateOptions {
  depth?: RenderTargetDepth;
  format?: RenderTargetFormat;
  sampleCount?: number;
}

export interface GlEffectState {
  readonly options: Readonly<EffectStateOptions>;
  sceneTarget: GlTextureRenderTarget | null;
  readonly pool: GlTextureRenderTargetPool;
  readonly lutCache: ColorLutCache;
  readonly lutTexture: GlColorLutTextureCache;
  velocityTexture: WebGLTexture | null;
}
