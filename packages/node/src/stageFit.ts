import { createRectangle } from '@flighthq/geometry';
import type {
  HasBoundsRectangleRuntime,
  MatrixLike,
  Node,
  NodeTraits,
  Rectangle,
  ViewportAlign,
  ViewportScaleMode,
} from '@flighthq/types';

import { getNodeRuntime } from './node';

// The structural fit context these functions read: a root node plus how it maps into the view. `Stage`
// satisfies it (its `align`/`scaleMode`/`root` fields); kept structural and generic so the fit math stays in
// `@flighthq/node` without depending on the display-object `Stage` type.
export interface StageFitContext<Traits extends object = NodeTraits> {
  align: ViewportAlign;
  root: Node<Traits> | null;
  scaleMode: ViewportScaleMode;
}

// Horizontal alignment offset of scaled content within the view, per the `align` anchor.
export function computeStageFitAlignX(scaledContentWidth: number, viewWidth: number, align: ViewportAlign): number {
  if (align.includes('left')) return 0;
  if (align.includes('right')) return viewWidth - scaledContentWidth;
  return (viewWidth - scaledContentWidth) / 2;
}

// Vertical alignment offset of scaled content within the view, per the `align` anchor.
export function computeStageFitAlignY(scaledContentHeight: number, viewHeight: number, align: ViewportAlign): number {
  if (align.includes('top')) return 0;
  if (align.includes('bottom')) return viewHeight - scaledContentHeight;
  return (viewHeight - scaledContentHeight) / 2;
}

// Uniform scale that fills the view (covers it, cropping overflow) — the larger of the axis ratios.
export function computeStageFitFillScale(
  contentWidth: number,
  contentHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  return Math.max(viewWidth / contentWidth, viewHeight / contentHeight);
}

// Uniform scale that fits the content inside the view (letter/pillarboxing) — the smaller of the axis ratios.
export function computeStageFitScale(
  contentWidth: number,
  contentHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  return Math.min(viewWidth / contentWidth, viewHeight / contentHeight);
}

// Writes the scale-and-align matrix that maps a stage's `root` content into a `viewWidth`×`viewHeight` view,
// per its `scaleMode` (`noscale`/`exactfit`/`showall`/`noborder`) and `align`. Reads the root's local bounds
// through its runtime; an empty or unmeasurable root yields identity. This is the stage-fit transform the 2D
// present pass applies before drawing the tree.
export function computeStageFitTransform<Traits extends object = NodeTraits>(
  out: MatrixLike,
  stage: Readonly<StageFitContext<Traits>>,
  viewWidth: number,
  viewHeight: number,
): void {
  let contentWidth = 0;
  let contentHeight = 0;

  if (stage.root !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtime = getNodeRuntime(stage.root as any) as unknown as Partial<HasBoundsRectangleRuntime> | undefined;
    if (runtime?.computeLocalBoundsRectangle !== undefined) {
      _tempRectangle.width = 0;
      _tempRectangle.height = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runtime.computeLocalBoundsRectangle(_tempRectangle, stage.root as any);
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
  if (stage.scaleMode === 'noscale') {
    sx = 1;
    sy = 1;
  } else if (stage.scaleMode === 'exactfit') {
    sx = viewWidth / contentWidth;
    sy = viewHeight / contentHeight;
  } else if (stage.scaleMode === 'showall') {
    sx = sy = computeStageFitScale(contentWidth, contentHeight, viewWidth, viewHeight);
  } else {
    sx = sy = computeStageFitFillScale(contentWidth, contentHeight, viewWidth, viewHeight);
  }

  out.a = sx;
  out.b = 0;
  out.c = 0;
  out.d = sy;
  out.tx = computeStageFitAlignX(contentWidth * sx, viewWidth, stage.align);
  out.ty = computeStageFitAlignY(contentHeight * sy, viewHeight, stage.align);
}

const _tempRectangle: Rectangle = createRectangle();
