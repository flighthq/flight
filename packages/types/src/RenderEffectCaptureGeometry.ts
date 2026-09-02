import type { MatrixLike } from './Matrix';
import type { RectangleLike } from './Rectangle';
import type { RenderEffectPadding } from './RenderEffectPadding';

export interface RenderEffectCaptureGeometry {
  readonly bounds: RectangleLike;
  readonly captureTransform: MatrixLike;
  readonly padding: RenderEffectPadding;
  targetHeight: number;
  targetWidth: number;
}
