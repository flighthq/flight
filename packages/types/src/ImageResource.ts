import type { AlphaType } from './AlphaType';
import type { Entity } from './Entity';
import type { ImageResourceCompressed } from './ImageResourceCompressed';
import type { PixelFormat } from './PixelFormat';

/**
 * A backend-agnostic image resource: pixel dimensions, a monotonically increasing version, and up to
 * three interchangeable representations of the same pixels — an `source` element the GPU/Canvas
 * backends draw or upload directly, raw CPU `data` for the portable / generated path, and a
 * `compressed` block-compressed payload a GPU backend uploads to a compressed texture. Any may be
 * null; a freshly loaded image is element-only, a freshly generated `Surface` is data-only, a parsed
 * KTX2/DDS/Basis container is compressed-only, and a resource may carry more than one once one is
 * derived from another. Renderers own the GPU texture derived from this resource (keyed per render
 * state); the resource itself holds no GPU handle. After the underlying pixels change, bump `version`
 * (see `invalidateImageResource`) so backends know to re-upload. `Surface` narrows `data` to non-null
 * and adds `colorSpace` plus the pixel-manipulation API.
 */
export interface ImageResource extends Entity {
  /**
   * How `data` (and the element on read-back) encodes alpha. Defaults to `straight`, which is what
   * browsers and the surface pixel API produce; renderers premultiply on GPU upload. See `AlphaType`.
   */
  alphaType: AlphaType;
  /**
   * A block-compressed (KTX2/DDS/Basis) pixel payload — the representation `data` cannot hold. Null
   * for the common uncompressed resource. A GPU backend uploads it to a compressed texture; a
   * Canvas/DOM backend has no compressed path and ignores it. See `ImageResourceCompressed`.
   */
  compressed: ImageResourceCompressed | null;
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
