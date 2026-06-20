import type {
  CanvasRenderEffectRunner,
  CanvasRenderTarget,
  GodRaysEffect,
  ScreenSpaceFogEffect,
  SSAOEffect,
  SSREffect,
} from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Atmospheric / depth recipes on Canvas 2D. God rays is a per-fragment radial light march; SSAO, SSR,
// and screen-space fog all read a sampleable depth buffer (and SSR also needs normals) that Canvas 2D
// never produces. None has a 2D draw-op realization, so each ships as a passthrough copy for parity.

// God rays (PASSTHROUGH): radial light scattering marches taps from each fragment toward a light
// position — a per-pixel multi-tap gather with no 2D draw-op path. Shader-only.
export function applyGodRaysEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<GodRaysEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Screen-space fog (PASSTHROUGH): exponential fog by per-pixel depth needs a sampleable depth buffer
// Canvas 2D does not write. Shader-only / depth-only.
export function applyScreenSpaceFogEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<ScreenSpaceFogEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// SSAO (PASSTHROUGH): ambient occlusion reconstructs view-space position/normals from a depth buffer
// and accumulates a sampling kernel — none of which exists on Canvas 2D. Shader-only / depth-only.
export function applySSAOEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<SSAOEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// SSR (PASSTHROUGH): screen-space reflections ray-march against depth using view-space normals; neither
// buffer exists on Canvas 2D. Shader-only / depth-only.
export function applySSREffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<SSREffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasGodRaysEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyGodRaysEffectToCanvas(ctx.source, ctx.dest, effect as GodRaysEffect);
};

export const defaultCanvasScreenSpaceFogEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyScreenSpaceFogEffectToCanvas(ctx.source, ctx.dest, effect as ScreenSpaceFogEffect);
};

export const defaultCanvasSSAOEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applySSAOEffectToCanvas(ctx.source, ctx.dest, effect as SSAOEffect);
};

export const defaultCanvasSSREffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applySSREffectToCanvas(ctx.source, ctx.dest, effect as SSREffect);
};
