import type { SurfaceConvolutionOptions, SurfaceRegion } from '@flighthq/types';

/**
 * Applies a convolution kernel to `source` and writes into `out`.
 * `out` must be at least `source.width * source.height * 4` bytes.
 *
 * `out` must not alias `source.surface.data` — convolution reads neighboring
 * pixels during kernel evaluation; overlapping source and destination produces
 * undefined results.
 *
 * Edge modes:
 *   - `'clamp'` (default): repeat the nearest edge pixel
 *   - `'transparent'`: treat out-of-bounds samples as transparent black
 *   - `'wrap'`: tile the surface toroidally
 *   - `'mirror'`: reflect the image at boundaries
 */
export function convolveSurface(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceConvolutionOptions>,
): void {
  const { matrix, matrixX, matrixY } = options;
  if (matrixX <= 0 || matrixY <= 0) throw new Error('Convolution filter matrix dimensions must be positive');
  if (matrix.length < matrixX * matrixY) throw new Error('Convolution filter matrix does not match its dimensions');

  const rawDivisor = options.divisor ?? getConvolutionDivisor(matrix, matrixX * matrixY);
  const divisor = rawDivisor === 0 ? 1 : rawDivisor;
  const bias = options.bias ?? 0;
  const edge = options.edge ?? 'clamp';
  const preserveAlpha = options.preserveAlpha ?? true;
  const offsetX = Math.floor(matrixX / 2);
  const offsetY = Math.floor(matrixY / 2);
  const surfaceWidth = source.surface.width;
  const surfaceHeight = source.surface.height;
  const data = source.surface.data;

  for (let py = 0; py < source.height; py++) {
    for (let px = 0; px < source.width; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let ky = 0; ky < matrixY; ky++) {
        const rawSampleY = source.y + py + ky - offsetY;
        const weight_row_start = ky * matrixX;
        for (let kx = 0; kx < matrixX; kx++) {
          const rawSampleX = source.x + px + kx - offsetX;
          const weight = matrix[weight_row_start + kx];
          let sampleX: number;
          let sampleY: number;

          if (rawSampleY < 0 || rawSampleY >= surfaceHeight || rawSampleX < 0 || rawSampleX >= surfaceWidth) {
            if (edge === 'transparent') {
              continue;
            } else if (edge === 'wrap') {
              sampleX = ((rawSampleX % surfaceWidth) + surfaceWidth) % surfaceWidth;
              sampleY = ((rawSampleY % surfaceHeight) + surfaceHeight) % surfaceHeight;
            } else if (edge === 'mirror') {
              sampleX = resolveConvolutionMirror(rawSampleX, surfaceWidth);
              sampleY = resolveConvolutionMirror(rawSampleY, surfaceHeight);
            } else {
              sampleX = rawSampleX < 0 ? 0 : rawSampleX >= surfaceWidth ? surfaceWidth - 1 : rawSampleX;
              sampleY = rawSampleY < 0 ? 0 : rawSampleY >= surfaceHeight ? surfaceHeight - 1 : rawSampleY;
            }
          } else {
            sampleX = rawSampleX;
            sampleY = rawSampleY;
          }

          const i = (sampleY * surfaceWidth + sampleX) * 4;
          r += data[i] * weight;
          g += data[i + 1] * weight;
          b += data[i + 2] * weight;
          a += data[i + 3] * weight;
        }
      }
      const di = (py * source.width + px) * 4;
      out[di] = clampByte(r / divisor + bias);
      out[di + 1] = clampByte(g / divisor + bias);
      out[di + 2] = clampByte(b / divisor + bias);
      if (preserveAlpha) {
        const cy = Math.max(0, Math.min(surfaceHeight - 1, source.y + py));
        const cx = Math.max(0, Math.min(surfaceWidth - 1, source.x + px));
        out[di + 3] = data[(cy * surfaceWidth + cx) * 4 + 3];
      } else {
        out[di + 3] = clampByte(a / divisor + bias);
      }
    }
  }
}

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

function resolveConvolutionMirror(v: number, size: number): number {
  const period = 2 * size;
  const wrapped = ((v % period) + period) % period;
  return wrapped < size ? wrapped : period - 1 - wrapped;
}
