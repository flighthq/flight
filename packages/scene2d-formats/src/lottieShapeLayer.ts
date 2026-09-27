import { addNodeChild } from '@flighthq/node/contract';
import { createPath, dashPath, getPathLength } from '@flighthq/path/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import { clearShapeCommands, createShape } from '@flighthq/shape/contract';
import type {
  DisplayObject,
  LottieImportContext,
  LottieLayerContext,
  LottieShapeGroup,
  LottieShapeItem,
  LottieShapePainter,
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
  reportLottieExpression,
  reportLottieSkip,
} from './lottieDocument.ts';
import { getLottieShapeItemHandler } from './lottieRegistry.ts';
import { appendLottieShapePaths } from './lottieShapePaint.ts';

/**
 * The shape layer: the group walk, and the paint/path render stack every shape item feeds.
 *
 * ★ THE GROUP WALK BELONGS TO THIS LAYER; THE PAINTS DO NOT. Shape items produce paths and PAINTERS — closures that
 * draw their own paint — so this module names no fill, stroke or gradient builder at all. That is what makes the cost
 * follow the registration: a build with only the fill item links the fill builders, and a document of null, solid,
 * image or text layers links none of them.
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
  const painters: LottieShapePainter[] = [];
  const paths: Path[] = [];
  const rerender = (): void => renderLottieShapeState(painters, paths, shape);

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
      handler({ import: context, item, painters, paths, rerender, shape });
    } else {
      reportLottieSkip(context, 'lottie.unsupported-shape-item', 'appendLottieShapeItems', { shapeType: item.ty });
    }
    reportLottieExpression(item, context);
  }
  applyStaticLottieTrim(items, paths);
  renderLottieShapeState(painters, paths, shape);
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

/**
 * Draws the group's current paints over its current paths.
 *
 * ★ THE LAYER NAMES NO PAINT. It used to `switch` over `paint.kind` — solid fill, solid stroke, gradient fill, gradient
 * stroke — which put every one of `@flighthq/shape`'s builders into any build that read a shape layer, however few items
 * it registered. Each item now supplies the closure that draws its own paint; this function owns only the ORDER they
 * run in and the unpainted case, which are the two things no single item can decide.
 *
 * The representation still restates every local path for every local paint. That preserves multiple paints when all
 * paths precede all styles, but it is not Lottie's general render stack: styles scope only over preceding shapes
 * (including shapes in nested groups), and repeated styles render in reverse order. That needs a scoped stack rather
 * than another field here.
 */
function renderLottieShapeState(painters: readonly LottieShapePainter[], paths: Path[], shape: Shape): void {
  clearShapeCommands(shape);
  if (paths.length === 0) return;
  if (painters.length === 0) {
    appendLottieShapePaths(paths, shape, null);
    return;
  }
  for (const painter of painters) painter(shape, paths);
}
