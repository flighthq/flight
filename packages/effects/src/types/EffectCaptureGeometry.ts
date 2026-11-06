import type { MatrixLike, RectangleLike } from '@flighthq/geometry/contract';
import type { EffectPadding } from '@flighthq/render/contract';

export interface EffectCaptureGeometry {
  readonly bounds: RectangleLike;
  readonly captureTransform: MatrixLike;
  readonly padding: EffectPadding;
  targetHeight: number;
  targetWidth: number;
}
