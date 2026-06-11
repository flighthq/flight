import type { Surface } from '@flighthq/types';

import { createSurface } from './surface';

export function compareSurface(source: Readonly<Surface>, other: Readonly<Surface> | null): Surface | 0 | -1 | -2 | -3 {
  if (other === null) return -1;
  if (source.width !== other.width) return -2;
  if (source.height !== other.height) return -3;

  const result = createSurface(source.width, source.height);
  let hasDiff = false;

  for (let i = 0; i < source.data.length; i += 4) {
    const dr = Math.abs(source.data[i] - other.data[i]);
    const dg = Math.abs(source.data[i + 1] - other.data[i + 1]);
    const db = Math.abs(source.data[i + 2] - other.data[i + 2]);
    const da = Math.abs(source.data[i + 3] - other.data[i + 3]);
    if (dr !== 0 || dg !== 0 || db !== 0 || da !== 0) {
      result.data[i] = dr;
      result.data[i + 1] = dg;
      result.data[i + 2] = db;
      result.data[i + 3] = 255;
      hasDiff = true;
    }
  }

  return hasDiff ? result : 0;
}
