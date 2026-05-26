import type { ImageChannel } from './imageChannel';

export function copyChannel(
  source: ImageData,
  sourceChannel: ImageChannel,
  dest: ImageData,
  destChannel: ImageChannel,
  sx: number = 0,
  sy: number = 0,
  sw: number = source.width,
  sh: number = source.height,
  dx: number = 0,
  dy: number = 0,
): void {
  const x2 = Math.min(sw, source.width - sx, dest.width - dx);
  const y2 = Math.min(sh, source.height - sy, dest.height - dy);
  for (let py = 0; py < y2; py++) {
    for (let px = 0; px < x2; px++) {
      const si = ((sy + py) * source.width + (sx + px)) * 4;
      const di = ((dy + py) * dest.width + (dx + px)) * 4;
      dest.data[di + destChannel] = source.data[si + sourceChannel];
    }
  }
}

export function copyPixels(
  source: ImageData,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dest: ImageData,
  dx: number,
  dy: number,
  mergeAlpha: boolean = false,
): void {
  const x2 = Math.min(sw, source.width - sx, dest.width - dx);
  const y2 = Math.min(sh, source.height - sy, dest.height - dy);
  for (let py = 0; py < y2; py++) {
    for (let px = 0; px < x2; px++) {
      const si = ((sy + py) * source.width + (sx + px)) * 4;
      const di = ((dy + py) * dest.width + (dx + px)) * 4;
      if (mergeAlpha) {
        const srcA = source.data[si + 3] / 255;
        const dstA = dest.data[di + 3] / 255;
        const outA = srcA + dstA * (1 - srcA);
        if (outA > 0) {
          dest.data[di] = Math.round((source.data[si] * srcA + dest.data[di] * dstA * (1 - srcA)) / outA);
          dest.data[di + 1] = Math.round((source.data[si + 1] * srcA + dest.data[di + 1] * dstA * (1 - srcA)) / outA);
          dest.data[di + 2] = Math.round((source.data[si + 2] * srcA + dest.data[di + 2] * dstA * (1 - srcA)) / outA);
          dest.data[di + 3] = Math.round(outA * 255);
        }
      } else {
        dest.data[di] = source.data[si];
        dest.data[di + 1] = source.data[si + 1];
        dest.data[di + 2] = source.data[si + 2];
        dest.data[di + 3] = source.data[si + 3];
      }
    }
  }
}
