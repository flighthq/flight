import { transform, version } from '@flighthq/stage';
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
    const appearanceID = version.getAppearanceID(this.source);
    const worldTransformID = version.getWorldTransformID(this.source);
    const localBoundsID = version.getLocalBoundsID(this.source);
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
