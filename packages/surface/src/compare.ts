import type { Surface } from '@flighthq/types';

import { createSurface } from './surface';

/**
 * Compares two surfaces pixel by pixel. Returns `null` if they are identical,
 * or a new Surface showing per-channel absolute differences (with alpha set to
 * 255 wherever any channel differs). Throws if the surfaces have different
 * dimensions — comparing incompatible surfaces is a programmer error.
 */
export function compareSurface(source: Readonly<Surface>, other: Readonly<Surface>): Surface | null {
  if (source.width !== other.width || source.height !== other.height) {
    throw new Error(
      `compareSurface: surface dimensions do not match (${source.width}×${source.height} vs ${other.width}×${other.height})`,
    );
  }

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

  return hasDiff ? result : null;
}
