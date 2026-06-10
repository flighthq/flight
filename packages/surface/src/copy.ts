import type { Surface } from '@flighthq/types';

import type { ImageChannel } from './imageChannel';

export function copySurfaceChannel(
  out: Surface,
  destChannel: ImageChannel,
  source: Surface,
  sourceChannel: ImageChannel,
  sx: number = 0,
  sy: number = 0,
  sw: number = source.width,
  sh: number = source.height,
  dx: number = 0,
  dy: number = 0,
): void {
  const x2 = Math.min(sw, source.width - sx, out.width - dx);
  const y2 = Math.min(sh, source.height - sy, out.height - dy);
  for (let py = 0; py < y2; py++) {
    for (let px = 0; px < x2; px++) {
      const si = ((sy + py) * source.width + (sx + px)) * 4;
      const di = ((dy + py) * out.width + (dx + px)) * 4;
      out.data[di + destChannel] = source.data[si + sourceChannel];
    }
  }
}

export function copySurfacePixels(
  out: Surface,
  dx: number,
  dy: number,
  source: Surface,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  mergeAlpha: boolean = false,
): void {
  const x2 = Math.min(sw, source.width - sx, out.width - dx);
  const y2 = Math.min(sh, source.height - sy, out.height - dy);
  for (let py = 0; py < y2; py++) {
    for (let px = 0; px < x2; px++) {
      const si = ((sy + py) * source.width + (sx + px)) * 4;
      const di = ((dy + py) * out.width + (dx + px)) * 4;
      if (mergeAlpha) {
        const srcA = source.data[si + 3] / 255;
        const dstA = out.data[di + 3] / 255;
        const outA = srcA + dstA * (1 - srcA);
        if (outA > 0) {
          out.data[di] = Math.round((source.data[si] * srcA + out.data[di] * dstA * (1 - srcA)) / outA);
          out.data[di + 1] = Math.round((source.data[si + 1] * srcA + out.data[di + 1] * dstA * (1 - srcA)) / outA);
          out.data[di + 2] = Math.round((source.data[si + 2] * srcA + out.data[di + 2] * dstA * (1 - srcA)) / outA);
          out.data[di + 3] = Math.round(outA * 255);
        }
      } else {
        out.data[di] = source.data[si];
        out.data[di + 1] = source.data[si + 1];
        out.data[di + 2] = source.data[si + 2];
        out.data[di + 3] = source.data[si + 3];
      }
    }
  }
}
