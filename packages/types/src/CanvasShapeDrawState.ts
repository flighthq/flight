import type { CanvasTextureResolvers } from './CanvasTextureResolver.ts';
import type { Matrix } from './Matrix.ts';
import type { LineScaleMode } from './ShapeCommand.ts';

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
