import {
  appendShapeBeginGradientFill,
  appendShapeEndFill,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
} from '@flighthq/shape/contract';
import type {
  LottieGradientPaint,
  LottieGradientShapeItem,
  LottieShapeItemContext,
  LottieShapePainter,
} from '@flighthq/types/contract';

import {
  bindMutableLottieNumericProperty,
  initialLottieValue,
  isAnimatedLottieProperty,
  lottieNumericValue,
  reportLottieSkip,
} from './lottieDocument.ts';
import { createLottieGradientMatrix, parseLottieGradient } from './lottieGradientPaint.ts';
import { appendLottieDashedShapePaths, appendLottieShapePaths } from './lottieShapePaint.ts';
import { mapLottieLineCap, mapLottieLineJoin } from './lottieStrokeShapeItem.ts';
function handleLottieGradientItem(
  context: LottieShapeItemContext,
  paint: (gradient: Readonly<LottieGradientPaint>) => LottieShapePainter,
): void {
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
  const gradientPaint: LottieGradientPaint = {
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
  context.painters.push(paint(gradientPaint));
  bindMutableLottieNumericProperty(gradient.g.k, values, (value) => value, context.rerender, context.import);
  bindMutableLottieNumericProperty(gradient.s, start, (value) => value, context.rerender, context.import);
  bindMutableLottieNumericProperty(gradient.e, end, (value) => value, context.rerender, context.import);
  if (gradient.o !== undefined) {
    bindMutableLottieNumericProperty(
      gradient.o,
      opacity,
      (value) => value,
      () => {
        gradientPaint.opacity = opacity[0] / 100;
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
        gradientPaint.width = width[0];
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
        gradientPaint.miterLimit = miterLimit[0];
        context.rerender();
      },
      context.import,
    );
  }
}

/**
 * The two gradient shape items. Both read the same stop encoding, which is why they share a module, and each supplies
 * the painter for its own half of it.
 *
 * ★ EACH PAINTER IS A SEPARATE TOP-LEVEL FUNCTION SO THE OTHER CAN GO. Registering the gradient FILL alone links
 * `gradientFillPainter` and leaves `gradientStrokePainter` — with `appendShapeLineGradientStyle` and the dashed path
 * appender behind it — unreferenced and shakeable. Passing the painter in, rather than branching on `paint.type` inside
 * the shared reader, is what keeps that true.
 */
export function lottieGradientFillShapeItemHandler(context: LottieShapeItemContext): void {
  handleLottieGradientItem(context, gradientFillPainter);
}

export function lottieGradientStrokeShapeItemHandler(context: LottieShapeItemContext): void {
  handleLottieGradientItem(context, gradientStrokePainter);
}

function gradientFillPainter(paint: Readonly<LottieGradientPaint>): LottieShapePainter {
  return (shape, paths) => {
    const gradient = parseLottieGradient(paint.values, paint.count, paint.opacity);
    appendShapeBeginGradientFill(
      shape,
      paint.shape === 2 ? 'radial' : 'linear',
      gradient.colors,
      gradient.alphas,
      gradient.ratios,
      createLottieGradientMatrix(paint.start, paint.end),
    );
    appendLottieShapePaths(paths, shape, paint.winding);
    appendShapeEndFill(shape);
  };
}

function gradientStrokePainter(paint: Readonly<LottieGradientPaint>): LottieShapePainter {
  return (shape, paths) => {
    const gradient = parseLottieGradient(paint.values, paint.count, paint.opacity);
    // The solid line style comes first and is immediately overridden by the gradient one: `appendShapeLineStyle` is
    // what sets the width, caps, joints and miter limit, and the gradient call carries only the ramp.
    appendShapeLineStyle(
      shape,
      paint.width,
      0x000000ff,
      1,
      false,
      'normal',
      paint.caps,
      paint.joints,
      paint.miterLimit,
    );
    appendShapeLineGradientStyle(
      shape,
      paint.shape === 2 ? 'radial' : 'linear',
      gradient.colors,
      gradient.alphas,
      gradient.ratios,
      createLottieGradientMatrix(paint.start, paint.end),
    );
    appendLottieDashedShapePaths(paths, shape, null, paint.dash, paint.dashOffset);
  };
}
