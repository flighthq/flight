import type { EffectPadding } from './EffectPadding';
import type { MatrixLike } from './Matrix';
import type { RectangleLike } from './Rectangle';

export interface EffectCaptureGeometry {
  readonly bounds: RectangleLike;
  readonly captureTransform: MatrixLike;
  readonly padding: EffectPadding;
  targetHeight: number;
  targetWidth: number;
}
