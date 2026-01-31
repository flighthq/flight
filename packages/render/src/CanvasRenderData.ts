import type { Matrix2D } from '@flighthq/math';
import type BitmapDrawable from '@flighthq/scene/BitmapDrawable';
import { internal as $ } from '@flighthq/scene/internal/Renderable';

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
    this.renderTransform = source[$._worldTransform];
  }

  isDirty() {
    if (
      this.worldTransformID !==
        this.source[$._worldTransformID] /*|| this.appearanceID !== this.source[$._appearanceID]*/ ||
      this.localBoundsID !== this.source[$._localBoundsID]
    ) {
      this.worldTransformID = this.source[$._worldTransformID];
      // this.appearanceID = this.source.appearanceID;
      this.localBoundsID = this.source[$._localBoundsID];
      return true;
    }
    return false;
  }
}
