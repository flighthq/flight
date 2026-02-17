import { revision, transform } from '@flighthq/stage';
import type { DisplayObject, Matrix3x2 } from '@flighthq/types';

export default class CanvasRenderData {
  readonly source: DisplayObject;

  appearanceID: number = -1;
  cacheAsBitmap: boolean = false;
  localBoundsID: number = -1;
  mask: CanvasRenderData | null = null;
  renderAlpha: number = -1;
  renderTransform: Matrix3x2;
  worldTransformID: number = -1;

  constructor(source: DisplayObject) {
    this.source = source;
    this.renderTransform = transform.getWorldTransform(source);
  }

  isDirty() {
    const appearanceID = revision.getAppearanceID(this.source);
    const worldTransformID = revision.getWorldTransformID(this.source);
    const localBoundsID = revision.getLocalBoundsID(this.source);
    if (
      this.appearanceID !== appearanceID ||
      this.worldTransformID !== worldTransformID ||
      this.localBoundsID !== localBoundsID
    ) {
      this.appearanceID = appearanceID;
      this.worldTransformID = worldTransformID;
      this.localBoundsID = localBoundsID;
      return true;
    }
    return false;
  }
}
