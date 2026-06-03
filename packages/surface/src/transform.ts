import type { ColorTransformLike, Surface } from '@flighthq/types';

export type ThresholdOperation = '!=' | '<' | '<=' | '==' | '>' | '>=';

export function applySurfaceColorTransform(
  dest: Surface,
  x: number,
  y: number,
  width: number,
  height: number,
  ct: Readonly<ColorTransformLike>,
): void {
  const x1 = Math.max(0, x);
  const y1 = Math.max(0, y);
  const x2 = Math.min(dest.width, x + width);
  const y2 = Math.min(dest.height, y + height);
  for (let py = y1; py < y2; py++) {
    for (let px = x1; px < x2; px++) {
      const i = (py * dest.width + px) * 4;
      dest.data[i] = Math.max(0, Math.min(255, Math.round(dest.data[i] * ct.redMultiplier + ct.redOffset)));
      dest.data[i + 1] = Math.max(0, Math.min(255, Math.round(dest.data[i + 1] * ct.greenMultiplier + ct.greenOffset)));
      dest.data[i + 2] = Math.max(0, Math.min(255, Math.round(dest.data[i + 2] * ct.blueMultiplier + ct.blueOffset)));
      dest.data[i + 3] = Math.max(0, Math.min(255, Math.round(dest.data[i + 3] * ct.alphaMultiplier + ct.alphaOffset)));
    }
  }
}

export function applySurfaceThreshold(
  source: Readonly<Surface>,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dest: Surface,
  dx: number,
  dy: number,
  operation: ThresholdOperation,
  thresholdValue: number,
  color: number = 0,
  mask: number = 0xffffffff,
  copySource: boolean = false,
): number {
  const x2 = Math.min(sw, source.width - sx, dest.width - dx);
  const y2 = Math.min(sh, source.height - sy, dest.height - dy);
  let changed = 0;
  for (let py = 0; py < y2; py++) {
    for (let px = 0; px < x2; px++) {
      const si = ((sy + py) * source.width + (sx + px)) * 4;
      const di = ((dy + py) * dest.width + (dx + px)) * 4;
      const pixel =
        (((source.data[si + 3] << 24) | (source.data[si] << 16) | (source.data[si + 1] << 8) | source.data[si + 2]) &
          mask) >>>
        0;
      const passes = compare(pixel, operation, thresholdValue >>> 0);
      if (passes) {
        const cr = (color >> 16) & 0xff;
        const cg = (color >> 8) & 0xff;
        const cb = color & 0xff;
        const ca = (color >>> 24) & 0xff;
        dest.data[di] = cr;
        dest.data[di + 1] = cg;
        dest.data[di + 2] = cb;
        dest.data[di + 3] = ca;
        changed++;
      } else if (copySource) {
        dest.data[di] = source.data[si];
        dest.data[di + 1] = source.data[si + 1];
        dest.data[di + 2] = source.data[si + 2];
        dest.data[di + 3] = source.data[si + 3];
      }
    }
  }
  return changed;
}

export function mergeSurface(
  source: Readonly<Surface>,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dest: Surface,
  dx: number,
  dy: number,
  redMultiplier: number,
  greenMultiplier: number,
  blueMultiplier: number,
  alphaMultiplier: number,
): void {
  const x2 = Math.min(sw, source.width - sx, dest.width - dx);
  const y2 = Math.min(sh, source.height - sy, dest.height - dy);
  for (let py = 0; py < y2; py++) {
    for (let px = 0; px < x2; px++) {
      const si = ((sy + py) * source.width + (sx + px)) * 4;
      const di = ((dy + py) * dest.width + (dx + px)) * 4;
      dest.data[di] = Math.round((source.data[si] * redMultiplier + dest.data[di] * (256 - redMultiplier)) / 256);
      dest.data[di + 1] = Math.round(
        (source.data[si + 1] * greenMultiplier + dest.data[di + 1] * (256 - greenMultiplier)) / 256,
      );
      dest.data[di + 2] = Math.round(
        (source.data[si + 2] * blueMultiplier + dest.data[di + 2] * (256 - blueMultiplier)) / 256,
      );
      dest.data[di + 3] = Math.round(
        (source.data[si + 3] * alphaMultiplier + dest.data[di + 3] * (256 - alphaMultiplier)) / 256,
      );
    }
  }
}

export function scrollSurface(dest: Surface, dx: number, dy: number): void {
  const copy = new Uint8ClampedArray(dest.data);
  dest.data.fill(0);
  for (let py = 0; py < dest.height; py++) {
    const srcY = (((py - dy) % dest.height) + dest.height) % dest.height;
    for (let px = 0; px < dest.width; px++) {
      const srcX = (((px - dx) % dest.width) + dest.width) % dest.width;
      const si = (srcY * dest.width + srcX) * 4;
      const di = (py * dest.width + px) * 4;
      dest.data[di] = copy[si];
      dest.data[di + 1] = copy[si + 1];
      dest.data[di + 2] = copy[si + 2];
      dest.data[di + 3] = copy[si + 3];
    }
  }
}

function compare(a: number, op: ThresholdOperation, b: number): boolean {
  switch (op) {
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    case '==':
      return a === b;
    case '!=':
      return a !== b;
  }
}
