import type { Matrix } from '@flighthq/geometry/contract';
import type { LineScaleMode, ShapeBoundsCommand, ShapeCommandKey } from '@flighthq/shape/contract';

import type { CanvasTextureResolvers } from './CanvasTextureResolver.ts';

export interface CanvasShapeCommand<K extends ShapeCommandKey = ShapeCommandKey> extends ShapeBoundsCommand<K> {
  readonly draw: CanvasShapeHandler;
}

export interface CanvasShapeDrawState {
  canvasTextureResolvers: CanvasTextureResolvers;
  allowSmoothing: boolean;
  hasFill: boolean;
  fillStyle: string | CanvasPattern | CanvasGradient;
  fillMatrix: Matrix | null;
  fillMatrixInverse: Matrix | null;
  hasStroke: boolean;
  lineScaleMode: LineScaleMode;
  strokeStyle: string | CanvasPattern | CanvasGradient;
  strokeWidth: number;
  currentX: number;
  currentY: number;
  hasPendingPath: boolean;
  hasCurrentPoint: boolean;
  subpathStartX: number;
  subpathStartY: number;
  windingRule: CanvasFillRule;
  bitmapSrc: CanvasImageSource | null;
  bitmapW: number;
  bitmapH: number;
  flush: () => void;
}

export type CanvasShapeHandler = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  buf: unknown[],
  i: number,
) => void;
