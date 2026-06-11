import type { SurfaceHistogram, SurfaceRegion } from '@flighthq/types';

/**
 * Counts how many pixels in the `source` region fall into each 0..255 value,
 * per channel, and returns four 256-entry arrays. Region pixels outside the
 * surface are skipped; an empty region yields all-zero bins.
 *
 * Allocates the result arrays; this is an analysis query, not a hot-path pass.
 */
export function getSurfaceHistogram(source: Readonly<SurfaceRegion>): SurfaceHistogram {
  const red = new Array<number>(256).fill(0);
  const green = new Array<number>(256).fill(0);
  const blue = new Array<number>(256).fill(0);
  const alpha = new Array<number>(256).fill(0);
  const data = source.surface.data;
  const surfaceWidth = source.surface.width;
  for (let py = 0; py < source.height; py++) {
    const y = source.y + py;
    if (y < 0 || y >= source.surface.height) continue;
    for (let px = 0; px < source.width; px++) {
      const x = source.x + px;
      if (x < 0 || x >= surfaceWidth) continue;
      const i = (y * surfaceWidth + x) * 4;
      red[data[i]]++;
      green[data[i + 1]]++;
      blue[data[i + 2]]++;
      alpha[data[i + 3]]++;
    }
  }
  return { alpha, blue, green, red };
}
