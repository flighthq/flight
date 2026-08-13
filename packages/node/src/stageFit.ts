import { createRectangle } from '@flighthq/geometry/contract';
import type {
  BoundsNodeAny,
  HasBoundsRectangleRuntime,
  MatrixLike,
  NodeTraits,
  Rectangle,
  Scene2DFitContext,
  ViewportAlign,
} from '@flighthq/types/contract';

import { getNodeRuntime } from './node';

// The structural fit context these functions read: a root node plus how it maps into the view. `Scene2D`
// satisfies it (its `align`/`scaleMode`/`root` fields); kept structural and generic so the fit math stays in
// `@flighthq/node` without depending on the display-object `Scene2D` type.
// Horizontal alignment offset of scaled content within the view, per the `align` anchor.
export function computeScene2DFitAlignX(scaledContentWidth: number, viewWidth: number, align: ViewportAlign): number {
  if (align.includes('left')) return 0;
  if (align.includes('right')) return viewWidth - scaledContentWidth;
  return (viewWidth - scaledContentWidth) / 2;
}

// Vertical alignment offset of scaled content within the view, per the `align` anchor.
export function computeScene2DFitAlignY(scaledContentHeight: number, viewHeight: number, align: ViewportAlign): number {
  if (align.includes('top')) return 0;
  if (align.includes('bottom')) return viewHeight - scaledContentHeight;
  return (viewHeight - scaledContentHeight) / 2;
}

// Uniform scale that fills the view (covers it, cropping overflow) — the larger of the axis ratios.
export function computeScene2DFitFillScale(
  contentWidth: number,
  contentHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  return Math.max(viewWidth / contentWidth, viewHeight / contentHeight);
}

// Uniform scale that fits the content inside the view (letter/pillarboxing) — the smaller of the axis ratios.
export function computeScene2DFitScale(
  contentWidth: number,
  contentHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  return Math.min(viewWidth / contentWidth, viewHeight / contentHeight);
}

// Writes the scale-and-align matrix that maps a scene2d's `root` content into a `viewWidth`×`viewHeight` view,
// per its `scaleMode` (`noscale`/`exactfit`/`showall`/`noborder`) and `align`. Reads the root's local bounds
// through its runtime; an empty or unmeasurable root yields identity. This is the scene2d-fit transform the 2D
// present pass applies before drawing the tree.
export function computeScene2DFitTransform<Traits extends object = NodeTraits>(
  out: MatrixLike,
  scene2d: Readonly<Scene2DFitContext<Traits>>,
  viewWidth: number,
  viewHeight: number,
): void {
  let contentX = 0;
  let contentY = 0;
  let contentWidth = 0;
  let contentHeight = 0;

  if (scene2d.root !== null) {
    const runtime = getNodeRuntime(scene2d.root) as Partial<HasBoundsRectangleRuntime>;
    if (runtime?.computeLocalBoundsRectangle !== undefined) {
      _tempRectangle.x = 0;
      _tempRectangle.y = 0;
      _tempRectangle.width = 0;
      _tempRectangle.height = 0;
      runtime.computeLocalBoundsRectangle(_tempRectangle, scene2d.root as BoundsNodeAny);
      contentX = _tempRectangle.x;
      contentY = _tempRectangle.y;
      contentWidth = _tempRectangle.width;
      contentHeight = _tempRectangle.height;
    }
  }

  if (contentWidth === 0 || contentHeight === 0) {
    out.a = 1;
    out.b = 0;
    out.c = 0;
    out.d = 1;
    out.tx = 0;
    out.ty = 0;
    return;
  }

  let sx: number;
  let sy: number;
  if (scene2d.scaleMode === 'noscale') {
    sx = 1;
    sy = 1;
  } else if (scene2d.scaleMode === 'exactfit') {
    sx = viewWidth / contentWidth;
    sy = viewHeight / contentHeight;
  } else if (scene2d.scaleMode === 'showall') {
    sx = sy = computeScene2DFitScale(contentWidth, contentHeight, viewWidth, viewHeight);
  } else {
    sx = sy = computeScene2DFitFillScale(contentWidth, contentHeight, viewWidth, viewHeight);
  }

  out.a = sx;
  out.b = 0;
  out.c = 0;
  out.d = sy;
  out.tx = computeScene2DFitAlignX(contentWidth * sx, viewWidth, scene2d.align) - contentX * sx;
  out.ty = computeScene2DFitAlignY(contentHeight * sy, viewHeight, scene2d.align) - contentY * sy;
}

const _tempRectangle: Rectangle = createRectangle();
