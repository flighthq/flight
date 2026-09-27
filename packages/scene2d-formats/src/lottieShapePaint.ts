import { createPath, dashPath } from '@flighthq/path/contract';
import { appendShapePath } from '@flighthq/shape/contract';
import type { Path, Shape } from '@flighthq/types/contract';

/**
 * Appending a group's paths under one paint, dashed and undashed.
 *
 * ★ TWO FUNCTIONS RATHER THAN ONE WITH A DEFAULT, because the default was never free. A single appender taking
 * `dash: readonly number[] = []` put `dashPath` and a second `createPath` into every build that drew a solid fill, even
 * though a fill has no dash to apply. Splitting them lets a fill-only build link the three-line version and nothing
 * else; the strokes, which are the only paints Lottie dashes, take the other one.
 */
export function appendLottieDashedShapePaths(
  paths: readonly Path[],
  shape: Shape,
  winding: 'evenOdd' | 'nonZero' | null,
  dash: readonly number[],
  dashOffset: number,
): void {
  if (dash.length === 0) {
    appendLottieShapePaths(paths, shape, winding);
    return;
  }
  for (const path of paths) {
    const output = createPath(path.winding);
    // An odd dash list repeats to an even one: Lottie writes `[on]` for an even dash, and a gap of the same length is
    // what that means.
    dashPath(path, dash.length % 2 === 0 ? dash : [...dash, ...dash], dashOffset, output);
    appendShapePath(shape, output.commands.slice(), output.data.slice(), winding ?? output.winding);
  }
}

export function appendLottieShapePaths(
  paths: readonly Path[],
  shape: Shape,
  winding: 'evenOdd' | 'nonZero' | null,
): void {
  for (const path of paths) {
    appendShapePath(shape, path.commands.slice(), path.data.slice(), winding ?? path.winding);
  }
}
