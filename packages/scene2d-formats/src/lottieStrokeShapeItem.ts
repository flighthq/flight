import type { LottieShapeItemContext, LottieStrokePaint, LottieStrokeShapeItem } from '@flighthq/types/contract';

import {
  bindMutableLottieNumericProperty,
  initialLottieValue,
  isAnimatedLottieProperty,
  lottieNumericValue,
  reportLottieSkip,
} from './lottieDocument.ts';
export function lottieStrokeShapeItemHandler(context: LottieShapeItemContext): void {
  const stroke = context.item as Readonly<LottieStrokeShapeItem>;
  const color = lottieNumericValue(initialLottieValue(stroke.c), 3);
  const opacity = [lottieNumericValue(initialLottieValue(stroke.o), 1)[0] / 100];
  const width = [lottieNumericValue(initialLottieValue(stroke.w), 1)[0]];
  const miterLimit = [
    stroke.ml2 === undefined ? (stroke.ml ?? 4) : lottieNumericValue(initialLottieValue(stroke.ml2), 1)[0],
  ];
  const dashEntries = stroke.d ?? [];
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
    reportLottieSkip(context.import, 'lottie.unsupported-shape-modifier', 'lottieStrokeShapeItemHandler', {
      modifier: 'dash',
    });
  const paint: LottieStrokePaint = {
    caps: mapLottieLineCap(stroke.lc),
    color,
    dash: dash.some((value) => value > 0) ? dash : [],
    dashOffset,
    joints: mapLottieLineJoin(stroke.lj),
    kind: 'stroke',
    miterLimit: miterLimit[0],
    opacity: opacity[0],
    width: width[0],
  };
  context.paints.push(paint);
  bindMutableLottieNumericProperty(stroke.c, color, (value) => value, context.rerender, context.import);
  bindMutableLottieNumericProperty(
    stroke.o,
    opacity,
    (value) => value / 100,
    () => {
      paint.opacity = opacity[0];
      context.rerender();
    },
    context.import,
  );
  bindMutableLottieNumericProperty(
    stroke.w,
    width,
    (value) => value,
    () => {
      paint.width = width[0];
      context.rerender();
    },
    context.import,
  );
  if (stroke.ml2 !== undefined) {
    bindMutableLottieNumericProperty(
      stroke.ml2,
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

export function mapLottieLineCap(value: 1 | 2 | 3 | undefined): 'none' | 'round' | 'square' {
  return value === 2 ? 'round' : value === 3 ? 'square' : 'none';
}

export function mapLottieLineJoin(value: 1 | 2 | 3 | undefined): 'bevel' | 'miter' | 'round' {
  return value === 2 ? 'round' : value === 3 ? 'bevel' : 'miter';
}
