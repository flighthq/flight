import { createMatrix } from '@flighthq/geometry';
import type {
  GradientType,
  ImageResource,
  InterpolationMethod,
  Matrix,
  MatrixLike,
  SpreadMethod,
} from '@flighthq/types';

// Flash's gradient box is normalized to ±819.2 units.
const GRADIENT_HALF = 819.2;

export function createBitmapPattern(
  context: CanvasRenderingContext2D,
  bitmap: ImageResource,
  repeat: boolean,
  smooth = false,
): CanvasPattern | null {
  if (bitmap.source === null) return null;
  setSmoothing(context, smooth);
  return context.createPattern(bitmap.source, repeat ? 'repeat' : 'no-repeat');
}

export function createGradientPattern(
  context: CanvasRenderingContext2D,
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
  return createLinearGradient(context, colors, alphas, ratios, mat, spreadMethod);
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

  const offscreen = document.createElement('canvas');
  offscreen.width = context.canvas.width;
  offscreen.height = context.canvas.height;
  const octx = offscreen.getContext('2d');
  if (octx === null) return null;

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

function setSmoothing(context: CanvasRenderingContext2D, smooth: boolean): void {
  if (context.imageSmoothingEnabled !== smooth) {
    context.imageSmoothingEnabled = smooth;
  }
}

function rgbaString(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}
