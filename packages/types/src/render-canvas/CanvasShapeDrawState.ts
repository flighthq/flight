import type { Matrix3x2 } from '../geometry/Matrix3x2';

export interface CanvasShapeDrawState {
  hasFill: boolean;
  fillStyle: string | CanvasPattern | CanvasGradient;
  fillMatrix: Matrix3x2 | null;
  fillMatrixInverse: Matrix3x2 | null;
  hasStroke: boolean;
  strokeStyle: string | CanvasPattern | CanvasGradient;
  strokeWidth: number;
  hasPendingPath: boolean;
  hasCurrentPoint: boolean;
  windingRule: CanvasFillRule;
  bitmapSrc: CanvasImageSource | null;
  bitmapW: number;
  bitmapH: number;
  flush: () => void;
}
