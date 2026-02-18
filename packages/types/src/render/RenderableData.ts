import type { Matrix3x2 } from '@flighthq/types';

import type Renderable from './Renderable';

export default interface RenderableData {
  appearanceID: number;
  cacheAsBitmap: boolean;
  localBoundsID: number;
  mask: RenderableData | null;
  renderAlpha: number;
  renderTransform: Matrix3x2;
  readonly source: Renderable;
  worldTransformID: number;
}
