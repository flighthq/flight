import { createRectangle } from '@flighthq/geometry';
import type { HasBoundsRectRuntime, MatrixLike, Rectangle, Scene, SceneAlign, SceneScaleMode } from '@flighthq/types';
import { NullScene } from '@flighthq/types';

import { getSceneNodeRuntime } from './sceneNode';

export function computeSceneAlignX(scaledContentWidth: number, viewWidth: number, align: SceneAlign): number {
  if (align.includes('left')) return 0;
  if (align.includes('right')) return viewWidth - scaledContentWidth;
  return (viewWidth - scaledContentWidth) / 2;
}

export function computeSceneAlignY(scaledContentHeight: number, viewHeight: number, align: SceneAlign): number {
  if (align.includes('top')) return 0;
  if (align.includes('bottom')) return viewHeight - scaledContentHeight;
  return (viewHeight - scaledContentHeight) / 2;
}

export function computeSceneFillScale(
  contentWidth: number,
  contentHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  return Math.max(viewWidth / contentWidth, viewHeight / contentHeight);
}

export function computeSceneFitScale(
  contentWidth: number,
  contentHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  return Math.min(viewWidth / contentWidth, viewHeight / contentHeight);
}

export function computeSceneRenderTransform(
  out: MatrixLike,
  scene: Scene,
  viewWidth: number,
  viewHeight: number,
): void {
  let contentWidth = 0;
  let contentHeight = 0;

  if (scene.root !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtime = getSceneNodeRuntime(scene.root as any) as unknown as Partial<HasBoundsRectRuntime> | undefined;
    if (runtime?.computeLocalBoundsRect !== undefined) {
      _tempRect.width = 0;
      _tempRect.height = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runtime.computeLocalBoundsRect(_tempRect, scene.root as any);
      contentWidth = _tempRect.width;
      contentHeight = _tempRect.height;
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
    sx = sy = computeSceneFitScale(contentWidth, contentHeight, viewWidth, viewHeight);
  } else {
    sx = sy = computeSceneFillScale(contentWidth, contentHeight, viewWidth, viewHeight);
  }

  out.a = sx;
  out.b = 0;
  out.c = 0;
  out.d = sy;
  out.tx = computeSceneAlignX(contentWidth * sx, viewWidth, scene.align);
  out.ty = computeSceneAlignY(contentHeight * sy, viewHeight, scene.align);
}

export function createScene<SceneKind extends symbol = typeof NullScene>(
  obj?: Readonly<Partial<Scene<SceneKind>>>,
): Scene<SceneKind> {
  return {
    align: obj?.align ?? 'topleft',
    root: obj?.root ?? null,
    scaleMode: obj?.scaleMode ?? 'noscale',
  };
}

const _tempRect: Rectangle = createRectangle();
