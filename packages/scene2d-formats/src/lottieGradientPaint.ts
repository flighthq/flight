import { createGradientTransformMatrix } from '@flighthq/geometry/contract';

import { lottieClamp, lottieRgba } from './lottieDocument.ts';
/**
 * Lottie's gradient stop encoding, and the matrix that places a gradient in shape space.
 *
 * ★ TWO OWNERS, WHICH IS WHY IT IS NOT INSIDE THE GRADIENT ITEM. The gradient shape items read the stops out of the
 * document; the core's shape renderer places them when it draws. Splitting it here keeps the reading and the drawing
 * from each carrying a private copy of the same encoding, which is the one thing a format like this cannot afford
 * two of.
 */

export function createLottieGradientMatrix(start: readonly number[], end: readonly number[]) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  return createGradientTransformMatrix(
    Math.hypot(dx, dy) * 2,
    Math.hypot(dx, dy) * 2,
    Math.atan2(dy, dx),
    start[0],
    start[1],
  );
}

export function interpolateLottieGradientOpacity(
  stops: readonly Readonly<{ alpha: number; offset: number }>[],
  offset: number,
): number {
  if (stops.length === 0) return 1;
  if (offset <= stops[0].offset) return stops[0].alpha;
  for (let index = 1; index < stops.length; index++) {
    const previous = stops[index - 1];
    const next = stops[index];
    if (offset > next.offset) continue;
    const distance = next.offset - previous.offset;
    if (distance === 0) return next.alpha;
    const progress = (offset - previous.offset) / distance;
    return previous.alpha + (next.alpha - previous.alpha) * progress;
  }
  return stops[stops.length - 1].alpha;
}

export function parseLottieGradient(values: readonly number[], count: number, opacity: number) {
  const colors: number[] = [];
  const ratios: number[] = [];
  const opacityStops: Array<Readonly<{ alpha: number; offset: number }>> = [];
  for (let index = count * 4; index + 1 < values.length; index += 2) {
    opacityStops.push({
      alpha: lottieClamp(values[index + 1], 0, 1),
      offset: lottieClamp(values[index], 0, 1),
    });
  }
  opacityStops.sort((left, right) => left.offset - right.offset);
  const alphas: number[] = [];
  for (let index = 0; index < count; index++) {
    const offset = index * 4;
    const ratio = lottieClamp(values[offset] ?? 0, 0, 1);
    ratios.push(Math.round(ratio * 255));
    colors.push(lottieRgba(values.slice(offset + 1, offset + 4)));
    alphas.push(opacity * interpolateLottieGradientOpacity(opacityStops, ratio));
  }
  return { alphas, colors, ratios };
}
