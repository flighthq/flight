import type { Surface } from '@flighthq/types';

export interface SurfaceBlurFilterOptions {
  blurX?: number;
  blurY?: number;
  quality?: number;
}

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

export interface SurfaceDropShadowFilterOptions extends SurfaceBlurFilterOptions {
  alpha?: number;
  angle?: number;
  color?: number;
  distance?: number;
  hideObject?: boolean;
  strength?: number;
}

export interface SurfaceGlowFilterOptions extends SurfaceBlurFilterOptions {
  alpha?: number;
  color?: number;
  knockout?: boolean;
  strength?: number;
}

export function applySurfaceBlurFilter(
  source: Readonly<Surface>,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dest: Surface,
  dx: number,
  dy: number,
  options: Readonly<SurfaceBlurFilterOptions> = {},
): void {
  const sourceRect = copySurfaceRect(source, sx, sy, sw, sh);
  const blurred = blurPixels(sourceRect, sw, sh, options.blurX ?? 4, options.blurY ?? 4, options.quality ?? 1);
  writePixels(dest, dx, dy, sw, sh, blurred);
}

export function applySurfaceColorMatrixFilter(
  source: Readonly<Surface>,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dest: Surface,
  dx: number,
  dy: number,
  matrix: ReadonlyArray<number>,
): void {
  if (matrix.length < 20) throw new Error('Color matrix filter requires 20 values');

  const sourceRect = copySurfaceRect(source, sx, sy, sw, sh);
  const out = new Uint8ClampedArray(sourceRect.length);
  for (let i = 0; i < sourceRect.length; i += 4) {
    const r = sourceRect[i];
    const g = sourceRect[i + 1];
    const b = sourceRect[i + 2];
    const a = sourceRect[i + 3];
    out[i] = clampByte(r * matrix[0] + g * matrix[1] + b * matrix[2] + a * matrix[3] + matrix[4]);
    out[i + 1] = clampByte(r * matrix[5] + g * matrix[6] + b * matrix[7] + a * matrix[8] + matrix[9]);
    out[i + 2] = clampByte(r * matrix[10] + g * matrix[11] + b * matrix[12] + a * matrix[13] + matrix[14]);
    out[i + 3] = clampByte(r * matrix[15] + g * matrix[16] + b * matrix[17] + a * matrix[18] + matrix[19]);
  }
  writePixels(dest, dx, dy, sw, sh, out);
}

export function applySurfaceConvolutionFilter(
  source: Readonly<Surface>,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dest: Surface,
  dx: number,
  dy: number,
  options: Readonly<SurfaceConvolutionFilterOptions>,
): void {
  const { matrix, matrixX, matrixY } = options;
  if (matrixX <= 0 || matrixY <= 0) throw new Error('Convolution filter matrix dimensions must be positive');
  if (matrix.length < matrixX * matrixY) throw new Error('Convolution filter matrix does not match its dimensions');

  const divisor = options.divisor ?? getConvolutionDivisor(matrix, matrixX * matrixY);
  const bias = options.bias ?? 0;
  const clamp = options.clamp ?? true;
  const preserveAlpha = options.preserveAlpha ?? true;
  const out = new Uint8ClampedArray(sw * sh * 4);
  const offsetX = Math.floor(matrixX / 2);
  const offsetY = Math.floor(matrixY / 2);

  for (let py = 0; py < sh; py++) {
    for (let px = 0; px < sw; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let ky = 0; ky < matrixY; ky++) {
        for (let kx = 0; kx < matrixX; kx++) {
          const sample = getConvolutionSample(
            source,
            sx + px + kx - offsetX,
            sy + py + ky - offsetY,
            clamp,
            options.color ?? 0,
          );
          const weight = matrix[ky * matrixX + kx];
          r += sample.r * weight;
          g += sample.g * weight;
          b += sample.b * weight;
          a += sample.a * weight;
        }
      }
      const di = (py * sw + px) * 4;
      const center = getConvolutionSample(source, sx + px, sy + py, true, 0);
      out[di] = clampByte(r / divisor + bias);
      out[di + 1] = clampByte(g / divisor + bias);
      out[di + 2] = clampByte(b / divisor + bias);
      out[di + 3] = preserveAlpha ? center.a : clampByte(a / divisor + bias);
    }
  }
  writePixels(dest, dx, dy, sw, sh, out);
}

export function applySurfaceDropShadowFilter(
  source: Readonly<Surface>,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dest: Surface,
  dx: number,
  dy: number,
  options: Readonly<SurfaceDropShadowFilterOptions> = {},
): void {
  const distance = options.distance ?? 4;
  const angle = ((options.angle ?? 45) * Math.PI) / 180;
  const offsetX = Math.round(Math.cos(angle) * distance);
  const offsetY = Math.round(Math.sin(angle) * distance);
  const shadow = createTintedAlphaMask(
    source,
    sx,
    sy,
    sw,
    sh,
    options.color ?? 0,
    options.alpha ?? 1,
    options.strength ?? 1,
  );
  const blurred = blurPixels(shadow, sw, sh, options.blurX ?? 4, options.blurY ?? 4, options.quality ?? 1);
  compositePixels(dest, dx + offsetX, dy + offsetY, sw, sh, blurred);

  if (!options.hideObject) {
    compositeSurfaceRect(source, sx, sy, sw, sh, dest, dx, dy);
  }
}

export function applySurfaceGlowFilter(
  source: Readonly<Surface>,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dest: Surface,
  dx: number,
  dy: number,
  options: Readonly<SurfaceGlowFilterOptions> = {},
): void {
  const glow = createTintedAlphaMask(
    source,
    sx,
    sy,
    sw,
    sh,
    options.color ?? 0xff0000,
    options.alpha ?? 1,
    options.strength ?? 1,
  );
  const blurred = blurPixels(glow, sw, sh, options.blurX ?? 6, options.blurY ?? 6, options.quality ?? 1);
  compositePixels(dest, dx, dy, sw, sh, blurred);

  if (!options.knockout) {
    compositeSurfaceRect(source, sx, sy, sw, sh, dest, dx, dy);
  }
}

function blurPixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  blurX: number,
  blurY: number,
  quality: number,
): Uint8ClampedArray {
  const passes = Math.max(1, Math.round(quality));
  const radiusX = Math.max(0, Math.round(blurX / 2));
  const radiusY = Math.max(0, Math.round(blurY / 2));
  let current = new Uint8ClampedArray(source);
  let scratch = new Uint8ClampedArray(source.length);

  for (let pass = 0; pass < passes; pass++) {
    if (radiusX > 0) {
      blurHorizontal(current, scratch, width, height, radiusX);
      [current, scratch] = [scratch, current];
    }
    if (radiusY > 0) {
      blurVertical(current, scratch, width, height, radiusY);
      [current, scratch] = [scratch, current];
    }
  }

  return current;
}

function blurHorizontal(
  source: Uint8ClampedArray,
  dest: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      const x1 = Math.max(0, x - radius);
      const x2 = Math.min(width - 1, x + radius);
      for (let px = x1; px <= x2; px++) {
        const i = (y * width + px) * 4;
        r += source[i];
        g += source[i + 1];
        b += source[i + 2];
        a += source[i + 3];
        count++;
      }
      const di = (y * width + x) * 4;
      dest[di] = Math.round(r / count);
      dest[di + 1] = Math.round(g / count);
      dest[di + 2] = Math.round(b / count);
      dest[di + 3] = Math.round(a / count);
    }
  }
}

function blurVertical(
  source: Uint8ClampedArray,
  dest: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      const y1 = Math.max(0, y - radius);
      const y2 = Math.min(height - 1, y + radius);
      for (let py = y1; py <= y2; py++) {
        const i = (py * width + x) * 4;
        r += source[i];
        g += source[i + 1];
        b += source[i + 2];
        a += source[i + 3];
        count++;
      }
      const di = (y * width + x) * 4;
      dest[di] = Math.round(r / count);
      dest[di + 1] = Math.round(g / count);
      dest[di + 2] = Math.round(b / count);
      dest[di + 3] = Math.round(a / count);
    }
  }
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function compositePixel(dest: Uint8ClampedArray, di: number, r: number, g: number, b: number, a: number): void {
  const srcA = a / 255;
  const dstA = dest[di + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) {
    dest[di] = 0;
    dest[di + 1] = 0;
    dest[di + 2] = 0;
    dest[di + 3] = 0;
    return;
  }
  dest[di] = Math.round((r * srcA + dest[di] * dstA * (1 - srcA)) / outA);
  dest[di + 1] = Math.round((g * srcA + dest[di + 1] * dstA * (1 - srcA)) / outA);
  dest[di + 2] = Math.round((b * srcA + dest[di + 2] * dstA * (1 - srcA)) / outA);
  dest[di + 3] = Math.round(outA * 255);
}

function compositePixels(
  dest: Surface,
  dx: number,
  dy: number,
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
): void {
  for (let py = 0; py < height; py++) {
    const y = dy + py;
    if (y < 0 || y >= dest.height) continue;
    for (let px = 0; px < width; px++) {
      const x = dx + px;
      if (x < 0 || x >= dest.width) continue;
      const si = (py * width + px) * 4;
      compositePixel(dest.data, (y * dest.width + x) * 4, pixels[si], pixels[si + 1], pixels[si + 2], pixels[si + 3]);
    }
  }
}

function compositeSurfaceRect(
  source: Readonly<Surface>,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dest: Surface,
  dx: number,
  dy: number,
): void {
  for (let py = 0; py < sh; py++) {
    const sourceY = sy + py;
    const y = dy + py;
    if (sourceY < 0 || sourceY >= source.height || y < 0 || y >= dest.height) continue;
    for (let px = 0; px < sw; px++) {
      const sourceX = sx + px;
      const x = dx + px;
      if (sourceX < 0 || sourceX >= source.width || x < 0 || x >= dest.width) continue;
      const si = (sourceY * source.width + sourceX) * 4;
      compositePixel(
        dest.data,
        (y * dest.width + x) * 4,
        source.data[si],
        source.data[si + 1],
        source.data[si + 2],
        source.data[si + 3],
      );
    }
  }
}

function copySurfaceRect(source: Readonly<Surface>, sx: number, sy: number, sw: number, sh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(sw * sh * 4);
  for (let py = 0; py < sh; py++) {
    const sourceY = sy + py;
    if (sourceY < 0 || sourceY >= source.height) continue;
    for (let px = 0; px < sw; px++) {
      const sourceX = sx + px;
      if (sourceX < 0 || sourceX >= source.width) continue;
      const si = (sourceY * source.width + sourceX) * 4;
      const di = (py * sw + px) * 4;
      out[di] = source.data[si];
      out[di + 1] = source.data[si + 1];
      out[di + 2] = source.data[si + 2];
      out[di + 3] = source.data[si + 3];
    }
  }
  return out;
}

function createTintedAlphaMask(
  source: Readonly<Surface>,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  color: number,
  alpha: number,
  strength: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(sw * sh * 4);
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const alphaScale = Math.max(0, alpha) * Math.max(0, strength);
  for (let py = 0; py < sh; py++) {
    const sourceY = sy + py;
    if (sourceY < 0 || sourceY >= source.height) continue;
    for (let px = 0; px < sw; px++) {
      const sourceX = sx + px;
      if (sourceX < 0 || sourceX >= source.width) continue;
      const si = (sourceY * source.width + sourceX) * 4;
      const di = (py * sw + px) * 4;
      out[di] = r;
      out[di + 1] = g;
      out[di + 2] = b;
      out[di + 3] = Math.min(255, Math.round(source.data[si + 3] * alphaScale));
    }
  }
  return out;
}

function getConvolutionDivisor(matrix: ReadonlyArray<number>, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += matrix[i];
  }
  return sum === 0 ? 1 : sum;
}

function getConvolutionSample(
  source: Readonly<Surface>,
  x: number,
  y: number,
  clamp: boolean,
  color: number,
): { a: number; b: number; g: number; r: number } {
  if (clamp) {
    x = Math.max(0, Math.min(source.width - 1, x));
    y = Math.max(0, Math.min(source.height - 1, y));
  } else if (x < 0 || x >= source.width || y < 0 || y >= source.height) {
    return {
      a: (color >>> 24) & 0xff,
      b: color & 0xff,
      g: (color >> 8) & 0xff,
      r: (color >> 16) & 0xff,
    };
  }
  const i = (y * source.width + x) * 4;
  return {
    a: source.data[i + 3],
    b: source.data[i + 2],
    g: source.data[i + 1],
    r: source.data[i],
  };
}

function writePixels(
  dest: Surface,
  dx: number,
  dy: number,
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
): void {
  for (let py = 0; py < height; py++) {
    const y = dy + py;
    if (y < 0 || y >= dest.height) continue;
    for (let px = 0; px < width; px++) {
      const x = dx + px;
      if (x < 0 || x >= dest.width) continue;
      const si = (py * width + px) * 4;
      const di = (y * dest.width + x) * 4;
      dest.data[di] = pixels[si];
      dest.data[di + 1] = pixels[si + 1];
      dest.data[di + 2] = pixels[si + 2];
      dest.data[di + 3] = pixels[si + 3];
    }
  }
}
