import type {
  BokehDepthOfFieldEffect,
  CanvasRenderEffectRunner,
  CanvasRenderTarget,
  ChromaticAberrationEffect,
  DisplacementEffect,
  LensDirtEffect,
  LensDistortionEffect,
  LensFlareEffect,
  TiltShiftEffect,
  VignetteEffect,
} from '@flighthq/types';

import { drawCanvasEffectPass, passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Lens-camera recipes on Canvas 2D. Vignette is a real draw-op realization (a radial-gradient overlay
// darkening toward the edges); the rest need per-pixel uv remapping or channel-split sampling the CSS
// filter grammar and 2D draw ops cannot express, so they ship as passthrough copies for parity.

// Bokeh depth-of-field (PASSTHROUGH): a per-pixel circle-of-confusion blur driven by a depth buffer.
// Canvas 2D has no depth attachment and no per-pixel variable blur. Shader-only / depth-only.
export function applyBokehDepthOfFieldEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<BokehDepthOfFieldEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Chromatic aberration (PASSTHROUGH): splitting R/G/B channels at offset positions needs per-channel
// sampling; a 2D drawImage cannot address individual color channels. Shader-only.
export function applyChromaticAberrationEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<ChromaticAberrationEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Displacement / heat-haze (PASSTHROUGH): a per-pixel uv warp has no 2D draw-op equivalent. Shader-only.
export function applyDisplacementEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<DisplacementEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Lens dirt (PASSTHROUGH): procedural per-pixel smudge blobs gated by scene brightness have no 2D
// draw-op equivalent. Shader-only.
export function applyLensDirtEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<LensDirtEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Lens distortion (PASSTHROUGH): a radial uv remap (barrel/pincushion) has no 2D draw-op equivalent.
// Shader-only.
export function applyLensDistortionEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<LensDistortionEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Lens flare (PASSTHROUGH): a bright-pass-driven ghost/halo accumulation along the optical axis needs
// HDR bright sampling and per-fragment marching. Shader-only / HDR-only.
export function applyLensFlareEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<LensFlareEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Tilt-shift (PASSTHROUGH): a focus band with blur ramping outside it needs per-pixel variable blur the
// uniform CSS blur() cannot express. Shader-only.
export function applyTiltShiftEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<TiltShiftEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Vignette (REAL): draw the scene, then overlay a radial gradient — transparent inside `radius`,
// ramping to the vignette color over `softness` toward the corners — using the 'multiply' composite op
// so the edges darken toward the color. Intensity and the color's alpha scale the darkening.
export function applyVignetteEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<VignetteEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const radius = effect.radius ?? 0.75;
  const softness = effect.softness ?? 0.45;
  const color = effect.color ?? 0x000000ff;
  const colorAlpha = (color & 0xff) / 255;
  const darken = Math.max(0, Math.min(1, intensity * colorAlpha));

  drawCanvasEffectPass(dest, source, 'none');

  const ctx = dest.context;
  const w = dest.width;
  const h = dest.height;
  const cx = w * 0.5;
  const cy = h * 0.5;
  // The vignette math measures distance to the corner as 1.0 (matching the WebGL recipe's diagonal
  // normalization), so the gradient's outer radius is half the diagonal.
  const outer = Math.sqrt(cx * cx + cy * cy);
  const inner = Math.max(0, Math.min(radius, 1)) * outer;
  const ramp = Math.max(0, inner - softness * outer);

  const gradient = ctx.createRadialGradient(cx, cy, ramp, cx, cy, outer);
  // Opaque-at-center color string with alpha replaced by the darken amount at the rim.
  const r = (color >>> 24) & 0xff;
  const g = (color >>> 16) & 0xff;
  const b = (color >>> 8) & 0xff;
  gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},${darken.toFixed(4)})`);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.filter = 'none';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export const defaultCanvasBokehDepthOfFieldEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyBokehDepthOfFieldEffectToCanvas(ctx.source, ctx.dest, effect as BokehDepthOfFieldEffect);
};

export const defaultCanvasChromaticAberrationEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyChromaticAberrationEffectToCanvas(ctx.source, ctx.dest, effect as ChromaticAberrationEffect);
};

export const defaultCanvasDisplacementEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyDisplacementEffectToCanvas(ctx.source, ctx.dest, effect as DisplacementEffect);
};

export const defaultCanvasLensDirtEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyLensDirtEffectToCanvas(ctx.source, ctx.dest, effect as LensDirtEffect);
};

export const defaultCanvasLensDistortionEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyLensDistortionEffectToCanvas(ctx.source, ctx.dest, effect as LensDistortionEffect);
};

export const defaultCanvasLensFlareEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyLensFlareEffectToCanvas(ctx.source, ctx.dest, effect as LensFlareEffect);
};

export const defaultCanvasTiltShiftEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyTiltShiftEffectToCanvas(ctx.source, ctx.dest, effect as TiltShiftEffect);
};

export const defaultCanvasVignetteEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyVignetteEffectToCanvas(ctx.source, ctx.dest, effect as VignetteEffect);
};
