import type { Matrix } from './Matrix';

export interface CanvasShapeDrawState {
  hasFill: boolean;
  fillStyle: string | CanvasPattern | CanvasGradient;
  fillMatrix: Matrix | null;
  fillMatrixInverse: Matrix | null;
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
