import type { LottieGradientPaint, LottieGradientShapeItem, LottieShapeItemContext } from '@flighthq/types/contract';

import {
  bindMutableLottieNumericProperty,
  initialLottieValue,
  isAnimatedLottieProperty,
  lottieNumericValue,
  reportLottieSkip,
} from './lottieDocument.ts';
import { mapLottieLineCap, mapLottieLineJoin } from './lottieStrokeShapeItem.ts';
function handleLottieGradientItem(context: LottieShapeItemContext): void {
  const gradient = context.item as Readonly<LottieGradientShapeItem>;
  const initialGradient = initialLottieValue(gradient.g.k);
  const values = lottieNumericValue(
    initialGradient,
    Math.max(gradient.g.p * 4, Array.isArray(initialGradient) ? initialGradient.length : 0),
  );
  const start = lottieNumericValue(initialLottieValue(gradient.s), 2);
  const end = lottieNumericValue(initialLottieValue(gradient.e), 2);
  const opacity = [gradient.o === undefined ? 100 : lottieNumericValue(initialLottieValue(gradient.o), 1)[0]];
  const width = [gradient.w === undefined ? 1 : lottieNumericValue(initialLottieValue(gradient.w), 1)[0]];
  const miterLimit = [
    gradient.ml2 === undefined ? (gradient.ml ?? 4) : lottieNumericValue(initialLottieValue(gradient.ml2), 1)[0],
  ];
  const dashEntries = gradient.d ?? [];
  const hasAnimatedDash = dashEntries.some((entry) => isAnimatedLottieProperty(entry.v));
  const dash = hasAnimatedDash
    ? []
    : dashEntries
        .filter((entry) => entry.n !== 'o')
        .map((entry) => Math.max(0, lottieNumericValue(initialLottieValue(entry.v), 1)[0]));
  const dashOffsetEntry = dashEntries.find((entry) => entry.n === 'o');
  const dashOffset =
    hasAnimatedDash || dashOffsetEntry === undefined
      ? 0
      : lottieNumericValue(initialLottieValue(dashOffsetEntry.v), 1)[0];
  if (hasAnimatedDash)
    reportLottieSkip(context.import, 'lottie.unsupported-shape-modifier', 'handleLottieGradientItem', {
      modifier: 'dash',
    });
  const paint: LottieGradientPaint = {
    caps: mapLottieLineCap(gradient.lc),
    count: gradient.g.p,
    dash: dash.some((value) => value > 0) ? dash : [],
    dashOffset,
    end,
    joints: mapLottieLineJoin(gradient.lj),
    kind: 'gradient',
    miterLimit: miterLimit[0],
    opacity: opacity[0] / 100,
    shape: gradient.t,
    start,
    type: gradient.ty,
    values,
    width: width[0],
    winding: gradient.r === 2 ? 'evenOdd' : 'nonZero',
  };
  context.paints.push(paint);
  bindMutableLottieNumericProperty(gradient.g.k, values, (value) => value, context.rerender, context.import);
  bindMutableLottieNumericProperty(gradient.s, start, (value) => value, context.rerender, context.import);
  bindMutableLottieNumericProperty(gradient.e, end, (value) => value, context.rerender, context.import);
  if (gradient.o !== undefined) {
    bindMutableLottieNumericProperty(
      gradient.o,
      opacity,
      (value) => value,
      () => {
        paint.opacity = opacity[0] / 100;
        context.rerender();
      },
      context.import,
    );
  }
  if (gradient.w !== undefined) {
    bindMutableLottieNumericProperty(
      gradient.w,
      width,
      (value) => value,
      () => {
        paint.width = width[0];
        context.rerender();
      },
      context.import,
    );
  }
  if (gradient.ml2 !== undefined) {
    bindMutableLottieNumericProperty(
      gradient.ml2,
      miterLimit,
      (value) => value,
      () => {
        paint.miterLimit = miterLimit[0];
        context.rerender();
      },
      context.import,
    );
  }
}

/**
 * The two gradient shape items. Both read the same stop encoding and differ only in the paint they push, which is why
 * they share a module rather than each having one.
 */
export function lottieGradientFillShapeItemHandler(context: LottieShapeItemContext): void {
  handleLottieGradientItem(context);
}

export function lottieGradientStrokeShapeItemHandler(context: LottieShapeItemContext): void {
  handleLottieGradientItem(context);
}
