import { derived } from '@flighthq/stage';
import type { DisplayObject, Matrix2D } from '@flighthq/types';

export default class CanvasRenderData {
  readonly source: DisplayObject;

  cacheAsBitmap: boolean = false;
  localAppearanceID: number = -1;
  localBoundsID: number = -1;
  mask: CanvasRenderData | null = null;
  renderAlpha: number = -1;
  renderTransform: Matrix2D;
  worldTransformID: number = -1;

  constructor(source: DisplayObject) {
    this.source = source;
    this.renderTransform = derived.getCurrentWorldTransform(source);
  }

  isDirty() {
    const state = derived.getDerivedState(this.source);
    if (
      this.worldTransformID !== state.worldTransformID /*|| this.appearanceID !== this.source[R.appearanceID]*/ ||
      this.localBoundsID !== state.localBoundsID
    ) {
      this.worldTransformID = state.worldTransformID;
      // this.appearanceID = this.source.appearanceID;
      this.localBoundsID = state.localBoundsID;
      return true;
    }
    return false;
  }
}
