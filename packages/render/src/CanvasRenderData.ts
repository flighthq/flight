import type { Renderable } from '@flighthq/contracts';
import { RenderableSymbols as R } from '@flighthq/contracts';
import type { Matrix3 } from '@flighthq/types';

export default class CanvasRenderData {
  readonly source: Renderable;

  cacheAsBitmap: boolean = false;
  localAppearanceID: number = 0;
  localBoundsID: number = 0;
  mask: CanvasRenderData | null = null;
  renderAlpha: number = 0;
  renderTransform: Matrix3;
  worldTransformID: number = 0;

  constructor(source: Renderable) {
    this.source = source;
    this.renderTransform = source[R.worldTransform];
  }

  isDirty() {
    if (
      this.worldTransformID !==
        this.source[R.worldTransformID] /*|| this.appearanceID !== this.source[R.appearanceID]*/ ||
      this.localBoundsID !== this.source[R.localBoundsID]
    ) {
      this.worldTransformID = this.source[R.worldTransformID];
      // this.appearanceID = this.source.appearanceID;
      this.localBoundsID = this.source[R.localBoundsID];
      return true;
    }
    return false;
  }
}
