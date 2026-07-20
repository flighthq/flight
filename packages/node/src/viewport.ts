import { createEntity } from '@flighthq/entity';
import { createRectangle } from '@flighthq/geometry';
import type {
  HasBoundsRectangleRuntime,
  MatrixLike,
  NodeTraits,
  Rectangle,
  Viewport,
  ViewportAlign,
} from '@flighthq/types';

import { getNodeRuntime } from './node';

export function computeViewportAlignX(scaledContentWidth: number, viewWidth: number, align: ViewportAlign): number {
  if (align.includes('left')) return 0;
  if (align.includes('right')) return viewWidth - scaledContentWidth;
  return (viewWidth - scaledContentWidth) / 2;
}

export function computeViewportAlignY(scaledContentHeight: number, viewHeight: number, align: ViewportAlign): number {
  if (align.includes('top')) return 0;
  if (align.includes('bottom')) return viewHeight - scaledContentHeight;
  return (viewHeight - scaledContentHeight) / 2;
}

export function computeViewportFillScale(
  contentWidth: number,
  contentHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  return Math.max(viewWidth / contentWidth, viewHeight / contentHeight);
}

export function computeViewportFitScale(
  contentWidth: number,
  contentHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  return Math.min(viewWidth / contentWidth, viewHeight / contentHeight);
}

export function computeViewportRenderTransform<Traits extends object = NodeTraits>(
  out: MatrixLike,
  scene: Viewport<Traits>,
  viewWidth: number,
  viewHeight: number,
): void {
  let contentWidth = 0;
  let contentHeight = 0;

  if (scene.root !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtime = getNodeRuntime(scene.root as any) as unknown as Partial<HasBoundsRectangleRuntime> | undefined;
    if (runtime?.computeLocalBoundsRectangle !== undefined) {
      _tempRectangle.width = 0;
      _tempRectangle.height = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runtime.computeLocalBoundsRectangle(_tempRectangle, scene.root as any);
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
  if (scene.scaleMode === 'noscale') {
    sx = 1;
    sy = 1;
  } else if (scene.scaleMode === 'exactfit') {
    sx = viewWidth / contentWidth;
    sy = viewHeight / contentHeight;
  } else if (scene.scaleMode === 'showall') {
    sx = sy = computeViewportFitScale(contentWidth, contentHeight, viewWidth, viewHeight);
  } else {
    sx = sy = computeViewportFillScale(contentWidth, contentHeight, viewWidth, viewHeight);
  }

  out.a = sx;
  out.b = 0;
  out.c = 0;
  out.d = sy;
  out.tx = computeViewportAlignX(contentWidth * sx, viewWidth, scene.align);
  out.ty = computeViewportAlignY(contentHeight * sy, viewHeight, scene.align);
}

export function createViewport<Traits extends object = NodeTraits>(
  obj?: Readonly<Partial<Viewport<Traits>>>,
): Viewport<Traits> {
  return createEntity({
    align: obj?.align ?? 'topleft',
    root: obj?.root ?? null,
    scaleMode: obj?.scaleMode ?? 'noscale',
  }) as Viewport<Traits>;
}

const _tempRectangle: Rectangle = createRectangle();
