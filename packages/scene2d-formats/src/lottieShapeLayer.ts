import { addNodeChild } from '@flighthq/node/contract';
import { createPath, dashPath, getPathLength } from '@flighthq/path/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import {
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeEndFill,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapePath,
  clearShapeCommands,
  createShape,
} from '@flighthq/shape/contract';
import type {
  DisplayObject,
  LottieGradientPaint,
  LottieImportContext,
  LottieLayerContext,
  LottiePaint,
  LottieShapeGroup,
  LottieShapeItem,
  LottieTransform,
  LottieTrimPathShapeItem,
  Path,
  Shape,
} from '@flighthq/types/contract';

import {
  applyLottieTransform,
  initialLottieValue,
  isAnimatedLottieProperty,
  lottieNumericValue,
  lottieRgba,
  reportLottieExpression,
  reportLottieSkip,
} from './lottieDocument.ts';
import { createLottieGradientMatrix, parseLottieGradient } from './lottieGradientPaint.ts';
import { getLottieShapeItemHandler } from './lottieRegistry.ts';

/**
 * The shape layer: the group walk, and the paint/path render stack every shape item feeds.
 *
 * ★ THE RENDER STACK BELONGS TO THIS LAYER, NOT TO THE DOCUMENT CORE. Shape items produce paints and paths; turning
 * those into shape commands is one interpretation, owned here, so a document of null, solid, image or text layers
 * links none of `@flighthq/shape`'s fill, stroke and gradient builders. `renderLottieShapeState` dispatches on the
 * paint's own kind rather than through the registry, so a build that registers only the fill item still links the
 * gradient builders — the remaining coupling, and the one that would need a paint-renderer seam to break.
 */
export function lottieShapeLayerHandler(context: LottieLayerContext): void {
  appendLottieShapeItems(context.container, context.layer.shapes ?? [], context.import);
}

function appendLottieShapeItems(
  parent: DisplayObject,
  items: readonly Readonly<LottieShapeItem>[],
  context: LottieImportContext,
  name: string | null = null,
): void {
  const group = createDisplayObject({ name });
  const transform = items.find((item) => item.ty === 'tr');
  if (transform?.ty === 'tr') applyLottieTransform(group, transform as Readonly<LottieTransform>, context);
  const shape = createShape();
  const paints: LottiePaint[] = [];
  const paths: Path[] = [];
  const rerender = (): void => renderLottieShapeState(paints, paths, shape);

  for (const item of items) {
    if (item.hd === true) continue;
    if (item.ty === 'gr') {
      const shapeGroup = item as Readonly<LottieShapeGroup>;
      appendLottieShapeItems(group, shapeGroup.it, context, shapeGroup.nm ?? null);
      continue;
    }
    if (item.ty === 'tr') {
      reportLottieExpression(item, context);
      continue;
    }
    const handler = getLottieShapeItemHandler(context.registry, item.ty);
    if (handler !== null) {
      handler({ import: context, item, paints, paths, rerender, shape });
    } else {
      reportLottieSkip(context, 'lottie.unsupported-shape-item', 'appendLottieShapeItems', { shapeType: item.ty });
    }
    reportLottieExpression(item, context);
  }
  applyStaticLottieTrim(items, paths);
  renderLottieShapeState(paints, paths, shape);
  if (paths.length > 0) addNodeChild(group, shape);
  addNodeChild(parent, group);
}

function applyStaticLottieTrim(items: readonly Readonly<LottieShapeItem>[], paths: Path[]): void {
  const raw = items.find((item) => item.ty === 'tm');
  if (raw === undefined) return;
  const trim = raw as Readonly<LottieTrimPathShapeItem>;
  if (isAnimatedLottieProperty(trim.s) || isAnimatedLottieProperty(trim.e) || isAnimatedLottieProperty(trim.o)) return;
  const start = lottieNumericValue(initialLottieValue(trim.s), 1)[0] / 100;
  const end = lottieNumericValue(initialLottieValue(trim.e), 1)[0] / 100;
  const offset = lottieNumericValue(initialLottieValue(trim.o), 1)[0] / 360;
  let visible = (((end - start) % 1) + 1) % 1;
  if (Math.abs(end - start) >= 1) visible = 1;
  for (let i = 0; i < paths.length; i++) {
    if (visible >= 1) continue;
    const path = paths[i];
    const length = getPathLength(path);
    const trimmed = createPath(path.winding);
    if (length > 0 && visible > 0) {
      dashPath(path, [visible * length, (1 - visible) * length], (start + offset) * length, trimmed);
    }
    paths[i] = trimmed;
  }
}

// The current representation restates every local path for every local paint. This preserves
// multiple paints when all paths precede all styles, but it does not yet implement Lottie's general
// render stack: styles scope only over preceding shapes (including shapes in nested groups), and
// repeated styles render in reverse order. That needs a scoped stack rather than another field here.
function renderLottieShapeState(paints: LottiePaint[], paths: Path[], shape: Shape): void {
  clearShapeCommands(shape);
  if (paths.length === 0) return;
  if (paints.length === 0) {
    appendLottieShapePaths(paths, shape, null);
    return;
  }
  for (const paint of paints) {
    if (paint.kind === 'fill') {
      appendShapeBeginFill(shape, lottieRgba(paint.color), paint.opacity);
      appendLottieShapePaths(paths, shape, paint.winding);
      appendShapeEndFill(shape);
    } else if (paint.kind === 'stroke') {
      appendShapeLineStyle(
        shape,
        paint.width,
        lottieRgba(paint.color),
        paint.opacity,
        false,
        'normal',
        paint.caps,
        paint.joints,
        paint.miterLimit,
      );
      appendLottieShapePaths(paths, shape, null, paint.dash, paint.dashOffset);
    } else if (paint.type === 'gf') {
      appendLottieGradientFill(shape, paint);
      appendLottieShapePaths(paths, shape, paint.winding);
      appendShapeEndFill(shape);
    } else {
      appendLottieGradientStroke(shape, paint);
      appendLottieShapePaths(paths, shape, null, paint.dash, paint.dashOffset);
    }
  }
}

function appendLottieShapePaths(
  paths: Path[],
  shape: Shape,
  winding: 'evenOdd' | 'nonZero' | null,
  dash: readonly number[] = [],
  dashOffset = 0,
): void {
  for (const path of paths) {
    let output = path;
    if (dash.length > 0) {
      output = createPath(path.winding);
      dashPath(path, dash.length % 2 === 0 ? dash : [...dash, ...dash], dashOffset, output);
    }
    appendShapePath(shape, output.commands.slice(), output.data.slice(), winding ?? output.winding);
  }
}

function appendLottieGradientFill(shape: Shape, paint: LottieGradientPaint): void {
  const gradient = parseLottieGradient(paint.values, paint.count, paint.opacity);
  appendShapeBeginGradientFill(
    shape,
    paint.shape === 2 ? 'radial' : 'linear',
    gradient.colors,
    gradient.alphas,
    gradient.ratios,
    createLottieGradientMatrix(paint.start, paint.end),
  );
}

function appendLottieGradientStroke(shape: Shape, paint: LottieGradientPaint): void {
  const gradient = parseLottieGradient(paint.values, paint.count, paint.opacity);
  appendShapeLineStyle(shape, paint.width, 0x000000ff, 1, false, 'normal', paint.caps, paint.joints, paint.miterLimit);
  appendShapeLineGradientStyle(
    shape,
    paint.shape === 2 ? 'radial' : 'linear',
    gradient.colors,
    gradient.alphas,
    gradient.ratios,
    createLottieGradientMatrix(paint.start, paint.end),
  );
}
