import type { EffectPadding } from './EffectPadding.ts';
import type { MatrixLike } from './Matrix.ts';
import type { RectangleLike } from './Rectangle.ts';

export interface EffectCaptureGeometry {
  readonly bounds: RectangleLike;
  readonly captureTransform: MatrixLike;
  readonly padding: EffectPadding;
  targetHeight: number;
  targetWidth: number;
}
