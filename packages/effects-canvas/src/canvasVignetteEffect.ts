import type {
  CanvasRenderEffectRunner,
  CanvasRenderState,
  CanvasRenderTarget,
  VignetteEffect,
} from '@flighthq/types/contract';

import { drawCanvasEffectPass } from './canvasEffectCompositing';
import { registerCanvasRenderEffect } from './canvasRenderEffectRegistry';

// Vignette (REAL): draw the scene, then overlay a radial gradient with the 'multiply' composite op so
// the edges darken toward the vignette color. `intensity` and the color's alpha scale the darkening.
//
// ★ THE TWO PUBLIC PARAMETERS MUST BOTH BE OBSERVABLE, AND ONCE THEY WERE NOT. An earlier revision ran
// the gradient from the ramp start all the way to the FRAME CORNER, so full darkness arrived at the
// corner rather than at `radius`. That made the visible ramp (1 - (radius - softness)) wide instead of
// `softness` wide, which meant `softness` alone set the falloff and `radius` stopped being independently
// observable at all: two parameters collapsed into one, with a picture darker than either asks for. Full
// dark belongs at `radius`; the gradient's own clamp keeps everything beyond it dark.
const RAMP_STOPS = 16;

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
  const red = (color >>> 24) & 0xff;
  const green = (color >>> 16) & 0xff;
  const blue = (color >>> 8) & 0xff;

  // The Gl recipe measures distance in NORMALIZED uv — `length(uv - 0.5) * sqrt(2)`, which is 1.0 at the
  // corner — so its iso-darkness contours are ellipses in pixel space whenever the frame is not square.
  // Drawing the gradient in a unit-square space and letting the transform stretch it reproduces that
  // geometry exactly; a circular gradient in pixel space would be a different shape on every non-square
  // target. A unit-space radius of 1/sqrt(2) is the corner, so a Gl distance d maps to d/sqrt(2) here.
  const toUnitRadius = 1 / Math.SQRT2;
  const outerRadius = Math.max(0, Math.min(radius, 1)) * toUnitRadius;
  // A zero-width ramp is a hard edge; createRadialGradient requires r0 < r1, so keep a hair of width.
  const innerRadius = Math.max(0, Math.min(outerRadius - softness * toUnitRadius, outerRadius - 1e-4));

  const gradient = ctx.createRadialGradient(0.5, 0.5, innerRadius, 0.5, 0.5, outerRadius);
  // Gl eases with smoothstep, and a Canvas gradient interpolates its stops LINEARLY, so the curve has to
  // be sampled into stops rather than declared. Substituting a straight line here would keep both
  // endpoints correct and still put the midpoint ~9% of full darkening away from the Gl render.
  for (let stop = 0; stop <= RAMP_STOPS; stop++) {
    const t = stop / RAMP_STOPS;
    const eased = t * t * (3 - 2 * t);
    gradient.addColorStop(t, `rgba(${red},${green},${blue},${(darken * eased).toFixed(4)})`);
  }

  ctx.save();
  // Unit-square space: (0,0)-(1,1) covers the target, so the circular gradient above becomes the same
  // ellipse Gl draws. Everything past `outerRadius` keeps the final stop's color, which is the clamp
  // that makes "full dark at radius, and darker nowhere else" true out to the corners.
  ctx.setTransform(w, 0, 0, h, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.filter = 'none';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1, 1);
  ctx.restore();
}

export const defaultCanvasVignetteEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyVignetteEffectToCanvas(ctx.source, ctx.dest, effect as VignetteEffect);
};

export function registerCanvasVignetteEffect(state: CanvasRenderState): void {
  registerCanvasRenderEffect(state, 'VignetteEffect', defaultCanvasVignetteEffectRunner);
}
