import type { Entity } from './Entity';

/**
 * A backend-agnostic image resource: pixel dimensions, a monotonically increasing version, and an
 * optional element representation (`src`). Renderers own the GPU texture derived from this resource
 * (keyed per render state); the resource itself holds no GPU handle. After the underlying pixels
 * change, bump `version` (see `invalidateImageSource`) so backends know to re-upload. `Surface`
 * extends this with raw pixel `data` for the portable / generated path.
 */
export interface ImageSource extends Entity {
  /** Pixel height. 0 until an element or data sets it. */
  height: number;
  /**
   * Element representation the GPU/Canvas backends upload or draw directly (image, canvas,
   * ImageBitmap, …). Null for data-only sources such as a freshly generated `Surface`.
   */
  src: CanvasImageSource | null;
  /** Bumped whenever the pixels change; backends compare it to decide when to re-upload. */
  version: number;
  /** Pixel width. 0 until an element or data sets it. */
  width: number;
}
