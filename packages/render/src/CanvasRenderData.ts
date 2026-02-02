import type { Matrix2D } from '@flighthq/math';
import type BitmapDrawable from '@flighthq/scene/BitmapDrawable';
import { Renderable as R } from '@flighthq/scene/Renderable';

export default class CanvasRenderData {
  readonly source: BitmapDrawable;

  cacheAsBitmap: boolean = false;
  localAppearanceID: number = 0;
  localBoundsID: number = 0;
  mask: CanvasRenderData | null = null;
  renderAlpha: number = 0;
  renderTransform: Matrix2D;
  worldTransformID: number = 0;

  constructor(source: BitmapDrawable) {
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
