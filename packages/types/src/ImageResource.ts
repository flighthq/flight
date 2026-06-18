import type { AlphaType } from './AlphaType';
import type { Entity } from './Entity';
import type { PixelFormat } from './PixelFormat';

/**
 * A backend-agnostic image resource: pixel dimensions, a monotonically increasing version, and up to
 * two interchangeable representations of the same pixels — an `source` element the GPU/Canvas backends
 * draw or upload directly, and raw CPU `data` for the portable / generated path. Either may be null;
 * a freshly loaded image is element-only, a freshly generated `Surface` is data-only, and a resource
 * may carry both once one is derived from the other. Renderers own the GPU texture derived from this
 * resource (keyed per render state); the resource itself holds no GPU handle. After the underlying
 * pixels change, bump `version` (see `invalidateImageResource`) so backends know to re-upload.
 * `Surface` narrows `data` to non-null and adds `colorSpace` plus the pixel-manipulation API.
 *
 * Reserved (not yet added): a `compressed` slot for KTX2/Basis compressed payloads, which `data`
 * (uncompressed `Uint8ClampedArray`) cannot represent.
 */
export interface ImageResource extends Entity {
  /**
   * How `data` (and the element on read-back) encodes alpha. Defaults to `straight`, which is what
   * browsers and the surface pixel API produce; renderers premultiply on GPU upload. See `AlphaType`.
   */
  alphaType: AlphaType;
  /**
   * Raw pixel bytes laid out per `format`, or null for an element-only resource whose pixels live in
   * `source`. Owned by the resource; `disposeImageResource` releases it for GC.
   */
  data: Uint8ClampedArray<ArrayBuffer> | null;
  /**
   * Layout of `data` when present, and the canonical raster format an element-backed resource yields
   * on read-back. Defaults to `rgba8unorm` (what browsers produce). See `PixelFormat`.
   */
  format: PixelFormat;
  /** Pixel height. 0 until an element or data sets it. */
  height: number;
  /**
   * Element representation the GPU/Canvas backends upload or draw directly (image, canvas,
   * ImageBitmap, …). Null for data-only resources such as a freshly generated `Surface`.
   */
  source: CanvasImageSource | null;
  /** Bumped whenever the pixels change; backends compare it to decide when to re-upload. */
  version: number;
  /** Pixel width. 0 until an element or data sets it. */
  width: number;
}
