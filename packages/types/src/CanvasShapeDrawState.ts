import type { CanvasTextureResolvers } from './CanvasTextureResolver';
import type { Matrix } from './Matrix';

export interface CanvasShapeDrawState {
  // The set the fill commands resolve textures through. What a replay can paint is exactly what is
  // registered on this — which is the whole reason it is a value the caller supplies.
  canvasTextureResolvers: CanvasTextureResolvers;
  allowSmoothing: boolean;
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
