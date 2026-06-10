import type { SurfaceRegion } from '@flighthq/types';

export interface SurfaceConvolutionFilterOptions {
  bias?: number;
  clamp?: boolean;
  color?: number;
  divisor?: number;
  matrix: ReadonlyArray<number>;
  matrixX: number;
  matrixY: number;
  preserveAlpha?: boolean;
}

/**
 * Applies a convolution filter to `source` and writes into `out`.
 * `out` must be at least `source.width * source.height * 4` bytes.
 *
 * `out` must not alias `source.surface.data` — convolution reads neighboring
 * pixels during kernel evaluation; overlapping source and destination produces
 * undefined results.
 */
export function applySurfaceConvolutionFilter(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceConvolutionFilterOptions>,
): void {
  const { matrix, matrixX, matrixY } = options;
  if (matrixX <= 0 || matrixY <= 0) throw new Error('Convolution filter matrix dimensions must be positive');
  if (matrix.length < matrixX * matrixY) throw new Error('Convolution filter matrix does not match its dimensions');

  const divisor = options.divisor ?? getConvolutionDivisor(matrix, matrixX * matrixY);
  const bias = options.bias ?? 0;
  const clampEdge = options.clamp ?? true;
  const preserveAlpha = options.preserveAlpha ?? true;
  const offsetX = Math.floor(matrixX / 2);
  const offsetY = Math.floor(matrixY / 2);

  for (let py = 0; py < source.height; py++) {
    for (let px = 0; px < source.width; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let ky = 0; ky < matrixY; ky++) {
        for (let kx = 0; kx < matrixX; kx++) {
          const sample = sampleConvolutionPixel(
            source,
            source.x + px + kx - offsetX,
            source.y + py + ky - offsetY,
            clampEdge,
            options.color ?? 0,
          );
          const weight = matrix[ky * matrixX + kx];
          r += sample.r * weight;
          g += sample.g * weight;
          b += sample.b * weight;
          a += sample.a * weight;
        }
      }
      const di = (py * source.width + px) * 4;
      const center = sampleConvolutionPixel(source, source.x + px, source.y + py, true, 0);
      out[di] = clampByte(r / divisor + bias);
      out[di + 1] = clampByte(g / divisor + bias);
      out[di + 2] = clampByte(b / divisor + bias);
      out[di + 3] = preserveAlpha ? center.a : clampByte(a / divisor + bias);
    }
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function getConvolutionDivisor(matrix: ReadonlyArray<number>, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += matrix[i];
  }
  return sum === 0 ? 1 : sum;
}

function sampleConvolutionPixel(
  source: Readonly<SurfaceRegion>,
  x: number,
  y: number,
  clampEdge: boolean,
  color: number,
): { a: number; b: number; g: number; r: number } {
  if (clampEdge) {
    x = Math.max(0, Math.min(source.surface.width - 1, x));
    y = Math.max(0, Math.min(source.surface.height - 1, y));
  } else if (x < 0 || x >= source.surface.width || y < 0 || y >= source.surface.height) {
    return {
      a: color & 0xff,
      b: (color >> 8) & 0xff,
      g: (color >> 16) & 0xff,
      r: (color >>> 24) & 0xff,
    };
  }
  const i = (y * source.surface.width + x) * 4;
  return {
    a: source.surface.data[i + 3],
    b: source.surface.data[i + 2],
    g: source.surface.data[i + 1],
    r: source.surface.data[i],
  };
}
