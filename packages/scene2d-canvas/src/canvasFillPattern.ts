import { createMatrix } from '@flighthq/geometry/contract';
import type {
  CanvasTextureResolvers,
  GradientType,
  InterpolationMethod,
  Matrix,
  MatrixLike,
  SpreadMethod,
  Texture,
} from '@flighthq/types/contract';

import { acquireCanvasTextureResolverSurface } from './canvasTextureResolver';
import { resolveCanvasTextureWindowSource } from './canvasTextureWindowSource';

// Flash's gradient box is normalized to ±819.2 units.
const GRADIENT_HALF = 819.2;

export function createBitmapPattern(
  context: CanvasRenderingContext2D,
  texture: Readonly<Texture>,
  resolvers: CanvasTextureResolvers,
  allowSmoothing = true,
): CanvasPattern | null {
  const source = resolveCanvasTextureWindowSource(resolvers, texture);
  if (source === null) return null;
  const smooth = allowSmoothing && !texture.sampler.magFilter.startsWith('nearest');
  setSmoothing(context, smooth);
  return context.createPattern(source, getCanvasPatternRepetition(texture));
}

export function createGradientPattern(
  context: CanvasRenderingContext2D,
  resolvers: CanvasTextureResolvers,
  gradientType: GradientType,
  colors: number[],
  alphas: number[],
  ratios: number[],
  m: Matrix | null,
  spreadMethod: SpreadMethod,
  _interpolationMethod: InterpolationMethod,
  focalPointRatio: number,
): CanvasPattern | CanvasGradient | null {
  const mat = m ?? IDENTITY;

  if (gradientType === 'radial') {
    return createRadialGradient(context, colors, alphas, ratios, mat, focalPointRatio);
  }
  return createLinearGradient(context, resolvers, colors, alphas, ratios, mat, spreadMethod);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const IDENTITY = createMatrix();

function tp(m: MatrixLike, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty];
}

function addColorStops(gradient: CanvasGradient, colors: number[], alphas: number[], ratios: number[]): void {
  for (let i = 0; i < colors.length; i++) {
    const ratio = Math.max(0, Math.min(1, ratios[i] / 0xff));
    gradient.addColorStop(ratio, rgbaString(colors[i], alphas[i]));
  }
}

function createRadialGradient(
  context: CanvasRenderingContext2D,
  colors: number[],
  alphas: number[],
  ratios: number[],
  m: MatrixLike,
  focalPointRatio: number,
): CanvasGradient {
  const clampedFocal = Math.max(-1, Math.min(1, focalPointRatio));

  const [fx, fy] = tp(m, clampedFocal * GRADIENT_HALF, 0);
  const [cx, cy] = tp(m, 0, 0);
  const [ex, ey] = tp(m, GRADIENT_HALF, 0);

  const dx = ex - cx;
  const dy = ey - cy;
  const radius = Math.sqrt(dx * dx + dy * dy);

  const gradient = context.createRadialGradient(fx, fy, 0, cx, cy, radius);
  addColorStops(gradient, colors, alphas, ratios);
  return gradient;
}

function createLinearGradient(
  context: CanvasRenderingContext2D,
  resolvers: CanvasTextureResolvers,
  colors: number[],
  alphas: number[],
  ratios: number[],
  m: MatrixLike,
  spreadMethod: SpreadMethod,
): CanvasGradient | CanvasPattern | null {
  if (spreadMethod === 'pad') {
    const [x1, y1] = tp(m, -GRADIENT_HALF, 0);
    const [x2, y2] = tp(m, GRADIENT_HALF, 0);
    const gradient = context.createLinearGradient(x1, y1, x2, y2);
    addColorStops(gradient, colors, alphas, ratios);
    return gradient;
  }

  // reflect / repeat: tile the gradient across 25 repetitions using an
  // offscreen canvas, then return a pattern from it.
  const STEPS = 25;
  const step = 1 / STEPS;

  const [x1, y1] = tp(m, -GRADIENT_HALF, 0);
  const [x2, y2] = tp(m, GRADIENT_HALF, 0);
  const dx = x2 - x1;
  const dy = y2 - y1;

  const surface = acquireCanvasTextureResolverSurface(resolvers, {
    height: context.canvas.height,
    pixelRatio: 1,
    width: context.canvas.width,
  });
  if (surface === null) return null;
  const offscreen = surface.canvas;
  const octx = surface.context;

  const tiledGradient = octx.createLinearGradient(
    x1 - dx * ((STEPS - 1) / 2),
    y1 - dy * ((STEPS - 1) / 2),
    x2 + dx * ((STEPS - 1) / 2),
    y2 + dy * ((STEPS - 1) / 2),
  );

  if (spreadMethod === 'reflect') {
    let t = 0;
    while (t < 1) {
      for (let i = 0; i < colors.length; i++) {
        const ratio = Math.max(0, Math.min(1, t + (ratios[i] / 0xff) * step));
        tiledGradient.addColorStop(ratio, rgbaString(colors[i], alphas[i]));
      }
      t += step;
      for (let i = colors.length - 1; i >= 0; i--) {
        const ratio = Math.max(0, Math.min(1, t + (1 - ratios[i] / 0xff) * step));
        tiledGradient.addColorStop(ratio, rgbaString(colors[i], alphas[i]));
      }
      t += step;
    }
  } else {
    let t = 0;
    while (t < 1) {
      for (let i = 0; i < colors.length; i++) {
        const ratio = Math.max(0, Math.min(1 - 0.001, t + (ratios[i] / 0xff) * step));
        tiledGradient.addColorStop(ratio, rgbaString(colors[i], alphas[i]));
      }
      const seam = Math.max(0, Math.min(1, t + 0.001));
      tiledGradient.addColorStop(seam - 0.001, rgbaString(colors[colors.length - 1], alphas[alphas.length - 1]));
      tiledGradient.addColorStop(seam, rgbaString(colors[0], alphas[0]));
      t += step;
    }
  }

  octx.fillStyle = tiledGradient;
  octx.fillRect(0, 0, offscreen.width, offscreen.height);
  return context.createPattern(offscreen, 'no-repeat');
}

function getCanvasPatternRepetition(texture: Readonly<Texture>): 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y' {
  const repeatX = texture.sampler.wrapU !== 'clamp-to-edge';
  const repeatY = texture.sampler.wrapV !== 'clamp-to-edge';
  if (repeatX && repeatY) return 'repeat';
  if (repeatX) return 'repeat-x';
  if (repeatY) return 'repeat-y';
  return 'no-repeat';
}

function setSmoothing(context: CanvasRenderingContext2D, smooth: boolean): void {
  if (context.imageSmoothingEnabled !== smooth) {
    context.imageSmoothingEnabled = smooth;
  }
}

function rgbaString(color: number, alpha: number): string {
  const r = (color >>> 24) & 0xff;
  const g = (color >>> 16) & 0xff;
  const b = (color >>> 8) & 0xff;
  const a = ((color & 0xff) / 0xff) * alpha;
  return `rgba(${r},${g},${b},${a})`;
}
